using System.IO;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Infrastructure.Input;
using IndustriasDoradas.Desktop.Presentation.Input;
using IndustriasDoradas.Desktop.Presentation.ViewModels;
using IndustriasDoradas.Desktop.Presentation.Views;

namespace IndustriasDoradas.Desktop.Tests.Presentation;

[TestClass]
public sealed class KeyboardShortcutSettingsWindowTests
{
    private string directory = string.Empty;

    [TestInitialize]
    public void CreateDirectory() => directory = LoginViewTestHost.NewTemporaryDirectory();

    [TestCleanup]
    public void DeleteDirectory()
    {
        if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
    }

    [TestMethod]
    public void CapturedKeyIsVisibleButAppliesOnlyAfterSave()
    {
        var store = new KeyboardShortcutPreferenceStore(directory);
        var viewModel = new KeyboardShortcutSettingsViewModel(store);
        KeyboardShortcutItemViewModel sweep = Item(viewModel, KeyboardShortcutAction.OpenSweep);

        Assert.IsFalse(viewModel.CaptureKey("F2", false), "Sin pulsar «Cambiar» no se escucha ninguna tecla.");
        sweep.ChangeCommand.Execute(null);
        Assert.IsTrue(sweep.IsListening);
        Assert.AreEqual("Pulse una tecla…", sweep.KeysText);
        Assert.IsFalse(viewModel.SaveCommand.CanExecute(null));

        Assert.IsTrue(viewModel.CaptureKey("F2", false));

        Assert.IsFalse(sweep.IsListening);
        Assert.AreEqual("F2", sweep.KeysText);
        Assert.IsTrue(sweep.IsUnsaved);
        Assert.AreEqual("B", store.Current.KeysFor(KeyboardShortcutAction.OpenSweep).Single(),
            "Operación no cambia hasta guardar.");

        bool saved = false;
        viewModel.Saved += (_, _) => saved = true;
        viewModel.SaveCommand.Execute(null);

        Assert.IsTrue(saved);
        Assert.AreEqual("F2", store.Current.KeysFor(KeyboardShortcutAction.OpenSweep).Single());
        Assert.AreEqual("F2", new KeyboardShortcutPreferenceStore(directory).Current
            .KeysFor(KeyboardShortcutAction.OpenSweep).Single());
    }

    [TestMethod]
    public void CollisionAndReservedKeysAreRejectedAndListeningContinues()
    {
        var viewModel = new KeyboardShortcutSettingsViewModel(new KeyboardShortcutPreferenceStore(directory));
        KeyboardShortcutItemViewModel sweep = Item(viewModel, KeyboardShortcutAction.OpenSweep);
        sweep.ChangeCommand.Execute(null);

        Assert.IsTrue(viewModel.CaptureKey("Add", false));
        Assert.IsTrue(sweep.IsListening);
        StringAssert.Contains(viewModel.Status, "Agregar una cajuela");

        Assert.IsTrue(viewModel.CaptureKey("Tab", false));
        Assert.IsTrue(sweep.IsListening);
        StringAssert.Contains(viewModel.Status, "Tab");

        Assert.IsFalse(viewModel.CaptureKey("F4", hasBlockingModifier: true),
            "Alt+F4 no se consume: Windows debe poder cerrar la ventana.");
        Assert.IsTrue(sweep.IsListening);

        Assert.IsTrue(viewModel.CaptureKey("F3", false, isRepeat: true));
        Assert.IsTrue(sweep.IsListening, "Una tecla mantenida no se toma como asignación.");

        Assert.IsTrue(viewModel.CaptureKey("Escape", false));
        Assert.IsFalse(sweep.IsListening, "Esc fuera de Cancelar abandona el cambio.");
        Assert.AreEqual("B", sweep.KeysText);
        Assert.IsFalse(viewModel.HasChanges);
    }

    [TestMethod]
    public void RestoreDefaultsIsADraftUntilSave()
    {
        var store = new KeyboardShortcutPreferenceStore(directory);
        Assert.IsTrue(store.Save(KeyboardShortcutMap.Default.With(KeyboardShortcutAction.OpenSweep, "F2")));
        var viewModel = new KeyboardShortcutSettingsViewModel(store);

        viewModel.RestoreDefaultsCommand.Execute(null);

        Assert.AreEqual("B", Item(viewModel, KeyboardShortcutAction.OpenSweep).KeysText);
        Assert.AreEqual("F2", store.Current.KeysFor(KeyboardShortcutAction.OpenSweep).Single());
        viewModel.SaveCommand.Execute(null);
        Assert.IsTrue(store.Current.HasSameBindings(KeyboardShortcutMap.Default));
    }

