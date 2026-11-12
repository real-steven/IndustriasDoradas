using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using System.IO;
using System.ComponentModel;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain;
using Microsoft.Data.Sqlite;

namespace IndustriasDoradas.Desktop.Presentation.ViewModels;

public sealed class MainWindowViewModel : ObservableObject, IDisposable
{
    private object currentPage;
    private readonly ISyncStatusNotifier? syncStatusNotifier;
    private readonly IUiDispatcher uiDispatcher;
    private readonly DateTimeOffset correctionNotificationStartedAt = DateTimeOffset.UtcNow;
    private bool isRefreshingAfterSync;
    private bool isRefreshRequestedAfterSync;
    private bool correctionNotificationsReady;
    private bool wasElevated;
    private string? dismissedCorrectionNotificationKey;
    private string? dismissedResponsibilityWarningKey;

    public MainWindowViewModel(HomeViewModel home, DiagnosticsViewModel diagnostics)
        : this(home, diagnostics, null, null, null, null, null)
    {
    }

    public MainWindowViewModel(
        HomeViewModel home,
        DiagnosticsViewModel diagnostics,
        StationViewModel? station)
        : this(home, diagnostics, station, null, null, null, null)
    {
    }

    public MainWindowViewModel(
        HomeViewModel home,
        DiagnosticsViewModel diagnostics,
        StationViewModel? station,
        OperationViewModel? operation)
        : this(home, diagnostics, station, operation, null, null, null)
    {
    }

    public MainWindowViewModel(
        HomeViewModel home,
        DiagnosticsViewModel diagnostics,
        StationViewModel? station,
        OperationViewModel? operation,
        AuditViewModel? audit)
        : this(home, diagnostics, station, operation, audit, null, null)
    {
    }

    public MainWindowViewModel(
        HomeViewModel home,
        DiagnosticsViewModel diagnostics,
        StationViewModel? station,
        OperationViewModel? operation,
        AuditViewModel? audit,
        SettingsViewModel? settings)
        : this(home, diagnostics, station, operation, audit, settings, null)
    {
    }

    public MainWindowViewModel(
        HomeViewModel home,
        DiagnosticsViewModel diagnostics,
        StationViewModel? station,
        OperationViewModel? operation,
        AuditViewModel? audit,
        SettingsViewModel? settings,
        ISyncStatusNotifier? syncStatusNotifier)
        : this(home, diagnostics, station, operation, audit, settings, syncStatusNotifier, new WpfUiDispatcher())
    {
    }

    public MainWindowViewModel(
        HomeViewModel home,
        DiagnosticsViewModel diagnostics,
        StationViewModel? station,
        OperationViewModel? operation,
        AuditViewModel? audit,
        SettingsViewModel? settings,
        ISyncStatusNotifier? syncStatusNotifier,
        IUiDispatcher uiDispatcher,
        AttendancePreviewViewModel? attendance = null)
    {
        Home = home;
        Diagnostics = diagnostics;
        Station = station;
        Operation = operation;
        Audit = audit;
        Settings = settings;
        Attendance = attendance;
        this.syncStatusNotifier = syncStatusNotifier;
        this.uiDispatcher = uiDispatcher;
        wasElevated = HasElevatedAccess;
        currentPage = operation ?? (HasElevatedAccess ? (object?)station : null) ?? home;
        ShowHomeCommand = new RelayCommand(() => CurrentPage = Home);
        ShowDiagnosticsCommand = new RelayCommand(
            () => TryNavigate(Diagnostics),
            CanShowDiagnostics);
        ShowAuditCommand = new AsyncRelayCommand(
            ShowAuditAsync,
            CanShowAudit);
        ShowAuditCorrectionsCommand = new AsyncRelayCommand(
            ShowAuditCorrectionsAsync,
            CanShowAuditCorrections);
        ShowAttendanceIncidentsCommand = new AsyncRelayCommand(
            ShowAttendanceIncidentsAsync,
            CanShowAttendanceIncidents);
        DismissCorrectionNotificationCommand = new RelayCommand(
            DismissCorrectionNotification,
            () => Diagnostics.HasCorrections);
        DismissResponsibilityWarningCommand = new RelayCommand(
            DismissResponsibilityWarning,
            () => Attendance?.HasResponsibilityWarning == true);
        ShowStationResponsibilityCommand = new AsyncRelayCommand(
            ShowStationResponsibilityAsync,
            () => CanShowStation() && Attendance?.HasResponsibilityWarning == true);
        ShowSettingsCommand = new RelayCommand(
            () => TryNavigate(Settings),
            CanShowSettings);
        ShowAttendanceCommand = new AsyncRelayCommand(
            ShowAttendanceAsync,
            () => Attendance is not null);
        ShowStationCommand = new AsyncRelayCommand(
            ShowStationAsync,
            CanShowStation);
        ShowOperationCommand = new AsyncRelayCommand(
            ShowOperationAsync,
            () => Operation is not null);
        if (Station is not null) Station.PropertyChanged += OnStationPropertyChanged;
        Diagnostics.PropertyChanged += OnDiagnosticsPropertyChanged;
        if (Attendance is not null) Attendance.PropertyChanged += OnAttendancePropertyChanged;
        if (syncStatusNotifier is not null)
        {
            syncStatusNotifier.Changed += OnSyncStatusChanged;
        }
    }

