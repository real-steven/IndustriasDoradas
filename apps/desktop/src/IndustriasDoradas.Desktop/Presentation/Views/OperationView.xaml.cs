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
        if (ViewModel is null ||
            keyboardAdapter is null ||
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
}