    [STATestMethod]
    public void SettingsOpensDialogAndListeningKeysDoNotCloseIt()
    {
        if (System.Windows.Application.Current is null) new App().InitializeComponent();
        LoginViewTestHost.KeepSharedApplicationAlive();
        var store = new KeyboardShortcutPreferenceStore(directory);

        var settingsView = new SettingsView { DataContext = new SettingsViewModel(null, store) };
        settingsView.Measure(new Size(1280, 720));
        settingsView.Arrange(new Rect(0, 0, 1280, 720));
        settingsView.UpdateLayout();
        var configure = (Button)settingsView.FindName("ConfigureShortcutsButton");
        Assert.AreEqual("Configurar controles", configure.Content);
        Assert.IsTrue(configure.IsEnabled);

        var viewModel = ((SettingsViewModel)settingsView.DataContext).CreateShortcutSettings()!;
        var dialog = new KeyboardShortcutSettingsWindow
        {
            ShowInTaskbar = false,
            ShowActivated = false,
            DataContext = viewModel,
        };
        try
        {
            dialog.Show();
            dialog.UpdateLayout();
            string[] names = FindVisualChildren<Button>(dialog).Select(AutomationProperties.GetName).ToArray();
            Assert.AreEqual(6, names.Count(name => name.StartsWith("Cambiar la tecla de ", StringComparison.Ordinal)));
            Assert.IsFalse(((Button)dialog.FindName("SaveButton")).IsEnabled, "Sin cambios no hay nada que guardar.");

            Item(viewModel, KeyboardShortcutAction.Confirm).ChangeCommand.Execute(null);
            Assert.IsTrue(dialog.HandleKey(Key.Escape, ModifierKeys.None, false),
                "En modo escucha Esc no cierra el diálogo.");
            Assert.IsTrue(dialog.IsVisible);

            Item(viewModel, KeyboardShortcutAction.OpenSweep).ChangeCommand.Execute(null);
            Assert.IsTrue(dialog.HandleKey(Key.F2, ModifierKeys.None, false));
            dialog.UpdateLayout();
            Assert.IsTrue(((Button)dialog.FindName("SaveButton")).IsEnabled);

            viewModel.SaveCommand.Execute(null);
            Assert.IsFalse(dialog.IsVisible, "Guardar aplica y cierra el diálogo.");
            Assert.AreEqual("F2", store.Current.KeysFor(KeyboardShortcutAction.OpenSweep).Single());
        }
        finally
        {
            dialog.Close();
        }
    }

    [STATestMethod]
    public void ShortcutsAreIgnoredWhileTypingInFormFields()
    {
        if (System.Windows.Application.Current is null) new App().InitializeComponent();
        LoginViewTestHost.KeepSharedApplicationAlive();
        var reason = new TextBox();
        var search = new ComboBox { IsEditable = true };
        var password = new PasswordBox();
        var date = new DatePicker();
        var readOnly = new TextBox { IsReadOnly = true };
        var button = new Button { Content = "Agregar" };
        var panel = new StackPanel { Children = { reason, search, password, date, readOnly, button } };
        var window = new Window
        {
            Content = panel,
            Width = 400,
            Height = 400,
            ShowInTaskbar = false,
            ShowActivated = true,
            WindowStyle = WindowStyle.None,
        };
        var decisions = new Dictionary<object, bool>();
        panel.AddHandler(UIElement.PreviewKeyDownEvent, new KeyEventHandler((_, e) =>
            decisions[e.OriginalSource] = KeyboardShortcutFocusPolicy.ShouldIgnore(e)));
        try
        {
            window.Show();
            window.Activate();
            window.UpdateLayout();
            // El foco real queda en el botón; cada caso solo cambia el control donde nace la tecla.
            Keyboard.Focus(button);
            foreach (UIElement element in new UIElement[] { reason, search, password, date, readOnly, button })
            {
                element.RaiseEvent(new KeyEventArgs(
                    Keyboard.PrimaryDevice,
                    PresentationSource.FromVisual(element)!,
                    0,
                    Key.B)
                {
                    RoutedEvent = UIElement.PreviewKeyDownEvent,
                });
            }

            Assert.IsTrue(decisions[reason], "Motivo de corrección o cualquier TextBox.");
            Assert.IsTrue(decisions[search], "Búsqueda editable.");
            Assert.IsTrue(decisions[password]);
            Assert.IsTrue(decisions[date], "Selector de fecha u hora.");
            Assert.IsFalse(decisions[readOnly], "Un texto de solo lectura no captura teclas.");
            Assert.IsFalse(decisions[button], "Sobre un botón el atajo sí se ejecuta.");
            Assert.IsTrue(KeyboardShortcutFocusPolicy.HasBlockingModifier(ModifierKeys.Control));
            Assert.IsTrue(KeyboardShortcutFocusPolicy.HasBlockingModifier(ModifierKeys.Alt));
            Assert.IsFalse(KeyboardShortcutFocusPolicy.HasBlockingModifier(ModifierKeys.Shift),
                "Mayús es necesaria para + en algunos teclados.");
        }
        finally
        {
            window.Close();
        }
    }

    private static KeyboardShortcutItemViewModel Item(
        KeyboardShortcutSettingsViewModel viewModel,
        KeyboardShortcutAction action) =>
        viewModel.Items.Single(item => item.Action == action);

    private static IEnumerable<T> FindVisualChildren<T>(DependencyObject parent)
        where T : DependencyObject
    {
        for (int index = 0; index < VisualTreeHelper.GetChildrenCount(parent); index++)
        {
            DependencyObject child = VisualTreeHelper.GetChild(parent, index);
            if (child is T match) yield return match;
            foreach (T descendant in FindVisualChildren<T>(child)) yield return descendant;
        }
    }
}