    public HomeViewModel Home { get; }

    public DiagnosticsViewModel Diagnostics { get; }
    public StationViewModel? Station { get; }
    public OperationViewModel? Operation { get; }
    public AuditViewModel? Audit { get; }
    public SettingsViewModel? Settings { get; }
    public AttendancePreviewViewModel? Attendance { get; }

    public object CurrentPage
    {
        get => currentPage;
        private set
        {
            if (!SetProperty(ref currentPage, value)) return;
            OnPropertyChanged(nameof(IsHomePage));
            OnPropertyChanged(nameof(IsOperationPage));
            OnPropertyChanged(nameof(IsStationPage));
            OnPropertyChanged(nameof(IsAuditPage));
            OnPropertyChanged(nameof(IsDiagnosticsPage));
            OnPropertyChanged(nameof(IsSettingsPage));
            OnPropertyChanged(nameof(IsAttendancePage));
            OnPropertyChanged(nameof(CurrentPageTitle));
        }
    }

    public bool IsStationOpen => Station?.IsStationOpen ?? true;
    public bool IsApplicationUnlocked => Station?.IsApplicationUnlocked ?? true;
    public bool IsPlantManager => Station?.IsPlantManager ?? false;

    /// <summary>
    /// Elevación temporal activa. Es independiente del rol de la cuenta que abrió la estación:
    /// un jefe con la estación abierta sigue en Modo Operación hasta elevar con PIN o biometría.
    /// Sin estación (pruebas o diseño) no existe frontera de elevación.
    /// </summary>
    public bool HasElevatedAccess => Station is null || Station.IsPlantManager;

    /// <summary>Se dispara cuando termina la elevación (salida manual, inactividad o cierre).</summary>
    public event EventHandler? PrivilegedAccessEnded;

    /// <summary>Estación, Auditoría, Estado y Configuración exigen elevación activa.</summary>
    public bool IsPageAllowed(object? page) =>
        page is not null && (!IsProtectedPage(page) || HasElevatedAccess);

    public bool IsHomePage => ReferenceEquals(CurrentPage, Home);
    public bool IsOperationPage => ReferenceEquals(CurrentPage, Operation);
    public bool IsStationPage => ReferenceEquals(CurrentPage, Station);
    public bool IsAuditPage => ReferenceEquals(CurrentPage, Audit);
    public bool IsDiagnosticsPage => ReferenceEquals(CurrentPage, Diagnostics);
    public bool IsSettingsPage => ReferenceEquals(CurrentPage, Settings);
    public bool IsAttendancePage => ReferenceEquals(CurrentPage, Attendance);
    public string CurrentPageTitle => CurrentPage switch
    {
        OperationViewModel => "Modo Operación",
        StationViewModel => "Estación",
        AuditViewModel => "Auditoría",
        AttendancePreviewViewModel => "Asistencia",
        SettingsViewModel => "Configuración",
        DiagnosticsViewModel => "Diagnóstico",
        _ => "Inicio",
    };

