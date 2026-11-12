using System.Windows;
using System.Windows.Input;
using IndustriasDoradas.Desktop.Presentation.Input;
using IndustriasDoradas.Desktop.Presentation.ViewModels;

namespace IndustriasDoradas.Desktop.Presentation.Views;

public partial class KeyboardShortcutSettingsWindow : Window
{
    public KeyboardShortcutSettingsWindow()
    {
        InitializeComponent();
        PreviewKeyDown += OnPreviewKeyDown;
        DataContextChanged += OnDataContextChanged;
    }

    private KeyboardShortcutSettingsViewModel? ViewModel => DataContext as KeyboardShortcutSettingsViewModel;

    /// <summary>
    /// En modo escucha la tecla pulsada es la nueva asignación: no activa botones ni cierra el diálogo.
    /// </summary>
    public bool HandleKey(Key key, ModifierKeys modifiers, bool isRepeat) =>
        ViewModel?.CaptureKey(
            key.ToString(),
            KeyboardShortcutFocusPolicy.HasBlockingModifier(modifiers),
            isRepeat) == true;

    private void OnPreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (ViewModel?.IsListening != true) return;
        e.Handled = HandleKey(KeyboardShortcutFocusPolicy.ActualKey(e), Keyboard.Modifiers, e.IsRepeat);
    }

    private void OnDataContextChanged(object sender, DependencyPropertyChangedEventArgs e)
    {
        if (e.OldValue is KeyboardShortcutSettingsViewModel previous) previous.Saved -= OnSaved;
        if (e.NewValue is KeyboardShortcutSettingsViewModel current) current.Saved += OnSaved;
    }

    private void OnSaved(object? sender, EventArgs e)
    {
        if (IsLoaded) Close();
    }

    private void OnClose(object sender, RoutedEventArgs e) => Close();
}
