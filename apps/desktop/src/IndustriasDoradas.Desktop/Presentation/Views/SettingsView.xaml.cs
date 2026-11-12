using System.Windows;
using System.Windows.Controls;
using IndustriasDoradas.Desktop.Presentation.ViewModels;

namespace IndustriasDoradas.Desktop.Presentation.Views;

public partial class SettingsView : UserControl
{
    public SettingsView()
    {
        InitializeComponent();
    }

    private void OnConfigureSounds(object sender, RoutedEventArgs e)
    {
        if (DataContext is not SettingsViewModel settings) return;
        var dialog = new SoundSettingsWindow { Owner = Window.GetWindow(this) };
        SoundSettingsViewModel? viewModel = settings.CreateSoundSettings(dialog);
        if (viewModel is null || !TrackAsPrivileged(dialog)) return;
        dialog.DataContext = viewModel;
        dialog.ShowDialog();
    }

    private void OnConfigureShortcuts(object sender, RoutedEventArgs e)
    {
        if (DataContext is not SettingsViewModel settings) return;
        KeyboardShortcutSettingsViewModel? viewModel = settings.CreateShortcutSettings();
        if (viewModel is null) return;
        var dialog = new KeyboardShortcutSettingsWindow
        {
            Owner = Window.GetWindow(this),
            DataContext = viewModel,
        };
        if (!TrackAsPrivileged(dialog)) return;
        dialog.ShowDialog();
    }

    // Configuración solo es visible con elevación; si vence, el anfitrión cierra estos diálogos.
    // Sin anfitrión (diseñador o pruebas aisladas) no existe frontera de elevación.
    private bool TrackAsPrivileged(Window dialog) =>
        Window.GetWindow(this) is not IPrivilegedDialogHost host || host.TryTrackPrivilegedDialog(dialog);
}