    public IRelayCommand ShowHomeCommand { get; }

    public IRelayCommand ShowDiagnosticsCommand { get; }
    public IAsyncRelayCommand ShowAuditCommand { get; }
    public IAsyncRelayCommand ShowAuditCorrectionsCommand { get; }
    public IAsyncRelayCommand ShowAttendanceIncidentsCommand { get; }
    public IRelayCommand DismissCorrectionNotificationCommand { get; }
    public IRelayCommand DismissResponsibilityWarningCommand { get; }
    public IAsyncRelayCommand ShowStationResponsibilityCommand { get; }
    public IRelayCommand ShowSettingsCommand { get; }
    public IAsyncRelayCommand ShowAttendanceCommand { get; }
    public IAsyncRelayCommand ShowStationCommand { get; }
    public IRelayCommand ShowOperationCommand { get; }
    public bool HasCorrectionNotification => correctionNotificationsReady &&
        LatestCorrection()?.OccurredAt > correctionNotificationStartedAt &&
        (Station is null || Station.IsPlantManager) &&
        !string.Equals(
            dismissedCorrectionNotificationKey,
            CurrentCorrectionNotificationKey(),
            StringComparison.Ordinal);
    public string CorrectionNotification => Diagnostics.CorrectionNotification;
    public bool HasResponsibilityWarning => Attendance?.HasResponsibilityWarning == true &&
        !string.Equals(
            dismissedResponsibilityWarningKey,
            Attendance.ResponsibilityWarningKey,
            StringComparison.Ordinal);
    public string ResponsibilityWarning => Attendance?.ResponsibilityWarning ?? string.Empty;

    public async Task InitializeAsync()
    {
        try
        {
            if (Station is not null)
            {
                await Station.InitializeAsync();
            }

            if (Operation is not null)
            {
                await Operation.InitializeAsync();
            }

            if (Audit is not null)
            {
                await Audit.InitializeAsync();
            }

            if (Attendance is not null)
            {
                await Attendance.InitializeAsync();
            }
        }
        catch (Exception exception) when (
            exception is IOException or SqliteException or InvalidOperationException)
        {
            // Recuperación de arranque: ocurre antes de desbloquear la estación (el shell aún está
            // oculto) y al abrir la sesión la navegación vuelve a Inicio.
            CurrentPage = Diagnostics;
        }

        await Diagnostics.RefreshAsync();
        EstablishCorrectionNotificationBaseline();
    }

    public void RecordActivity() => Station?.RecordActivity();

    private bool CanShowDiagnostics() => HasElevatedAccess;
    private bool CanShowAudit() => Audit is not null && HasElevatedAccess;
    private bool CanShowAttendanceIncidents() => CanShowAudit();
    private bool CanShowAuditCorrections() => CanShowAudit();
    private bool CanShowSettings() => Settings is not null && HasElevatedAccess;
    private bool CanShowStation() => Station is not null && HasElevatedAccess;

    private static bool IsProtectedPage(object page) =>
        page is StationViewModel or AuditViewModel or DiagnosticsViewModel or SettingsViewModel;

    // Los comandos de CommunityToolkit no revalidan CanExecute al llamar Execute directamente:
    // toda navegación pasa por esta compuerta además de deshabilitar el botón.
    private bool TryNavigate(object? page)
    {
        if (!IsPageAllowed(page)) return false;
        CurrentPage = page!;
        return true;
    }

    private async Task ShowOperationAsync()
    {
        if (Operation is null) return;
        await Operation.RefreshAsync();
        CurrentPage = Operation;
    }

