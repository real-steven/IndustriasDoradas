using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using IndustriasDoradas.Desktop.Presentation.ViewModels;
using IndustriasDoradas.Desktop.Presentation.Views;

namespace IndustriasDoradas.Desktop.Tests.Presentation;

[TestClass]
public sealed class CloseStationConfirmationTests
{
    [TestMethod]
    public void CancelDoesNotCloseStation()
    {
        int closes = 0;
        var viewModel = new CloseStationConfirmationViewModel(() => { closes++; return Task.CompletedTask; });
        bool cancelled = false;
        viewModel.Cancelled += (_, _) => cancelled = true;

        viewModel.CancelCommand.Execute(null);

        Assert.IsTrue(cancelled);
        Assert.IsTrue(viewModel.WasCancelled);
        Assert.AreEqual(0, closes);
    }

    [TestMethod]
    public async Task ConfirmClosesStationOnceEvenWhenPressedTwice()
    {
        int closes = 0;
        var pending = new TaskCompletionSource();
        var viewModel = new CloseStationConfirmationViewModel(() => { closes++; return pending.Task; });
        int completions = 0;
        viewModel.Completed += (_, _) => completions++;

        Task first = viewModel.ConfirmCommand.ExecuteAsync(null);
        Assert.IsTrue(viewModel.IsClosing, "Mientras se cierra se muestra el progreso.");
        Assert.IsFalse(viewModel.ConfirmCommand.CanExecute(null), "El botón se desactiva al pulsarlo.");
        Assert.IsFalse(viewModel.CancelCommand.CanExecute(null), "No se puede cancelar a medias.");
        Assert.IsFalse(viewModel.TryCancel());

        Task second = viewModel.ConfirmCommand.ExecuteAsync(null);
        pending.SetResult();
        await Task.WhenAll(first, second);
        await viewModel.ConfirmCommand.ExecuteAsync(null);

        Assert.AreEqual(1, closes);
        Assert.AreEqual(1, completions);
        Assert.IsFalse(viewModel.IsClosing);
        Assert.IsFalse(viewModel.WasCancelled);
    }

    [STATestMethod]
    public void DialogStartsOnCancelAndHasNoDefaultButton()
    {
        WithDialog((dialog, _, _) =>
        {
            var cancel = (Button)dialog.FindName("CancelButton");
            var confirm = (Button)dialog.FindName("ConfirmButton");

            Assert.AreSame(cancel, FocusManager.GetFocusedElement(dialog), "El foco inicial queda en Cancelar.");
            if (dialog.IsKeyboardFocusWithin) Assert.AreSame(cancel, Keyboard.FocusedElement);
            Assert.IsFalse(FindVisualChildren<Button>(dialog).Any(button => button.IsDefault),
                "Ningún botón responde a Enter si no tiene el foco.");
            Assert.AreEqual("Cerrar estación", confirm.Content);
            Assert.AreEqual("Cancelar", cancel.Content);
            Assert.AreEqual(
                ((SolidColorBrush)System.Windows.Application.Current.FindResource("DangerBrush")).Color,
                ((SolidColorBrush)confirm.Background).Color);
            Assert.AreEqual("Cerrar la estación y volver al inicio de sesión.",
                ((TextBlock)dialog.FindName("MessageText")).Text);
        });
    }

    [STATestMethod]
    public void EscapeCancelsWithoutClosingStation()
    {
        WithDialog((dialog, viewModel, closes) =>
        {
            dialog.RaiseEvent(new KeyEventArgs(
                Keyboard.PrimaryDevice,
                PresentationSource.FromVisual(dialog)!,
                0,
                Key.Escape)
            {
                RoutedEvent = UIElement.PreviewKeyDownEvent,
            });

            Assert.IsTrue(viewModel.WasCancelled);
            Assert.IsFalse(dialog.IsVisible, "Esc cierra el diálogo.");
            Assert.AreEqual(0, closes());
        });
    }

    [STATestMethod]
    public void EnterOnCancelDoesNotConfirm()
    {
        WithDialog((dialog, viewModel, closes) =>
        {
            var cancel = (Button)dialog.FindName("CancelButton");
            Keyboard.Focus(cancel);
            cancel.RaiseEvent(new KeyEventArgs(
                Keyboard.PrimaryDevice,
                PresentationSource.FromVisual(cancel)!,
                0,
                Key.Enter)
            {
                RoutedEvent = UIElement.KeyDownEvent,
            });

            Assert.AreEqual(0, closes(), "Enter sobre Cancelar nunca cierra la estación.");
            Assert.IsFalse(viewModel.IsClosing);
        });
    }

    [STATestMethod]
    public void DialogCannotBeDismissedWhileClosing()
    {
        var pending = new TaskCompletionSource();
        WithDialog((dialog, viewModel, closes) =>
        {
            var confirm = (Button)dialog.FindName("ConfirmButton");
            var cancel = (Button)dialog.FindName("CancelButton");

            Task closing = viewModel.ConfirmCommand.ExecuteAsync(null);
            dialog.UpdateLayout();

            Assert.IsFalse(confirm.IsEnabled, "Evita el doble clic.");
            Assert.IsFalse(cancel.IsEnabled);
            Assert.AreEqual(Visibility.Visible, ((FrameworkElement)dialog.FindName("ProgressPanel")).Visibility);
            Assert.IsTrue(dialog.HandleKey(Key.Escape));
            dialog.Close();
            Assert.IsTrue(dialog.IsVisible, "Ni Esc ni la X cierran el diálogo a medias.");

            pending.SetResult();
            Assert.IsTrue(closing.IsCompleted);
            Assert.IsFalse(dialog.IsVisible, "Al terminar el cierre el diálogo se cierra solo.");
            Assert.AreEqual(1, closes());
        }, () => pending.Task);
    }

    private static void WithDialog(
        Action<CloseStationConfirmationWindow, CloseStationConfirmationViewModel, Func<int>> assertions,
        Func<Task>? close = null)
    {
        if (System.Windows.Application.Current is null) new App().InitializeComponent();
        LoginViewTestHost.KeepSharedApplicationAlive();
        int closes = 0;
        var viewModel = new CloseStationConfirmationViewModel(() =>
        {
            closes++;
            return close?.Invoke() ?? Task.CompletedTask;
        });
        var dialog = new CloseStationConfirmationWindow
        {
            ShowInTaskbar = false,
            ShowActivated = true,
            DataContext = viewModel,
        };
        try
        {
            dialog.Show();
            dialog.Activate();
            dialog.UpdateLayout();
            assertions(dialog, viewModel, () => closes);
        }
        finally
        {
            if (dialog.IsVisible && !viewModel.IsClosing) dialog.Close();
        }
    }

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
