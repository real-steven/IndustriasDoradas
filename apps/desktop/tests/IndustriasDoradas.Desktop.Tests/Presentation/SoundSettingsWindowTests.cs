using System.IO;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Media;
using IndustriasDoradas.Desktop.Configuration;
using IndustriasDoradas.Desktop.Infrastructure.Audio;
using IndustriasDoradas.Desktop.Presentation.Feedback;
using IndustriasDoradas.Desktop.Presentation.ViewModels;
using IndustriasDoradas.Desktop.Presentation.Views;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Tests.Presentation;

[TestClass]
public sealed class SoundSettingsWindowTests
{
    [STATestMethod]
    public void SettingsShowsConfigureAndDialogRendersCompactRows()
    {
        if (System.Windows.Application.Current is null) new App().InitializeComponent();
        LoginViewTestHost.KeepSharedApplicationAlive();
        string directory = LoginViewTestHost.NewTemporaryDirectory();
        try
        {
            var player = new WpfOperationFeedbackPlayer(
                Options.Create(new OperationSafetyOptions()),
                new SoundPreferenceStore(directory),
                _ => { },
                loadInBackground: false);

            var settingsView = new SettingsView { DataContext = new SettingsViewModel(player) };
            settingsView.Measure(new Size(1280, 720));
            settingsView.Arrange(new Rect(0, 0, 1280, 720));
            settingsView.UpdateLayout();
            var configure = (Button)settingsView.FindName("ConfigureSoundsButton");
            Assert.AreEqual("CONFIGURAR", configure.Content);
            Assert.IsTrue(configure.IsEnabled);

            var dialog = new SoundSettingsWindow { ShowInTaskbar = false, ShowActivated = false };
            dialog.DataContext = new SoundSettingsViewModel(player, dialog);
            try
            {
                dialog.Show();
                dialog.UpdateLayout();
                Button[] buttons = FindVisualChildren<Button>(dialog).ToArray();
                string[] names = buttons.Select(AutomationProperties.GetName).ToArray();

                Assert.AreEqual(7, names.Count(name => name.StartsWith("Probar sonido de ", StringComparison.Ordinal)));
                Assert.AreEqual(7, names.Count(name => name.StartsWith("Elegir sonido para ", StringComparison.Ordinal)));
                Assert.AreEqual(7, buttons.Count(button =>
                    AutomationProperties.GetName(button).StartsWith("Restaurar", StringComparison.Ordinal) && !button.IsEnabled),
                    "Sin sonidos personalizados no hay nada que restaurar.");
                Assert.IsTrue(((CheckBox)dialog.FindName("EnabledBox")).IsChecked == true);
            }
            finally
            {
                dialog.Close();
            }
        }
        finally
        {
            Directory.Delete(directory, recursive: true);
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