    private async Task ShowStationAsync()
    {
        if (!CanShowStation()) return;
        await Station!.RefreshPreparationAsync();
        TryNavigate(Station);
    }

    private async Task ShowAttendanceAsync()
    {
        if (Attendance is null) return;
        CurrentPage = Attendance;
        await Attendance.RefreshAfterSynchronizationAsync();
    }

    private async Task ShowAuditAsync()
    {
        if (!TryNavigate(Audit)) return;
        await Audit!.RefreshAsync();
    }

    private async Task ShowAuditCorrectionsAsync()
    {
        if (!TryNavigate(Audit)) return;
        await Audit!.SelectCategoryCommand.ExecuteAsync(AuditCategory.Corrections);
        DismissCorrectionNotification();
    }

    private async Task ShowAttendanceIncidentsAsync()
    {
        if (!CanShowAttendanceIncidents()) return;
        await ShowAttendanceAuditAsync();
    }

    private async Task ShowAttendanceAuditAsync()
    {
        if (!TryNavigate(Audit)) return;
        await Audit!.SelectCategoryCommand.ExecuteAsync(AuditCategory.Attendance);
    }

    private void DismissCorrectionNotification()
    {
        dismissedCorrectionNotificationKey = CurrentCorrectionNotificationKey();
        OnPropertyChanged(nameof(HasCorrectionNotification));
        DismissCorrectionNotificationCommand.NotifyCanExecuteChanged();
    }

    private string CurrentCorrectionNotificationKey() => string.Join(
        '|',
        Diagnostics.Corrections
            .OrderByDescending(item => item.OccurredAt)
            .Take(1)
            .Select(item =>
                $"{item.OccurredAt.ToUniversalTime().Ticks}:{item.Action}:{item.EntityType}:{item.Reason}"));

    private AdministrativeCorrectionDiagnostic? LatestCorrection() => Diagnostics.Corrections
        .OrderByDescending(item => item.OccurredAt)
        .FirstOrDefault();

    private void EstablishCorrectionNotificationBaseline()
    {
        dismissedCorrectionNotificationKey = CurrentCorrectionNotificationKey();
        correctionNotificationsReady = true;
        OnPropertyChanged(nameof(HasCorrectionNotification));
        DismissCorrectionNotificationCommand.NotifyCanExecuteChanged();
    }

    private async Task ShowStationResponsibilityAsync()
    {
        if (!CanShowStation()) return;
        DismissResponsibilityWarning();
        await Station!.RefreshPreparationAsync();
        TryNavigate(Station);
    }

    private void DismissResponsibilityWarning()
    {
        dismissedResponsibilityWarningKey = Attendance?.ResponsibilityWarningKey;
        OnPropertyChanged(nameof(HasResponsibilityWarning));
        DismissResponsibilityWarningCommand.NotifyCanExecuteChanged();
        ShowStationResponsibilityCommand.NotifyCanExecuteChanged();
    }

