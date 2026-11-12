using System.Windows;
using System.Windows.Automation;
using System.Windows.Input;
using System.Windows.Threading;
using System.ComponentModel;
using System.Globalization;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Presentation.ViewModels;
using IndustriasDoradas.Desktop.Presentation.Views;

namespace IndustriasDoradas.Desktop.Presentation;

public partial class MainWindow : Window, IDisposable, IPrivilegedDialogHost
{
    private readonly MainWindowViewModel viewModel;
    private readonly List<Window> privilegedDialogs = [];
    private readonly IBiometricVerificationService biometricService;
    private readonly ProfilePopoverViewModel? profile;
    private readonly DispatcherTimer clockTimer;
    private readonly DispatcherTimer headerTimer;
    private readonly DispatcherTimer noticeTimer;
    private Rect windowedBounds;
    private WindowState windowedState;
    private WindowStyle windowedStyle;
    private ResizeMode windowedResizeMode;
    private SizeToContent windowedSizeToContent;
    private bool windowedTopmost;
    private bool isFullScreen;
    private CancellationTokenSource? biometricCancellation;
    private bool disposed;

    public MainWindow(
        MainWindowViewModel viewModel,
        IBiometricVerificationService biometricService,
        ProfilePopoverViewModel? profile = null)
    {
        InitializeComponent();
        this.viewModel = viewModel;
        this.biometricService = biometricService;
        this.profile = profile;
        DataContext = viewModel;
        if (profile is null)
        {
            ProfileAvatarHost.Visibility = Visibility.Collapsed;
        }
        else
        {
            ProfileAvatarHost.DataContext = profile;
            profile.PinResetRequested += OnProfilePinResetRequested;
            PreviewMouseDown += OnProfileOutsideMouseDown;
            _ = profile.RefreshAsync();
        }
        clockTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
        clockTimer.Tick += OnClockTick;
        headerTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(8) };
        headerTimer.Tick += OnHeaderTimerTick;
        noticeTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(6) };
        noticeTimer.Tick += OnNoticeTimerTick;
        Loaded += OnLoaded;
        Closed += OnClosed;
        viewModel.PropertyChanged += OnViewModelPropertyChanged;
        viewModel.PrivilegedAccessEnded += OnPrivilegedAccessEnded;
        PreviewKeyDown += OnActivity;
        PreviewKeyDown += OnWindowPreviewKeyDown;
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

    /// <summary>
    /// Registra un diálogo que solo puede existir con elevación activa. La interacción dentro del
    /// diálogo cuenta como actividad del jefe y, si la elevación termina, el diálogo se cierra sin
    /// guardar cambios pendientes. Devuelve false si la elevación ya no está activa.
    /// </summary>
    public bool TryTrackPrivilegedDialog(Window dialog)
    {
        ArgumentNullException.ThrowIfNull(dialog);
        if (!viewModel.HasElevatedAccess) return false;

        privilegedDialogs.Add(dialog);
        dialog.PreviewKeyDown += OnPrivilegedDialogActivity;
        dialog.PreviewMouseDown += OnPrivilegedDialogActivity;
        dialog.PreviewTouchDown += OnPrivilegedDialogActivity;
        dialog.Closed += OnPrivilegedDialogClosed;
        return true;
    }

    private void OnPrivilegedDialogActivity(object? sender, InputEventArgs e) =>
        viewModel.RecordActivity();

    private void OnPrivilegedDialogClosed(object? sender, EventArgs e)
    {
        if (sender is not Window dialog) return;
        dialog.PreviewKeyDown -= OnPrivilegedDialogActivity;
        dialog.PreviewMouseDown -= OnPrivilegedDialogActivity;
        dialog.PreviewTouchDown -= OnPrivilegedDialogActivity;
        dialog.Closed -= OnPrivilegedDialogClosed;
        privilegedDialogs.Remove(dialog);
    }

    private void OnPrivilegedAccessEnded(object? sender, EventArgs e)
    {
        // Close() de cada diálogo dispara su limpieza normal (p. ej. cancelar la cámara del
        // registro facial). Los datos operativos ya confirmados viven en SQLite y no se tocan.
        foreach (Window dialog in privilegedDialogs.ToArray())
        {
            dialog.Close();
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
        if (e.PropertyName == nameof(MainWindowViewModel.IsPlantManager))
        {
            // Si la elevación vence con el perfil abierto, pasa a solo lectura al instante.
            profile?.OnElevationChanged();
        }
        if (e.PropertyName == nameof(MainWindowViewModel.IsApplicationUnlocked) && !viewModel.IsApplicationUnlocked)
        {
            CloseProfilePopup(returnFocus: false);
        }
        if (e.PropertyName == nameof(MainWindowViewModel.IsApplicationUnlocked))
        {
            if (!viewModel.IsApplicationUnlocked && isFullScreen)
            {
                ExitFullScreen(restorePreviousWindow: false);
            }
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
        if (isFullScreen)
        {
            SizeToContent = SizeToContent.Manual;
            WindowStyle = WindowStyle.None;
            ResizeMode = ResizeMode.NoResize;
            WindowState = WindowState.Maximized;
            Topmost = true;
            return;
        }

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

    private void OnToggleFullScreen(object sender, RoutedEventArgs e)
    {
        ToggleFullScreen();
    }

    private void ToggleFullScreen()
    {
        if (isFullScreen)
        {
            ExitFullScreen();
            return;
        }

        EnterFullScreen();
    }

    private void EnterFullScreen()
    {
        if (isFullScreen || !viewModel.IsApplicationUnlocked) return;
        windowedBounds = RestoreBounds;
        windowedState = WindowState;
        windowedStyle = WindowStyle;
        windowedResizeMode = ResizeMode;
        windowedSizeToContent = SizeToContent;
        windowedTopmost = Topmost;
        isFullScreen = true;

        SizeToContent = SizeToContent.Manual;
        WindowState = WindowState.Normal;
        WindowStyle = WindowStyle.None;
        ResizeMode = ResizeMode.NoResize;
        Topmost = true;
        WindowState = WindowState.Maximized;
        FullScreenButton.Content = "↙  SALIR";
        FullScreenButton.ToolTip = "Salir de pantalla completa (F11 o Esc)";
        AutomationProperties.SetName(FullScreenButton, "Salir de pantalla completa");
        FloatingFullScreenExitButton.Visibility = Visibility.Collapsed;
    }

    private void ExitFullScreen(bool restorePreviousWindow = true)
    {
        if (!isFullScreen) return;
        isFullScreen = false;
        WindowState = WindowState.Normal;
        Topmost = restorePreviousWindow && windowedTopmost;
        WindowStyle = restorePreviousWindow ? windowedStyle : WindowStyle.SingleBorderWindow;
        ResizeMode = restorePreviousWindow ? windowedResizeMode : ResizeMode.CanResize;
        SizeToContent = restorePreviousWindow ? windowedSizeToContent : SizeToContent.Manual;

        if (restorePreviousWindow && windowedSizeToContent == SizeToContent.Manual)
        {
            Left = windowedBounds.Left;
            Top = windowedBounds.Top;
            Width = windowedBounds.Width;
            Height = windowedBounds.Height;
        }

        if (restorePreviousWindow)
        {
            WindowState = windowedState;
        }

        FullScreenButton.Content = "⛶";
        FullScreenButton.ToolTip = "Pantalla completa (F11)";
        AutomationProperties.SetName(FullScreenButton, "Activar pantalla completa");
        FloatingFullScreenExitButton.Visibility = Visibility.Collapsed;
    }

    private void OnWindowPreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Escape && ProfilePopup.IsOpen)
        {
            HandleProfileEscape();
            e.Handled = true;
            return;
        }

        if (e.Key == Key.F11)
        {
            ToggleFullScreen();
            e.Handled = true;
            return;
        }

        if (e.Key != Key.Escape) return;
        if (ElevationOverlay.Visibility == Visibility.Visible)
        {
            CancelBiometricVerification();
            HeaderPinBox.Clear();
            ElevationOverlay.Visibility = Visibility.Collapsed;
            e.Handled = true;
            return;
        }

        if (!isFullScreen) return;
        ExitFullScreen();
        e.Handled = true;
    }

    private void CollapseHeader()
    {
        if (!viewModel.IsOperationPage) return;
        HeaderPanel.Visibility = Visibility.Collapsed;
        HeaderRow.Height = new GridLength(0);
        ShowHeaderButton.Visibility = Visibility.Visible;
        FloatingFullScreenExitButton.Visibility = isFullScreen
            ? Visibility.Visible
            : Visibility.Collapsed;
    }

    private void ExpandHeader()
    {
        HeaderPanel.Visibility = Visibility.Visible;
        HeaderRow.Height = new GridLength(76);
        ShowHeaderButton.Visibility = Visibility.Collapsed;
        FloatingFullScreenExitButton.Visibility = Visibility.Collapsed;
    }

    private async void OnElevationClick(object sender, RoutedEventArgs e)
    {
        if (viewModel.Station?.IsPlantManager == true)
        {
            viewModel.Station.ExitManagerModeCommand.Execute(null);
            return;
        }

        ElevationOverlay.Visibility = Visibility.Visible;
        HeaderPinBox.Focus();
        Keyboard.Focus(HeaderPinBox);
        if (viewModel.Station is not null)
        {
            await viewModel.Station.RecordElevationRequestedAsync();
        }
        try
        {
            await StartSilentBiometricVerificationAsync();
        }
        catch (OperationCanceledException)
        {
            BiometricStatusText.Text = "Validación biométrica cancelada. Puede ingresar su PIN.";
        }
        catch (Exception exception)
        {
            BiometricStatusText.Text = $"La cámara no pudo completar la validación. Puede ingresar su PIN. Detalle: {exception.Message}";
            if (viewModel.Station is not null)
            {
                await viewModel.Station.RecordBiometricTechnicalFailureAsync();
            }
        }
    }

    private async void OnElevate(object sender, RoutedEventArgs e)
    {
        await ElevateAsync();
    }

    private async void OnElevationPinKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key != Key.Return || ElevationOverlay.Visibility != Visibility.Visible ||
            viewModel.Station?.CanInteract != true)
            return;
        e.Handled = true;
        await ElevateAsync();
    }

    private async Task ElevateAsync()
    {
        StationViewModel? station = viewModel.Station;
        if (station?.CanInteract != true) return;
        CancelBiometricVerification();
        await station.ElevateAsync(HeaderPinBox.Password);
        HeaderPinBox.Clear();
        if (station.IsPlantManager)
        {
            ElevationOverlay.Visibility = Visibility.Collapsed;
        }
    }

    private void OnCancelElevation(object sender, RoutedEventArgs e)
    {
        CancelBiometricVerification();
        HeaderPinBox.Clear();
        ElevationOverlay.Visibility = Visibility.Collapsed;
    }

    private async Task StartSilentBiometricVerificationAsync()
    {
        StationViewModel? station = viewModel.Station;
        Guid? profileId = station?.CurrentProfileId;
        if (station is null || profileId is null)
        {
            BiometricStatusText.Text = "Abra una sesión antes de usar biometría.";
            EnrollBiometricButton.Visibility = Visibility.Collapsed;
            return;
        }

        CancelBiometricVerification();
        biometricCancellation = new CancellationTokenSource();
        CancellationToken token = biometricCancellation.Token;
        bool enrolled = await biometricService.HasEnrollmentAsync(profileId.Value, token);
        if (token.IsCancellationRequested || ElevationOverlay.Visibility != Visibility.Visible) return;

        EnrollBiometricButton.Visibility = enrolled ? Visibility.Collapsed : Visibility.Visible;
        if (!enrolled)
        {
            EnrollBiometricButton.Content = "REGISTRAR ROSTRO EN ESTE EQUIPO";
            BiometricStatusText.Text = "Rostro no registrado. Ingrese el PIN y seleccione Registrar rostro.";
            return;
        }

        var status = new Progress<string>(message => BiometricStatusText.Text = message);
        station.BeginBiometricAttempt();
        BiometricOperationResult result = await biometricService.VerifyAsync(
            profileId.Value,
            status,
            token);
        if (token.IsCancellationRequested || ElevationOverlay.Visibility != Visibility.Visible) return;
        BiometricStatusText.Text = result.Message;
        if (!result.Succeeded)
        {
            // Un único evento con el resultado final del intento, nunca uno por fotograma.
            await station.RecordBiometricFailureAsync(result);
            EnrollBiometricButton.Content = "VOLVER A REGISTRAR ROSTRO";
            EnrollBiometricButton.Visibility = Visibility.Visible;
            return;
        }

        bool elevated = await station.ElevateWithBiometricAsync(profileId.Value);
        if (!elevated || ElevationOverlay.Visibility != Visibility.Visible) return;
        HeaderPinBox.Clear();
        ElevationOverlay.Visibility = Visibility.Collapsed;
    }

    private async void OnEnrollBiometric(object sender, RoutedEventArgs e)
    {
        StationViewModel? station = viewModel.Station;
        Guid? profileId = station?.CurrentProfileId;
        if (station?.CanInteract != true || profileId is null) return;
        if (string.IsNullOrWhiteSpace(HeaderPinBox.Password))
        {
            BiometricStatusText.Text = "Ingrese primero su PIN individual para autorizar el registro.";
            HeaderPinBox.Focus();
            return;
        }

        CancelBiometricVerification();
        BiometricStatusText.Text = "Validando PIN antes del registro…";
        await station.ElevateAsync(HeaderPinBox.Password);
        HeaderPinBox.Clear();
        if (!station.IsPlantManager)
        {
            BiometricStatusText.Text = station.Status;
            return;
        }

        using var enrollmentWindow = new BiometricEnrollmentWindow(
            biometricService,
            profileId.Value,
            station.CurrentProfileDisplayName)
        {
            Owner = this,
        };
        if (!TryTrackPrivilegedDialog(enrollmentWindow)) return;
        enrollmentWindow.ShowDialog();
        BiometricOperationResult? result = enrollmentWindow.Result;
        BiometricStatusText.Text = result?.Message ?? "Registro facial cancelado.";
        if (result?.Succeeded != true) return;

        EnrollBiometricButton.Visibility = Visibility.Collapsed;
        ElevationOverlay.Visibility = Visibility.Collapsed;
    }

    private void CancelBiometricVerification()
    {
        CancellationTokenSource? previous = biometricCancellation;
        biometricCancellation = null;
        if (previous is null) return;
        previous.Cancel();
        previous.Dispose();
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

    private void OnCloseStation(object sender, RoutedEventArgs e)
    {
        StationViewModel? station = viewModel.Station;
        if (station is null) return;
        // El cierre (Outbox, sesión y vuelta al login) sigue siendo CloseStationCommand;
        // el diálogo solo lo ejecuta tras confirmar y espera a que termine.
        var confirmation = new CloseStationConfirmationViewModel(() => station.IsStationOpen
            ? station.CloseStationCommand.ExecuteAsync(null)
            : Task.CompletedTask);
        var dialog = new CloseStationConfirmationWindow { Owner = this, DataContext = confirmation };
        dialog.ShowDialog();
    }

    private void OnClosed(object? sender, EventArgs e)
    {
        Dispose();
    }

    public void Dispose()
    {
        if (disposed) return;
        disposed = true;
        CancelBiometricVerification();
        clockTimer.Stop();
        headerTimer.Stop();
        noticeTimer.Stop();
        viewModel.PropertyChanged -= OnViewModelPropertyChanged;
        viewModel.PrivilegedAccessEnded -= OnPrivilegedAccessEnded;
        PreviewKeyDown -= OnWindowPreviewKeyDown;
        PreviewMouseDown -= OnProfileOutsideMouseDown;
        if (profile is not null) profile.PinResetRequested -= OnProfilePinResetRequested;
        clockTimer.Tick -= OnClockTick;
        headerTimer.Tick -= OnHeaderTimerTick;
        noticeTimer.Tick -= OnNoticeTimerTick;
        Closed -= OnClosed;
        GC.SuppressFinalize(this);
    }

    private async void OnProfileAvatarClick(object sender, RoutedEventArgs e)
    {
        if (profile is null) return;
        if (ProfilePopup.IsOpen)
        {
            CloseProfilePopup(returnFocus: true);
            return;
        }

        ProfilePopup.IsOpen = true;
        Task opening = profile.OpenAsync();
        _ = Dispatcher.BeginInvoke(
            () => ProfilePopupPanel.MoveFocus(new TraversalRequest(FocusNavigationDirection.First)),
            DispatcherPriority.Input);
        await opening;
    }

    private void OnProfilePopupKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key != Key.Escape) return;
        HandleProfileEscape();
        e.Handled = true;
    }

    private void HandleProfileEscape()
    {
        if (profile is null || profile.IsPickingPhoto) return;
        if (profile.IsEditingPhone)
        {
            profile.CancelEditCommand.Execute(null);
            ProfilePopupPanel.MoveFocus(new TraversalRequest(FocusNavigationDirection.First));
            return;
        }
        CloseProfilePopup(returnFocus: true);
    }

    private void OnProfileOutsideMouseDown(object sender, MouseButtonEventArgs e)
    {
        // Los clics dentro de la ventana emergente no llegan aquí (es otra ventana nativa).
        if (!ProfilePopup.IsOpen || profile?.IsPickingPhoto == true) return;
        if (e.OriginalSource is DependencyObject source && IsWithin(source, ProfileAvatarButton)) return;
        CloseProfilePopup(returnFocus: false);
    }

    private void CloseProfilePopup(bool returnFocus)
    {
        if (!ProfilePopup.IsOpen) return;
        ProfilePinBox.Clear();
        profile?.Close();
        ProfilePopup.IsOpen = false;
        if (returnFocus) ProfileAvatarButton.Focus();
    }

    private async void OnProfileSavePhone(object sender, RoutedEventArgs e)
    {
        if (profile is null) return;
        await profile.SavePhoneAsync(ProfilePinBox.Password);
    }

    private async void OnProfilePinKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key != Key.Enter || profile is null) return;
        e.Handled = true;
        await profile.SavePhoneAsync(ProfilePinBox.Password);
    }

    private void OnProfilePinResetRequested(object? sender, EventArgs e) => ProfilePinBox.Clear();

    private static bool IsWithin(DependencyObject source, DependencyObject ancestor)
    {
        for (DependencyObject? current = source; current is not null;
             current = current is System.Windows.Media.Visual or System.Windows.Media.Media3D.Visual3D
                 ? System.Windows.Media.VisualTreeHelper.GetParent(current)
                 : LogicalTreeHelper.GetParent(current))
        {
            if (ReferenceEquals(current, ancestor)) return true;
        }
        return false;
    }
}
