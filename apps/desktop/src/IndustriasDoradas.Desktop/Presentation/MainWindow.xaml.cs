using System.Windows;
using System.Windows.Input;
using System.Windows.Threading;
using System.ComponentModel;
using System.Globalization;
using IndustriasDoradas.Desktop.Presentation.ViewModels;

namespace IndustriasDoradas.Desktop.Presentation;

public partial class MainWindow : Window
{
    private readonly MainWindowViewModel viewModel;
    private readonly DispatcherTimer clockTimer;
    private readonly DispatcherTimer headerTimer;
    private readonly DispatcherTimer noticeTimer;

    public MainWindow(MainWindowViewModel viewModel)
    {
        InitializeComponent();
        this.viewModel = viewModel;
        DataContext = viewModel;
        clockTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
        clockTimer.Tick += OnClockTick;
        headerTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(8) };
        headerTimer.Tick += OnHeaderTimerTick;
        noticeTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(6) };
        noticeTimer.Tick += OnNoticeTimerTick;
        Loaded += OnLoaded;
        Closed += OnClosed;
        viewModel.PropertyChanged += OnViewModelPropertyChanged;
        PreviewKeyDown += OnActivity;
        PreviewMouseDown += OnActivity;
        PreviewTouchDown += OnActivity;
        UpdateWindowPresentation();
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        Loaded -= OnLoaded;
        await viewModel.InitializeAsync();
        UpdateClock();
        clockTimer.Start();
        UpdateHeaderForCurrentPage();
        UpdateWindowPresentation();
    }

    private void OnActivity(object? sender, InputEventArgs e)
    {
        viewModel.RecordActivity();
        if (viewModel.IsOperationPage && HeaderPanel.Visibility == Visibility.Visible)
        {
            RestartHeaderTimer();
        }
    }

    private void OnClockTick(object? sender, EventArgs e) => UpdateClock();

    private void UpdateClock()
    {
        DateTimeOffset now = DateTimeOffset.Now;
        HeaderClock.Text = now.ToString("HH:mm", CultureInfo.InvariantCulture);
        HeaderDate.Text = now.ToString("ddd d MMM", CultureInfo.GetCultureInfo("es-CR"))
            .ToUpperInvariant();
    }

    private void OnViewModelPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(MainWindowViewModel.IsApplicationUnlocked))
        {
            if (viewModel.IsApplicationUnlocked && viewModel.Station?.WasSessionRestored == true)
            {
                SessionRestoreNotice.Visibility = Visibility.Visible;
                RestartNoticeTimer();
            }
            UpdateWindowPresentation();
            return;
        }

        if (e.PropertyName is nameof(MainWindowViewModel.CurrentPage) or
            nameof(MainWindowViewModel.IsOperationPage))
        {
            UpdateHeaderForCurrentPage();
        }
    }

    private void UpdateWindowPresentation()
    {
        if (!viewModel.IsApplicationUnlocked)
        {
            WindowState = WindowState.Normal;
            ResizeMode = ResizeMode.NoResize;
            MinWidth = 0;
            MinHeight = 0;
            SizeToContent = SizeToContent.WidthAndHeight;
            CenterWindowAfterLayout();
            return;
        }

        SizeToContent = SizeToContent.Manual;
        ResizeMode = ResizeMode.CanResize;
        MinWidth = 1050;
        MinHeight = 650;
        Width = Math.Min(1280, SystemParameters.WorkArea.Width);
        Height = Math.Min(800, SystemParameters.WorkArea.Height);
        CenterWindowAfterLayout();
    }

    private void CenterWindowAfterLayout() =>
        Dispatcher.BeginInvoke(CenterWindowOnWorkingArea, DispatcherPriority.ContextIdle);

    private void CenterWindowOnWorkingArea()
    {
        Rect workArea = SystemParameters.WorkArea;
        Left = workArea.Left + Math.Max(0, (workArea.Width - ActualWidth) / 2);
        Top = workArea.Top + Math.Max(0, (workArea.Height - ActualHeight) / 2);
    }

    private void UpdateHeaderForCurrentPage()
    {
        ExpandHeader();
        if (viewModel.IsOperationPage)
        {
            RestartHeaderTimer();
        }
        else
        {
            headerTimer.Stop();
        }
    }

    private void RestartHeaderTimer()
    {
        headerTimer.Stop();
        headerTimer.Start();
    }

    private void OnHeaderTimerTick(object? sender, EventArgs e)
    {
        headerTimer.Stop();
        if (viewModel.IsOperationPage)
        {
            CollapseHeader();
        }
    }

    private void OnShowHeader(object sender, RoutedEventArgs e)
    {
        ExpandHeader();
        RestartHeaderTimer();
    }

    private void CollapseHeader()
    {
        if (!viewModel.IsOperationPage) return;
        HeaderPanel.Visibility = Visibility.Collapsed;
        HeaderRow.Height = new GridLength(0);
        ShowHeaderButton.Visibility = Visibility.Visible;
    }

    private void ExpandHeader()
    {
        HeaderPanel.Visibility = Visibility.Visible;
        HeaderRow.Height = new GridLength(76);
        ShowHeaderButton.Visibility = Visibility.Collapsed;
    }

    private void OnElevationClick(object sender, RoutedEventArgs e)
    {
        if (viewModel.Station?.IsPlantManager == true)
        {
            viewModel.Station.ExitManagerModeCommand.Execute(null);
            return;
        }

        ElevationOverlay.Visibility = Visibility.Visible;
        HeaderPinBox.Focus();
        Keyboard.Focus(HeaderPinBox);
    }

    private async void OnElevate(object sender, RoutedEventArgs e)
    {
        if (viewModel.Station is null) return;
        await viewModel.Station.ElevateAsync(HeaderPinBox.Password);
        HeaderPinBox.Clear();
        if (viewModel.Station.IsPlantManager)
        {
            ElevationOverlay.Visibility = Visibility.Collapsed;
        }
    }

    private void OnCancelElevation(object sender, RoutedEventArgs e)
    {
        HeaderPinBox.Clear();
        ElevationOverlay.Visibility = Visibility.Collapsed;
    }

    private void OnComingSoon(object sender, RoutedEventArgs e)
    {
        string feature = sender is FrameworkElement { Tag: string tag } ? tag : "Esta función";
        ComingSoonText.Text = $"{feature} estará disponible próximamente.";
        ComingSoonNotice.Visibility = Visibility.Visible;
        RestartNoticeTimer();
    }

    private void OnDismissRestoreNotice(object sender, RoutedEventArgs e) =>
        SessionRestoreNotice.Visibility = Visibility.Collapsed;

    private void RestartNoticeTimer()
    {
        noticeTimer.Stop();
        noticeTimer.Start();
    }

    private void OnNoticeTimerTick(object? sender, EventArgs e)
    {
        noticeTimer.Stop();
        SessionRestoreNotice.Visibility = Visibility.Collapsed;
        ComingSoonNotice.Visibility = Visibility.Collapsed;
    }

    private async void OnCloseStation(object sender, RoutedEventArgs e)
    {
        if (viewModel.Station is null) return;
        MessageBoxResult result = MessageBox.Show(
            "¿Cerrar la estación y volver al inicio de sesión?",
            "Cerrar estación",
            MessageBoxButton.YesNo,
            MessageBoxImage.Question);
        if (result == MessageBoxResult.Yes)
        {
            await viewModel.Station.CloseStationCommand.ExecuteAsync(null);
        }
    }

    private void OnClosed(object? sender, EventArgs e)
    {
        clockTimer.Stop();
        headerTimer.Stop();
        noticeTimer.Stop();
        viewModel.PropertyChanged -= OnViewModelPropertyChanged;
        clockTimer.Tick -= OnClockTick;
        headerTimer.Tick -= OnHeaderTimerTick;
        noticeTimer.Tick -= OnNoticeTimerTick;
    }
}
