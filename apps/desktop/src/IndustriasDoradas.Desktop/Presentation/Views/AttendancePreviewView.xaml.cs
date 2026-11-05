using System.Windows.Controls;
using System.Windows.Threading;
using IndustriasDoradas.Desktop.Presentation.ViewModels;

namespace IndustriasDoradas.Desktop.Presentation.Views;

public partial class AttendancePreviewView : UserControl
{
    private readonly DispatcherTimer refreshTimer;
    private bool isRefreshing;

    public AttendancePreviewView()
    {
        InitializeComponent();
        refreshTimer = new DispatcherTimer { Interval = TimeSpan.FromMinutes(1) };
        refreshTimer.Tick += OnRefreshTick;
        Loaded += OnLoaded;
        Unloaded += OnUnloaded;
    }

    private AttendancePreviewViewModel? ViewModel => DataContext as AttendancePreviewViewModel;

    private async void OnLoaded(object sender, System.Windows.RoutedEventArgs e)
    {
        refreshTimer.Start();
        await RefreshAsync();
    }

    private void OnUnloaded(object sender, System.Windows.RoutedEventArgs e) => refreshTimer.Stop();

    private async void OnRefreshTick(object? sender, EventArgs e) => await RefreshAsync();

    private async Task RefreshAsync()
    {
        if (ViewModel is null || isRefreshing) return;
        isRefreshing = true;
        try
        {
            await ViewModel.RefreshAfterSynchronizationAsync();
        }
        finally
        {
            isRefreshing = false;
        }
    }
}
