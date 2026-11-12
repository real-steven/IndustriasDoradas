using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Threading;
using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Presentation.Input;
using IndustriasDoradas.Desktop.Presentation.ViewModels;

namespace IndustriasDoradas.Desktop.Presentation.Views;

public partial class OperationView : UserControl
{
    private WpfKeyboardInputAdapter? keyboardAdapter;
    private readonly DispatcherTimer automaticRefreshTimer;
    private bool isAutomaticRefreshRunning;

    public OperationView()
    {
        InitializeComponent();
        automaticRefreshTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
        automaticRefreshTimer.Tick += OnAutomaticRefreshTick;
        Loaded += OnLoaded;
        Unloaded += OnUnloaded;
        PreviewKeyDown += OnPreviewKeyDown;
    }

    private OperationViewModel? ViewModel => DataContext as OperationViewModel;

    private async void OnLoaded(object sender, System.Windows.RoutedEventArgs e)
    {
        if (ViewModel is null)
        {
            return;
        }

        await ViewModel.RefreshAsync();
        keyboardAdapter = new WpfKeyboardInputAdapter(ViewModel.InputSource);
        keyboardAdapter.Connect();
        automaticRefreshTimer.Start();
        FocusCurrentTarget();
    }

    private void OnUnloaded(object sender, System.Windows.RoutedEventArgs e)
    {
        automaticRefreshTimer.Stop();
        keyboardAdapter?.Disconnect();
        keyboardAdapter = null;
    }

    private async void OnAutomaticRefreshTick(object? sender, EventArgs e)
    {
        if (ViewModel is null || isAutomaticRefreshRunning)
        {
            return;
        }

        isAutomaticRefreshRunning = true;
        try
        {
            await ViewModel.RefreshFromExternalChangeAsync();
        }
        finally
        {
            isAutomaticRefreshRunning = false;
        }
    }

    private async void OnPreviewKeyDown(object sender, KeyEventArgs e)
    {
        // Mientras se escribe (motivo de corrección, búsqueda, hora...) la tecla es del campo.
        if (ViewModel is null ||
            keyboardAdapter is null ||
            KeyboardShortcutFocusPolicy.ShouldIgnore(e) ||
            !keyboardAdapter.TryTranslate(e.Key, e.IsRepeat, out OperationInputCommand? command) ||
            command is null)
        {
            return;
        }

        e.Handled = true;
        await ViewModel.HandleInputCommandAsync(command);
        FocusCurrentTarget();
    }

    private void FocusCurrentTarget()
    {
        Focus();
        Keyboard.Focus(this);
    }

    private void OnOpenLineWindow(object sender, RoutedEventArgs e)
    {
        if (ViewModel is null || sender is not Button { DataContext: OperationLinePanelViewModel line })
        {
            return;
        }

        OperationLineDisplayWindow? existing = System.Windows.Application.Current.Windows
            .OfType<OperationLineDisplayWindow>()
            .FirstOrDefault(window => window.LineId == line.LineId);
        if (existing is not null)
        {
            if (existing.WindowState == WindowState.Minimized)
            {
                existing.WindowState = WindowState.Normal;
            }
            existing.Activate();
            return;
        }

        OperationLineDisplayWindow? window = null;
        try
        {
            window = new OperationLineDisplayWindow(ViewModel, line)
            {
                Owner = Window.GetWindow(this),
            };
            window.Show();
        }
        catch (Exception exception) when (
            exception is InvalidOperationException or System.Windows.Markup.XamlParseException)
        {
            window?.Close();
            MessageBox.Show(
                "No se pudo abrir la vista de esta línea. La aplicación principal puede continuar.",
                "Vista de línea no disponible",
                MessageBoxButton.OK,
                MessageBoxImage.Warning);
        }
    }
}