    private void OnStationPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(StationViewModel.IsStationOpen))
        {
            OnPropertyChanged(nameof(IsStationOpen));
            if (Station?.IsStationOpen == true)
            {
                CurrentPage = Home;
            }
            return;
        }

        if (e.PropertyName == nameof(StationViewModel.IsApplicationUnlocked))
        {
            OnPropertyChanged(nameof(IsApplicationUnlocked));
            if (Station?.IsApplicationUnlocked == true)
            {
                CurrentPage = Home;
                if (Attendance is not null)
                {
                    _ = Attendance.RefreshAfterSynchronizationAsync();
                }
            }
            return;
        }

        if (e.PropertyName == nameof(StationViewModel.Mode))
        {
            OnElevationChanged();
        }
    }

    private void OnElevationChanged()
    {
        bool isElevated = HasElevatedAccess;
        OnPropertyChanged(nameof(IsPlantManager));
        OnPropertyChanged(nameof(HasElevatedAccess));
        ShowDiagnosticsCommand.NotifyCanExecuteChanged();
        ShowAuditCommand.NotifyCanExecuteChanged();
        ShowAuditCorrectionsCommand.NotifyCanExecuteChanged();
        ShowAttendanceIncidentsCommand.NotifyCanExecuteChanged();
        ShowSettingsCommand.NotifyCanExecuteChanged();
        ShowStationCommand.NotifyCanExecuteChanged();
        ShowStationResponsibilityCommand.NotifyCanExecuteChanged();
        OnPropertyChanged(nameof(HasCorrectionNotification));
        Attendance?.RefreshManagerMode();

        if (!isElevated && !IsPageAllowed(CurrentPage))
        {
            // Las operaciones pendientes viven en SQLite/Outbox y los borradores de Estación se
            // conservan en su ViewModel: salir de la vista no descarta ningún registro.
            CurrentPage = Operation ?? (object)Home;
        }

        bool ended = wasElevated && !isElevated;
        wasElevated = isElevated;
        if (ended)
        {
            PrivilegedAccessEnded?.Invoke(this, EventArgs.Empty);
        }
    }

    private void OnDiagnosticsPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName is not (nameof(DiagnosticsViewModel.HasCorrections) or
            nameof(DiagnosticsViewModel.CorrectionNotification))) return;
        OnPropertyChanged(nameof(HasCorrectionNotification));
        OnPropertyChanged(nameof(CorrectionNotification));
        DismissCorrectionNotificationCommand.NotifyCanExecuteChanged();
    }

    private void OnAttendancePropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName is not (
            nameof(AttendancePreviewViewModel.HasResponsibilityWarning) or
            nameof(AttendancePreviewViewModel.ResponsibilityWarning) or
            nameof(AttendancePreviewViewModel.ResponsibilityWarningKey))) return;
        OnPropertyChanged(nameof(HasResponsibilityWarning));
        OnPropertyChanged(nameof(ResponsibilityWarning));
        DismissResponsibilityWarningCommand.NotifyCanExecuteChanged();
        ShowStationResponsibilityCommand.NotifyCanExecuteChanged();
    }

    private void OnSyncStatusChanged(object? sender, SyncStatusNotification notification)
    {
        if (!notification.HasDataChanges) return;
        _ = uiDispatcher.InvokeAsync(RequestVisibleDataRefreshAfterSyncAsync);
    }

    private async Task RequestVisibleDataRefreshAfterSyncAsync()
    {
        isRefreshRequestedAfterSync = true;
        if (isRefreshingAfterSync) return;
        isRefreshingAfterSync = true;
        try
        {
            while (isRefreshRequestedAfterSync)
            {
                isRefreshRequestedAfterSync = false;
                try
                {
                    if (ReferenceEquals(CurrentPage, Audit) && Audit is not null)
                    {
                        await Audit.RefreshAsync();
                    }
                    else if (ReferenceEquals(CurrentPage, Attendance) && Attendance is not null)
                    {
                        await Attendance.RefreshAfterSynchronizationAsync();
                    }
                    else if (ReferenceEquals(CurrentPage, Station) && Station is not null)
                    {
                        await Station.RefreshPreparationAsync();
                    }
                    else if (ReferenceEquals(CurrentPage, Operation) && Operation is not null)
                    {
                        await Operation.RefreshAsync();
                    }
                }
                catch (Exception exception) when (
                    exception is IOException or SqliteException or InvalidOperationException)
                {
                    // El siguiente cambio o la apertura manual de la vista vuelve a consultar SQLite.
                }
            }
        }
        finally
        {
            isRefreshingAfterSync = false;
        }
    }

    public void Dispose()
    {
        if (Station is not null) Station.PropertyChanged -= OnStationPropertyChanged;
        Diagnostics.PropertyChanged -= OnDiagnosticsPropertyChanged;
        if (Attendance is not null) Attendance.PropertyChanged -= OnAttendancePropertyChanged;
        if (syncStatusNotifier is not null)
        {
            syncStatusNotifier.Changed -= OnSyncStatusChanged;
        }
        GC.SuppressFinalize(this);
    }
}
