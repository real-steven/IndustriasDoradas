using System.Net.Http;
using System.IO;
using System.Windows.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Configuration;
using IndustriasDoradas.Desktop.Domain;
using IndustriasDoradas.Desktop.Domain.Production;
using Microsoft.Extensions.Options;
using Microsoft.Data.Sqlite;

namespace IndustriasDoradas.Desktop.Presentation.ViewModels;

public enum LoginSessionState
{
    Checking,
    Available,
    NotFound,
    Closed,
    Expired,
    SignInFailed,
}

public sealed record StationLineStatus(
    Guid Id,
    string Name,
    bool IsPrepared,
    bool IsSelected,
    string AccentColor,
    string Detail);

// Se conserva para compatibilidad binaria con pruebas y extensiones anteriores.
// La interfaz actual registra únicamente entrada y saldo final por barrida.
public sealed record MercuryMovementOption(
    MercuryMovementKind Kind,
    string Name,
    string Description);

public sealed record MercurySweepOption(
    LocalMercurySweepTarget Source,
    string Description)
{
    public Guid Id => Source.Id;
}

public sealed class MercuryRastraEntryViewModel(
    CachedLineComponent component) : ObservableObject
{
    private string inputAmountText = string.Empty;
    private string remainderAmountText = string.Empty;
    private string currentDescription = "Entrada pendiente · saldo final pendiente";

    public CachedLineComponent Component { get; } = component;
    public Guid Id => Component.Id;
    public string Name => Component.Name;
    public string InputAmountText
    {
        get => inputAmountText;
        set => SetProperty(ref inputAmountText, value);
    }
    public string RemainderAmountText
    {
        get => remainderAmountText;
        set => SetProperty(ref remainderAmountText, value);
    }
    public string CurrentDescription
    {
        get => currentDescription;
        set => SetProperty(ref currentDescription, value);
    }
}

public sealed class StationViewModel : ObservableObject, IDisposable
{
    private readonly StationCoordinator coordinator;
    private readonly PrivilegeModeController modeController;
    private readonly ILocalCatalogRepository catalogs;
    private readonly LocalOperationService operations;
    private readonly TimeProvider timeProvider;
    private readonly ILocalOperationDashboardRepository? dashboard;
    private readonly RecordProductionSweepHandler? sweepHandler;
    private readonly PlantManagerModeState? sharedManagerMode;
    private readonly RecordMercuryMovementHandler? mercuryHandler;
    private readonly DispatcherTimer idleTimer;
    private bool isClosingForIdle;
    private bool isMaintainingSession;
    private bool wasSessionRestored;
    private bool isApplicationUnlocked;
    private LoginSessionState loginSessionState = LoginSessionState.Checking;
    private DateTimeOffset nextSessionMaintenanceAt = DateTimeOffset.MinValue;
    private ProtectedStationState? state;
    private string status = "Inicia sesión como jefe de planta para abrir la estación.";
    private string stationSessionStatus = "Estación cerrada.";
    private StationMode mode = StationMode.SignedOut;
    private bool isBusy;
    private string draft = string.Empty;
    private IReadOnlyList<CachedSupplier> suppliers = [];
    private IReadOnlyList<CachedWorker> workers = [];
    private IReadOnlyList<CachedProductionLine> lines = [];
    private IReadOnlyList<StationLineStatus> lineStatuses = [];
    private CachedSupplier? selectedSupplier;
    private CachedWorker? selectedWorker;
    private CachedProductionLine? pilotLine;
    private readonly Dictionary<Guid, LocalOperationalSession> activeSessions = [];
    private readonly Dictionary<Guid, string> activeSupplierNames = [];
    private LocalOperationalSession? activeSession;
    private PreparedOperationStart? preparedStart;
    private PreparedResponsibleRelief? preparedRelief;
    private PreparedOperationCompletion? preparedCompletion;
    private PreparedProductionSweep? preparedFinalSweep;
    private string preparationSummary =
        "Seleccione línea, proveedor y responsable para preparar el cargamento.";
    private string activeOperationSummary = "No hay un cargamento activo.";
    private string managementSummary = "Seleccione una acción para el cargamento activo.";
    private string activeSupplierName = "Proveedor registrado";
    private IReadOnlyList<MercuryRastraEntryViewModel> mercuryRastras = [];
    private IReadOnlyList<MercurySweepOption> mercurySweeps = [];
    private IReadOnlyList<LocalMercuryMovement> mercuryMovements = [];
    private MercurySweepOption? selectedMercurySweep;
    private string mercuryStatus = "Seleccione una línea activa para consultar sus rastras.";

    public StationViewModel(
        StationCoordinator coordinator,
        ILocalCatalogRepository catalogs,
        LocalOperationService operations,
        IOptions<StationOptions> options,
        TimeProvider timeProvider)
        : this(coordinator, catalogs, operations, options, timeProvider, null, null, null)
    {
    }

    public StationViewModel(
        StationCoordinator coordinator,
        ILocalCatalogRepository catalogs,
        LocalOperationService operations,
        IOptions<StationOptions> options,
        TimeProvider timeProvider,
        ILocalOperationDashboardRepository? dashboard)
        : this(coordinator, catalogs, operations, options, timeProvider, dashboard, null, null)
    {
    }

    public StationViewModel(
        StationCoordinator coordinator,
        ILocalCatalogRepository catalogs,
        LocalOperationService operations,
        IOptions<StationOptions> options,
        TimeProvider timeProvider,
        ILocalOperationDashboardRepository? dashboard,
        RecordProductionSweepHandler? sweepHandler)
        : this(coordinator, catalogs, operations, options, timeProvider, dashboard, sweepHandler, null)
    {
    }

    public StationViewModel(
        StationCoordinator coordinator,
        ILocalCatalogRepository catalogs,
        LocalOperationService operations,
        IOptions<StationOptions> options,
        TimeProvider timeProvider,
        ILocalOperationDashboardRepository? dashboard,
        RecordProductionSweepHandler? sweepHandler,
        PlantManagerModeState? sharedManagerMode)
        : this(
            coordinator,
            catalogs,
            operations,
            options,
            timeProvider,
            dashboard,
            sweepHandler,
            sharedManagerMode,
            null)
    {
    }

    public StationViewModel(
        StationCoordinator coordinator,
        ILocalCatalogRepository catalogs,
        LocalOperationService operations,
        IOptions<StationOptions> options,
        TimeProvider timeProvider,
        ILocalOperationDashboardRepository? dashboard,
        RecordProductionSweepHandler? sweepHandler,
        PlantManagerModeState? sharedManagerMode,
        RecordMercuryMovementHandler? mercuryHandler)
    {
        this.coordinator = coordinator;
        this.catalogs = catalogs;
        this.operations = operations;
        this.timeProvider = timeProvider;
        this.dashboard = dashboard;
        this.sweepHandler = sweepHandler;
        this.sharedManagerMode = sharedManagerMode;
        this.mercuryHandler = mercuryHandler;
        modeController = new PrivilegeModeController(
            timeProvider,
            TimeSpan.FromSeconds(options.Value.PrivilegedIdleSeconds),
            TimeSpan.FromSeconds(options.Value.SessionIdleSeconds));
        CloseStationCommand = new AsyncRelayCommand(CloseStationAsync, () => IsStationOpen && !IsBusy);
        ExitManagerModeCommand = new RelayCommand(ExitManagerMode);
        PrepareLineCommand = new AsyncRelayCommand(PrepareLineAsync, CanPrepareLine);
        ConfirmLineCommand = new AsyncRelayCommand(
            ConfirmLineAsync,
            () => IsPlantManager && preparedStart is not null && !IsBusy);
        CancelPreparationCommand = new RelayCommand(CancelPreparation, () => IsPlantManager && !IsBusy);
        PrepareReliefCommand = new AsyncRelayCommand(PrepareReliefAsync, CanPrepareRelief);
        ConfirmReliefCommand = new AsyncRelayCommand(
            ConfirmReliefAsync,
            () => IsPlantManager && preparedRelief is not null && !IsBusy);
        PrepareCompletionCommand = new AsyncRelayCommand(PrepareCompletionAsync, CanPrepareCompletion);
        ConfirmCompletionCommand = new AsyncRelayCommand(
            ConfirmCompletionAsync,
            () => IsPlantManager && preparedCompletion is not null && !IsBusy);
        CancelManagementChangeCommand = new RelayCommand(
            CancelManagementChange,
            () => IsPlantManager && !IsBusy && (preparedRelief is not null || preparedCompletion is not null));
        ShowComingSoonCommand = new RelayCommand<string>(ShowComingSoon);
        SelectLineCommand = new RelayCommand<Guid>(SelectLine);
        RecordMercuryCommand = new AsyncRelayCommand(RecordMercuryAsync, () => CanRecordMercury);
        RefreshMercuryCommand = new AsyncRelayCommand(RefreshMercuryAsync, () => !IsBusy);
        idleTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
        idleTimer.Tick += OnIdleTick;
        idleTimer.Start();
    }

    public string Status { get => status; private set => SetProperty(ref status, value); }
    public string StationSessionStatus
    {
        get => stationSessionStatus;
        private set => SetProperty(ref stationSessionStatus, value);
    }
    public StationMode Mode
    {
        get => mode;
        private set
        {
            if (SetProperty(ref mode, value))
            {
                sharedManagerMode?.SetActive(value == StationMode.PlantManager);
                OnPropertyChanged(nameof(IsPlantManager));
                OnPropertyChanged(nameof(CanPrepareNewShipment));
                OnPropertyChanged(nameof(CanManageActiveOperation));
                OnPropertyChanged(nameof(CanUseContextActions));
                OnPropertyChanged(nameof(CanRecordMercury));
                NotifyOperationCommands();
            }
        }
    }
    public bool IsBusy
    {
        get => isBusy;
        private set
        {
            if (SetProperty(ref isBusy, value))
            {
                OnPropertyChanged(nameof(CanInteract));
                OnPropertyChanged(nameof(NeedsCredentials));
                OnPropertyChanged(nameof(CanUseContextActions));
                OnPropertyChanged(nameof(CanRecordMercury));
                CloseStationCommand.NotifyCanExecuteChanged();
                NotifyOperationCommands();
            }
        }
    }
    public bool IsPlantManager => Mode == StationMode.PlantManager;
    public bool IsStationOpen => state is not null;
    public bool IsApplicationUnlocked
    {
        get => isApplicationUnlocked;
        private set
        {
            if (!SetProperty(ref isApplicationUnlocked, value)) return;
            OnPropertyChanged(nameof(HasRestorableSession));
            OnPropertyChanged(nameof(NeedsCredentials));
            OnPropertyChanged(nameof(LoginActionLabel));
            OnPropertyChanged(nameof(LoginPrompt));
        }
    }
    public LoginSessionState LoginSessionState
    {
        get => loginSessionState;
        private set
        {
            if (!SetProperty(ref loginSessionState, value)) return;
            OnPropertyChanged(nameof(LoginSessionTitle));
            OnPropertyChanged(nameof(LoginSessionDescription));
            OnPropertyChanged(nameof(LoginSessionColor));
            OnPropertyChanged(nameof(HasRestorableSession));
            OnPropertyChanged(nameof(NeedsCredentials));
            OnPropertyChanged(nameof(LoginActionLabel));
            OnPropertyChanged(nameof(LoginPrompt));
        }
    }
    public bool HasRestorableSession => state is not null && !IsApplicationUnlocked &&
        LoginSessionState == LoginSessionState.Available;
    public bool NeedsCredentials => !IsBusy && LoginSessionState != LoginSessionState.Checking;
    public string LoginActionLabel => HasRestorableSession
        ? "ABRIR SESIÓN  →"
        : "ABRIR ESTACIÓN  →";
    public string LoginPrompt => HasRestorableSession
        ? "Continúe sin contraseña o escriba sus credenciales para iniciar con otra cuenta."
        : "Ingrese sus credenciales de jefe de planta para abrir la estación.";
    public string LoginSessionTitle => LoginSessionState switch
    {
        LoginSessionState.Checking => "Buscando sesión protegida…",
        LoginSessionState.Available => "Sesión abierta · lista para continuar",
        LoginSessionState.Closed => "Sesión finalizada",
        LoginSessionState.Expired => "Sesión vencida o revocada",
        LoginSessionState.SignInFailed => "No se pudo iniciar sesión",
        _ => "Sesión no encontrada",
    };
    public string LoginSessionDescription => LoginSessionState switch
    {
        LoginSessionState.Checking => "Comprobando la sesión guardada en este equipo.",
        LoginSessionState.Available => "Presione Abrir sesión para entrar al sistema.",
        LoginSessionState.Closed => "Ingrese sus credenciales para iniciar una sesión nueva.",
        LoginSessionState.Expired => "La sesión anterior ya no es válida; autentíquese nuevamente.",
        LoginSessionState.SignInFailed => "Revise el correo, la contraseña o la conexión e inténtelo otra vez.",
        _ => "Ingrese su correo y contraseña para abrir la estación.",
    };
    public string LoginSessionColor => LoginSessionState switch
    {
        LoginSessionState.Checking => "#F2B84B",
        LoginSessionState.Available => "#62D78B",
        _ => "#EB6B70",
    };
    public bool WasSessionRestored
    {
        get => wasSessionRestored;
        private set => SetProperty(ref wasSessionRestored, value);
    }
    public bool CanInteract => !IsBusy;
    public bool HasActiveOperation => IsSelectedLineActive;
    public bool CanPrepareNewShipment => IsPlantManager && SelectedLine is not null && !IsSelectedLineActive;
    public bool CanManageActiveOperation => IsPlantManager && HasActiveOperation;
    public bool IsSelectedLineActive =>
        SelectedLine is not null && activeSession?.Status == LineFeedCycleStatus.Active &&
        activeSession.LineId == SelectedLine.Id;
    public bool CanUseContextActions => IsPlantManager && !IsBusy;
    public bool CanRequestStart => CanPrepareLine();
    public bool CanRequestRelief => CanPrepareRelief();
    public bool CanRequestCompletion => CanPrepareCompletion();
    public string ContextPanelTitle => IsSelectedLineActive
        ? $"Gestionar {PilotLineName}"
        : "Preparar una línea";
    public string ContextPanelDescription => IsSelectedLineActive
        ? "Consulte el cargamento actual, cambie el responsable o finalice el trabajo de esta línea."
        : "Seleccione línea, proveedor y responsable para iniciar un cargamento.";
    public string ActiveSupplierName => activeSupplierName;
    public IReadOnlyList<MercuryRastraEntryViewModel> MercuryRastras
    {
        get => mercuryRastras;
        private set
        {
            if (!SetProperty(ref mercuryRastras, value)) return;
            OnPropertyChanged(nameof(HasMercuryRastras));
            OnPropertyChanged(nameof(CanRecordMercury));
            RecordMercuryCommand.NotifyCanExecuteChanged();
        }
    }
    public bool HasMercuryRastras => MercuryRastras.Count > 0;
    public IReadOnlyList<MercurySweepOption> MercurySweeps
    {
        get => mercurySweeps;
        private set => SetProperty(ref mercurySweeps, value);
    }
    public MercurySweepOption? SelectedMercurySweep
    {
        get => selectedMercurySweep;
        set
        {
            if (!SetProperty(ref selectedMercurySweep, value)) return;
            OnPropertyChanged(nameof(CanRecordMercury));
            LoadMercuryInputs();
            RecordMercuryCommand.NotifyCanExecuteChanged();
        }
    }
    public bool CanRecordMercury => mercuryHandler is not null && IsPlantManager &&
        IsSelectedLineActive && HasMercuryRastras && !IsBusy &&
        SelectedMercurySweep is not null;
    public string MercuryStatus
    {
        get => mercuryStatus;
        private set => SetProperty(ref mercuryStatus, value);
    }
    public IReadOnlyList<CachedSupplier> Suppliers
    {
        get => suppliers;
        private set => SetProperty(ref suppliers, value);
    }
    public IReadOnlyList<CachedWorker> Workers
    {
        get => workers;
        private set => SetProperty(ref workers, value);
    }
    public IReadOnlyList<CachedProductionLine> Lines
    {
        get => lines;
        private set => SetProperty(ref lines, value);
    }
    public IReadOnlyList<StationLineStatus> LineStatuses
    {
        get => lineStatuses;
        private set => SetProperty(ref lineStatuses, value);
    }
    public CachedProductionLine? SelectedLine
    {
        get => pilotLine;
        set
        {
            if (!SetProperty(ref pilotLine, value)) return;
            OnPropertyChanged(nameof(PilotLineName));
            OnPropertyChanged(nameof(PrepareLineHeader));
            OnPropertyChanged(nameof(IsSelectedLineActive));
            OnPropertyChanged(nameof(ContextPanelTitle));
            OnPropertyChanged(nameof(ContextPanelDescription));
            RefreshSelectedActiveSession();
            UpdateLineStatuses();
            SelectionChanged();
        }
    }
    public CachedSupplier? SelectedSupplier
    {
        get => selectedSupplier;
        set
        {
            if (SetProperty(ref selectedSupplier, value)) SelectionChanged();
        }
    }
    public CachedWorker? SelectedWorker
    {
        get => selectedWorker;
        set
        {
            if (SetProperty(ref selectedWorker, value)) SelectionChanged();
        }
    }
    public string PilotLineName => pilotLine?.Name ?? "Seleccione una línea";
    public string PrepareLineHeader => pilotLine is null ? "Preparar línea" : $"Preparar {pilotLine.Name}";
    public string WorkPeriodDescription => WorkPeriodSchedule.At(timeProvider.GetUtcNow()) == WorkPeriod.Day
        ? "Diurna · calculada automáticamente desde las 06:00"
        : "Nocturna · calculada automáticamente desde las 18:00";
    public string PreparationSummary
    {
        get => preparationSummary;
        private set => SetProperty(ref preparationSummary, value);
    }
    public string ActiveOperationSummary
    {
        get => activeOperationSummary;
        private set => SetProperty(ref activeOperationSummary, value);
    }
    public string ManagementSummary
    {
        get => managementSummary;
        private set => SetProperty(ref managementSummary, value);
    }
    public string Draft
    {
        get => draft;
        set { if (SetProperty(ref draft, value)) modeController.Draft = value; }
    }
    public IRelayCommand ExitManagerModeCommand { get; }
    public IAsyncRelayCommand CloseStationCommand { get; }
    public IAsyncRelayCommand PrepareLineCommand { get; }
    public IAsyncRelayCommand ConfirmLineCommand { get; }
    public IRelayCommand CancelPreparationCommand { get; }
    public IAsyncRelayCommand PrepareReliefCommand { get; }
    public IAsyncRelayCommand ConfirmReliefCommand { get; }
    public IAsyncRelayCommand PrepareCompletionCommand { get; }
    public IAsyncRelayCommand ConfirmCompletionCommand { get; }
    public IRelayCommand CancelManagementChangeCommand { get; }
    public IRelayCommand<string> ShowComingSoonCommand { get; }
    public IRelayCommand<Guid> SelectLineCommand { get; }
    public IAsyncRelayCommand RecordMercuryCommand { get; }
    public IAsyncRelayCommand RefreshMercuryCommand { get; }

    public async Task InitializeAsync()
    {
        LoginSessionState = LoginSessionState.Checking;
        IsApplicationUnlocked = false;
        StationResumeResult resume = await coordinator
            .InspectResumeAsync(networkAvailable: true)
            .ConfigureAwait(true);
        state = resume.State;
        WasSessionRestored = state is not null;
        OnPropertyChanged(nameof(IsStationOpen));
        CloseStationCommand.NotifyCanExecuteChanged();
        if (state is not null)
        {
            LoginSessionState = LoginSessionState.Available;
            StationSessionStatus = "Estación con sesión protegida restaurada, encontrada y lista para continuar.";
            Status = "Sesión abierta encontrada. Presione Abrir sesión para entrar al sistema.";
            await LoadPreparationCatalogsAsync().ConfigureAwait(true);
            return;
        }

        LoginSessionState = resume.Status switch
        {
            StationResumeStatus.Closed => LoginSessionState.Closed,
            StationResumeStatus.ExpiredOrRevoked => LoginSessionState.Expired,
            _ => LoginSessionState.NotFound,
        };
        StationSessionStatus = LoginSessionTitle;
        Status = LoginSessionDescription;
    }

    public void EnterRestoredSession()
    {
        if (!HasRestorableSession) return;
        IsApplicationUnlocked = true;
        OpenOperationMode(
            "Sesión protegida restaurada. No necesita autenticarse nuevamente; Modo Operación activo.");
    }

    public async Task SignInAsync(string email, string password)
    {
        LoginSessionState = LoginSessionState.Checking;
        await RunAsync(async () =>
        {
            Status = "Abriendo y validando la estación…";
            state = await coordinator.SignInAsync(email, password).ConfigureAwait(true);
            WasSessionRestored = false;
            LoginSessionState = LoginSessionState.Available;
            IsApplicationUnlocked = true;
            OnPropertyChanged(nameof(IsStationOpen));
            CloseStationCommand.NotifyCanExecuteChanged();
            StationSessionStatus = "Estación abierta mediante autenticación reciente.";
            await LoadPreparationCatalogsAsync().ConfigureAwait(true);
            OpenOperationMode("Estación abierta. Modo Operación activo.");
        }, "No se pudo abrir la estación.").ConfigureAwait(true);

        if (state is null)
        {
            IsApplicationUnlocked = false;
            LoginSessionState = LoginSessionState.SignInFailed;
            StationSessionStatus = LoginSessionTitle;
            Status = LoginSessionDescription;
        }
    }

    public async Task ElevateAsync(string pin)
    {
        if (state is null) { Status = "Primero abre la estación."; return; }
        if (string.IsNullOrWhiteSpace(pin)) { Status = "Ingrese su PIN individual."; return; }
        await RunAsync(async () =>
        {
            Status = "Validando elevación individual…";
            PinAttemptResponse result = await coordinator.ElevateAsync(state, pin, networkAvailable: true).ConfigureAwait(true);
            if (result.Result == "ACCEPTED")
            {
                ProtectedStationState? refreshed = await coordinator
                    .RefreshAuthorizationAsync(state, refreshCatalogs: false)
                    .ConfigureAwait(true);
                if (refreshed is null)
                {
                    state = null;
                    IsApplicationUnlocked = false;
                    LoginSessionState = LoginSessionState.Expired;
                    modeController.CloseStation();
                    Mode = modeController.Mode;
                    StationSessionStatus = "Estación cerrada; la autorización ya no es válida.";
                    Status = "La autorización fue revocada. Inicie sesión nuevamente.";
                    OnPropertyChanged(nameof(IsStationOpen));
                    CloseStationCommand.NotifyCanExecuteChanged();
                    return;
                }

                if (refreshed.Authorization.OfflineValidUntil <= timeProvider.GetUtcNow())
                {
                    Status =
                        "El PIN fue aceptado, pero no se pudo renovar la autorización de la estación. " +
                        "Revise la conexión e inténtelo nuevamente.";
                    return;
                }

                state = refreshed;
                modeController.EnterPlantManagerMode();
                Mode = modeController.Mode;
                Status = "Modo Jefe de Planta activo. Se cerrará tras cinco minutos de inactividad total.";
                await LoadPreparationCatalogsAsync().ConfigureAwait(true);
            }
            else Status = $"Elevación rechazada: {result.Result}. Modo Operación continúa activo.";
        }, "No se pudo validar el PIN; Modo Operación continúa activo.");
    }

    public Task RecoverPasswordAsync(string email) => RunAsync(async () =>
    {
        await coordinator.RequestPasswordRecoveryAsync(email).ConfigureAwait(true);
        Status = "Si la cuenta existe, Supabase envió las instrucciones de recuperación.";
    }, "No se pudo solicitar la recuperación.");

    public void RecordActivity() => modeController.RecordActivity();
    public void Dispose() { idleTimer.Stop(); idleTimer.Tick -= OnIdleTick; GC.SuppressFinalize(this); }

    private Task CloseStationAsync() => RunAsync(async () =>
    {
        await coordinator.CloseSessionAsync().ConfigureAwait(true);
        state = null;
        WasSessionRestored = false;
        IsApplicationUnlocked = false;
        LoginSessionState = LoginSessionState.Closed;
        modeController.CloseStation();
        Mode = modeController.Mode;
        StationSessionStatus = "Estación cerrada manualmente.";
        Status = "Inicie sesión como jefe de planta para abrir la estación.";
        OnPropertyChanged(nameof(IsStationOpen));
        CloseStationCommand.NotifyCanExecuteChanged();
    }, "No se pudo cerrar la estación.");

    private async Task RunAsync(Func<Task> action, string failure)
    {
        IsBusy = true;
        try { await action().ConfigureAwait(true); }
        catch (Exception exception) when (exception is HttpRequestException or OperationCanceledException or InvalidOperationException or UnauthorizedAccessException or IOException or SqliteException) { Status = failure; }
        finally { IsBusy = false; }
    }

    private void OpenOperationMode(string message)
    {
        modeController.OpenOperationMode();
        Mode = modeController.Mode;
        nextSessionMaintenanceAt = timeProvider.GetUtcNow();
        Status = message;
    }
    private void ExitManagerMode()
    {
        CancelPreparation();
        CancelManagementChange();
        modeController.ExitPlantManagerMode();
        Mode = modeController.Mode;
        Status = "Modo Operación activo.";
    }
    private async void OnIdleTick(object? sender, EventArgs e)
    {
        if (isClosingForIdle || isMaintainingSession) return;
        if (modeController.EvaluateSessionIdleTimeout())
        {
            await CloseForIdleAsync().ConfigureAwait(true);
            return;
        }
        if (modeController.EvaluateIdleTimeout())
        {
            Mode = modeController.Mode;
            Status = "Modo Jefe de Planta cerrado por inactividad. Los cambios sin confirmar se conservan.";
        }
        await MaintainSessionIfRequiredAsync().ConfigureAwait(true);
    }

    private async Task CloseForIdleAsync()
    {
        if (isClosingForIdle) return;
        isClosingForIdle = true;
        try
        {
            await coordinator.CloseSessionAsync().ConfigureAwait(true);
            Status = "Estación cerrada tras una hora sin actividad. Inicie sesión para continuar.";
        }
        catch (Exception exception) when (exception is IOException or InvalidOperationException)
        {
            Status = "La estación se cerró por inactividad, pero no se pudo actualizar el estado protegido local.";
        }
        finally
        {
            state = null;
            WasSessionRestored = false;
            IsApplicationUnlocked = false;
            LoginSessionState = LoginSessionState.Expired;
            Mode = modeController.Mode;
            StationSessionStatus = "Estación cerrada por inactividad.";
            OnPropertyChanged(nameof(IsStationOpen));
            CloseStationCommand.NotifyCanExecuteChanged();
            isClosingForIdle = false;
        }
    }

    private async Task MaintainSessionIfRequiredAsync()
    {
        if (state is null || isMaintainingSession || timeProvider.GetUtcNow() < nextSessionMaintenanceAt)
            return;

        isMaintainingSession = true;
        nextSessionMaintenanceAt = timeProvider.GetUtcNow().AddMinutes(1);
        try
        {
            ProtectedStationState? maintained = await coordinator.MaintainSessionAsync(
                state,
                networkAvailable: true).ConfigureAwait(true);
            if (maintained is null)
            {
                state = null;
                WasSessionRestored = false;
                IsApplicationUnlocked = false;
                LoginSessionState = LoginSessionState.Expired;
                modeController.CloseStation();
                Mode = modeController.Mode;
                StationSessionStatus = "Estación cerrada; la sesión ya no es válida.";
                Status = "La sesión fue revocada o venció. Inicie sesión para continuar.";
                OnPropertyChanged(nameof(IsStationOpen));
                CloseStationCommand.NotifyCanExecuteChanged();
                return;
            }

            state = maintained;
            DateTimeOffset refreshAt = maintained.Tokens.ExpiresAt.AddMinutes(-5);
            nextSessionMaintenanceAt = refreshAt > timeProvider.GetUtcNow().AddMinutes(1)
                ? refreshAt
                : timeProvider.GetUtcNow().AddMinutes(1);
        }
        catch (Exception exception) when (exception is IOException or InvalidOperationException)
        {
            nextSessionMaintenanceAt = timeProvider.GetUtcNow().AddMinutes(1);
        }
        finally
        {
            isMaintainingSession = false;
        }
    }

    private async Task LoadPreparationCatalogsAsync()
    {
        if (state is null) return;
        Suppliers = await catalogs.ListActiveSuppliersAsync(state.Session.OrganizationId).ConfigureAwait(true);
        Workers = await catalogs.ListActiveWorkersAsync(state.Session.OrganizationId).ConfigureAwait(true);
        Guid? previousLineId = SelectedLine?.Id;
        Lines = await catalogs.ListActiveLinesAsync(
            state.Session.OrganizationId,
            state.Authorization.PlantId,
            state.Authorization.StationId).ConfigureAwait(true);
        UpdateLineStatuses();
        CachedProductionLine? preservedLine = previousLineId.HasValue
            ? Lines.FirstOrDefault(line => line.Id == previousLineId.Value)
            : null;
        bool previousLineBecameUnavailable = previousLineId.HasValue && preservedLine is null;
        SelectedLine = preservedLine ??
            (!previousLineId.HasValue && Lines.Count == 1 ? Lines[0] : null);
        OnPropertyChanged(nameof(WorkPeriodDescription));
        if (Lines.Count == 0)
        {
            Status = "No hay líneas disponibles en el catálogo local. Revise su activación administrativa.";
        }
        else if (Suppliers.Count == 0 && Workers.Count == 0)
        {
            Status = "Faltan proveedores o responsables activos en el catálogo local.";
        }
        else if (Suppliers.Count == 0)
        {
            Status = "No hay proveedores activos en el catálogo local.";
        }
        else if (Workers.Count == 0)
        {
            Status =
                "No hay responsables activos asignados a esta planta. " +
                "Deben solicitarse y aprobarse en el catálogo antes de preparar un cargamento.";
        }
        else if (previousLineBecameUnavailable)
        {
            Status =
                "La línea seleccionada ya no está disponible. Seleccione explícitamente otra línea antes de operar.";
        }
        else if (Lines.Count > 1 && SelectedLine is null)
        {
            Status =
                "Hay varias líneas asignadas. Seleccione explícitamente la línea antes de preparar el cargamento.";
        }
        await RefreshActiveOperationAsync().ConfigureAwait(true);
        NotifyOperationCommands();
    }

    private async Task PrepareLineAsync()
    {
        if (state is null || pilotLine is null || SelectedSupplier is null || SelectedWorker is null) return;
        await RunAsync(async () =>
        {
            preparedStart = await operations.PrepareStartAsync(
                pilotLine.Id,
                SelectedSupplier.Id,
                SelectedWorker.Id,
                OperationAuthority.From(state)).ConfigureAwait(true);
            PreparationSummary =
                $"{pilotLine.Name} · {SelectedSupplier.Name} · inicio automático al confirmar · " +
                $"responsable {SelectedWorker.Name}.";
            Status = "Revise el resumen y confirme para dejar la línea lista.";
            NotifyOperationCommands();
        }, "No se pudo preparar el cargamento con el contexto seleccionado.").ConfigureAwait(true);
    }

    private async Task ConfirmLineAsync()
    {
        PreparedOperationStart? prepared = preparedStart;
        if (prepared is null) return;
        await RunAsync(async () =>
        {
            LocalOperationContext confirmed = await operations.ConfirmStartAsync(prepared).ConfigureAwait(true);
            if (confirmed.Session is not null)
            {
                activeSupplierNames[confirmed.Session.LineId] =
                    SelectedSupplier?.Name ?? "Proveedor registrado";
            }
            SetActiveSession(confirmed.Session);
            preparedStart = null;
            Status = "Línea lista. Modo Jefe de Planta continúa activo.";
            PreparationSummary = "Cargamento confirmado y guardado localmente.";
            await RefreshMercuryAsync().ConfigureAwait(true);
            NotifyOperationCommands();
        }, "No se pudo confirmar el cargamento; el contexto anterior se conservó.").ConfigureAwait(true);
    }

    private async Task PrepareReliefAsync()
    {
        if (state is null || SelectedWorker is null || !HasActiveOperation) return;
        await RunAsync(async () =>
        {
            preparedCompletion = null;
            preparedRelief = await operations.PrepareReliefAsync(
                activeSession!.LineId,
                SelectedWorker.Id,
                OperationAuthority.From(state)).ConfigureAwait(true);
            string currentName = WorkerName(preparedRelief.ExpectedSession.ResponsibleWorkerId);
            ManagementSummary =
                $"Relevo pendiente: {currentName} → {SelectedWorker.Name}. " +
                "La línea y el responsable actual no cambiarán hasta confirmar.";
            Status = "Revise y confirme el relevo de responsable.";
            NotifyOperationCommands();
        }, "No se pudo preparar el relevo; el responsable actual se conservó.").ConfigureAwait(true);
    }

    private async Task ConfirmReliefAsync()
    {
        PreparedResponsibleRelief? prepared = preparedRelief;
        if (prepared is null) return;
        await RunAsync(async () =>
        {
            LocalOperationContext confirmed = await operations.ConfirmReliefAsync(prepared).ConfigureAwait(true);
            SetActiveSession(confirmed.Session);
            preparedRelief = null;
            ManagementSummary = "Relevo confirmado localmente; la línea continúa activa.";
            CompleteManagerAction("Responsable actualizado. Modo Jefe de Planta continúa activo.");
        }, "No se pudo confirmar el relevo; el responsable anterior se conservó.").ConfigureAwait(true);
    }

    private async Task PrepareCompletionAsync()
    {
        if (state is null || !HasActiveOperation) return;
        await RunAsync(async () =>
        {
            preparedRelief = null;
            preparedFinalSweep = sweepHandler is null
                ? null
                : await sweepHandler.PrepareFinalIfNeededAsync(
                    activeSession!.StationId,
                    activeSession.LineId).ConfigureAwait(true);
            preparedCompletion = await operations.PrepareCompletionAsync(
                activeSession!.LineId,
                OperationAuthority.From(state)).ConfigureAwait(true);
            ManagementSummary = preparedFinalSweep is null
                ? "Cierre pendiente: finalizará el cargamento y bloqueará nuevos registros. " +
                  "No hay cajuelas posteriores a la última barrida. La línea continúa activa hasta confirmar."
                : $"Cierre pendiente: antes de finalizar se registrará la barrida final de " +
                  $"{preparedFinalSweep.CajuelaQuantity} cajuelas. Las mediciones de mercurio por rastra quedarán pendientes.";
            Status = "Revise y confirme el cierre del cargamento.";
            NotifyOperationCommands();
        }, "No se pudo preparar el cierre; el cargamento continúa activo.").ConfigureAwait(true);
    }

    private async Task ConfirmCompletionAsync()
    {
        PreparedOperationCompletion? prepared = preparedCompletion;
        if (prepared is null) return;
        await RunAsync(async () =>
        {
            if (preparedFinalSweep is not null)
            {
                await sweepHandler!.ConfirmAsync(preparedFinalSweep, isFinal: true).ConfigureAwait(true);
                preparedFinalSweep = null;
            }
            await operations.ConfirmCompletionAsync(prepared).ConfigureAwait(true);
            preparedCompletion = null;
            RemoveActiveSession(prepared.ExpectedSession.LineId);
            ManagementSummary = "Cargamento finalizado localmente con su historial conservado.";
            CompleteManagerAction(
                "Cargamento finalizado. Puede preparar el siguiente; Modo Jefe de Planta continúa activo.");
        }, "No se pudo finalizar; el cargamento continúa activo.").ConfigureAwait(true);
    }

    private void CancelPreparation()
    {
        preparedStart = null;
        PreparationSummary = "Preparación cancelada; no se modificó la línea.";
        NotifyOperationCommands();
    }

    private void CancelManagementChange()
    {
        preparedRelief = null;
        preparedCompletion = null;
        preparedFinalSweep = null;
        ManagementSummary = "Cambio cancelado; el cargamento y responsable actuales se conservaron.";
        NotifyOperationCommands();
    }

    private bool CanPrepareLine() =>
        CanPrepareNewShipment && !IsBusy && pilotLine is not null &&
        SelectedSupplier is not null && SelectedWorker is not null;

    private bool CanPrepareRelief() =>
        IsPlantManager && IsSelectedLineActive && !IsBusy && SelectedWorker is not null &&
        SelectedWorker.Id != activeSession!.ResponsibleWorkerId;

    private bool CanPrepareCompletion() => IsPlantManager && IsSelectedLineActive && !IsBusy;

    private void SelectionChanged()
    {
        preparedStart = null;
        preparedRelief = null;
        preparedCompletion = null;
        preparedFinalSweep = null;
        PreparationSummary = SelectedLine is null || SelectedSupplier is null || SelectedWorker is null
            ? "Seleccione línea, proveedor y responsable para preparar el cargamento."
            : $"{PilotLineName} · {SelectedSupplier.Name} · responsable {SelectedWorker.Name}.";
        NotifyOperationCommands();
    }

    private async Task RefreshActiveOperationAsync()
    {
        if (state is null) return;
        IReadOnlyList<LocalOperationContext> contexts = await operations
            .GetContextsAsync(state.Authorization.StationId)
            .ConfigureAwait(true);
        activeSessions.Clear();
        foreach (LocalOperationContext context in contexts)
        {
            if (context.Session?.Status == LineFeedCycleStatus.Active)
            {
                activeSessions[context.Session.LineId] = context.Session;
            }
        }

        activeSupplierNames.Clear();
        if (dashboard is not null && activeSessions.Count > 0)
        {
            IReadOnlyList<LocalOperationDashboardSnapshot> snapshots =
                await dashboard.ListAsync(state.Authorization.StationId).ConfigureAwait(true);
            foreach (LocalOperationDashboardSnapshot snapshot in snapshots)
            {
                if (activeSessions.ContainsKey(snapshot.LineId))
                {
                    activeSupplierNames[snapshot.LineId] =
                        snapshot.SupplierName ?? "Proveedor registrado";
                }
            }
        }

        RefreshSelectedActiveSession();
    }

    private void SetActiveSession(LocalOperationalSession? session)
    {
        if (session is not null)
        {
            activeSessions[session.LineId] = session;
        }
        RefreshSelectedActiveSession();
    }

    private void RemoveActiveSession(Guid lineId)
    {
        activeSessions.Remove(lineId);
        activeSupplierNames.Remove(lineId);
        RefreshSelectedActiveSession();
    }

    private void RefreshSelectedActiveSession()
    {
        activeSession = SelectedLine is not null &&
            activeSessions.TryGetValue(SelectedLine.Id, out LocalOperationalSession? selectedSession)
                ? selectedSession
                : null;
        activeSupplierName = SelectedLine is not null &&
            activeSupplierNames.TryGetValue(SelectedLine.Id, out string? supplierName)
                ? supplierName
                : "Proveedor registrado";
        OnPropertyChanged(nameof(ActiveSupplierName));
        UpdateLineStatuses();
        OnPropertyChanged(nameof(HasActiveOperation));
        OnPropertyChanged(nameof(CanPrepareNewShipment));
        OnPropertyChanged(nameof(CanManageActiveOperation));
        OnPropertyChanged(nameof(IsSelectedLineActive));
        OnPropertyChanged(nameof(ContextPanelTitle));
        OnPropertyChanged(nameof(ContextPanelDescription));
        OnPropertyChanged(nameof(CanUseContextActions));
        ActiveOperationSummary = activeSession is null
            ? "No hay un cargamento activo."
            : $"{LineName(activeSession.LineId)} · cargamento iniciado {FormatLocalTime(activeSession.StartedAt)} · " +
              $"responsable {WorkerName(activeSession.ResponsibleWorkerId)}.";
        _ = RefreshMercurySafelyAsync();
        NotifyOperationCommands();
    }

    private async Task RefreshMercurySafelyAsync()
    {
        try
        {
            await RefreshMercuryAsync().ConfigureAwait(true);
        }
        catch (Exception exception) when (
            exception is IOException or SqliteException or InvalidOperationException)
        {
            MercuryRastras = [];
            MercurySweeps = [];
            mercuryMovements = [];
            MercuryStatus = "No se pudo leer el registro local de mercurio.";
        }
    }

    private async Task RefreshMercuryAsync()
    {
        LocalOperationalSession? session = activeSession;
        if (mercuryHandler is null || session is null)
        {
            MercuryRastras = [];
            MercurySweeps = [];
            mercuryMovements = [];
            SelectedMercurySweep = null;
            MercuryStatus = session is null
                ? "Seleccione una línea activa para consultar sus rastras."
                : "El registro de mercurio no está disponible.";
            return;
        }

        IReadOnlyList<CachedLineComponent> components = await mercuryHandler.ListRastrasAsync(
                session.OrganizationId,
                session.LineId)
            .ConfigureAwait(true);
        IReadOnlyList<MercurySweepOption> sweeps = (await mercuryHandler.ListSweepsAsync(session.ShipmentId)
                .ConfigureAwait(true))
            .Select((sweep, index) => new MercurySweepOption(
                sweep,
                $"Barrida {index + 1} · {sweep.CajuelaCount} cajuelas" +
                (sweep.IsFinal ? " · final" : string.Empty)))
            .ToArray();
        IReadOnlyList<LocalMercuryMovement> movements = await mercuryHandler.ListCurrentAsync(session.ShipmentId)
            .ConfigureAwait(true);
        if (activeSession?.ShipmentId != session.ShipmentId) return;

        MercuryRastras = components.Select(component => new MercuryRastraEntryViewModel(component))
            .ToArray();
        MercurySweeps = sweeps;
        mercuryMovements = movements;
        SelectedMercurySweep = PreserveSweep(SelectedMercurySweep, MercurySweeps);
        LoadMercuryInputs();
        MercuryStatus = components.Count == 0
            ? "Esta línea todavía no tiene rastras disponibles en el catálogo local."
            : "Seleccione una barrida y registre, por cada rastra, cuánto entró y cuánto quedó al final. Vacío significa pendiente.";
    }

    private async Task RecordMercuryAsync()
    {
        LocalOperationalSession? session = activeSession;
        if (mercuryHandler is null || session is null || !CanRecordMercury) return;
        RecordActivity();
        var parsed = new List<(MercuryRastraEntryViewModel Rastra, decimal? Input, decimal? Remainder)>();
        foreach (MercuryRastraEntryViewModel rastra in MercuryRastras)
        {
            if (!TryParseMercury(rastra.InputAmountText, out decimal? input, out string? inputError))
            {
                MercuryStatus = $"{rastra.Name}, mercurio que entró: {inputError}";
                return;
            }
            if (!TryParseMercury(
                    rastra.RemainderAmountText,
                    out decimal? remainder,
                    out string? remainderError))
            {
                MercuryStatus = $"{rastra.Name}, mercurio que quedó al final: {remainderError}";
                return;
            }
            parsed.Add((rastra, input, remainder));
        }

        IsBusy = true;
        try
        {
            foreach ((MercuryRastraEntryViewModel rastra, decimal? input, decimal? remainder) in parsed)
            {
                await mercuryHandler.RecordAsync(
                        session.StationId,
                        session.ShipmentId,
                        rastra.Id,
                        MercuryMovementKind.SweepInput,
                        input,
                        SelectedMercurySweep!.Id,
                        replaceCurrent: true)
                    .ConfigureAwait(true);
                await mercuryHandler.RecordAsync(
                        session.StationId,
                        session.ShipmentId,
                        rastra.Id,
                        MercuryMovementKind.SweepRemainder,
                        remainder,
                        SelectedMercurySweep.Id,
                        replaceCurrent: true)
                    .ConfigureAwait(true);
            }
            await RefreshMercuryAsync().ConfigureAwait(true);
            MercuryStatus = $"Entrada y saldo final guardados para {parsed.Count} rastra(s). " +
                "Modo Jefe de Planta continúa activo.";
        }
        catch (Exception exception) when (
            exception is IOException or SqliteException or InvalidOperationException or UnauthorizedAccessException)
        {
            MercuryStatus = exception is UnauthorizedAccessException
                ? exception.Message
                : "No se pudieron guardar las mediciones de mercurio; los datos anteriores se conservaron.";
        }
        finally
        {
            IsBusy = false;
        }
    }

    private void LoadMercuryInputs()
    {
        Guid? sweepId = SelectedMercurySweep?.Id;
        foreach (MercuryRastraEntryViewModel rastra in MercuryRastras)
        {
            LocalMercuryMovement? input = mercuryMovements.LastOrDefault(item =>
                item.LineComponentId == rastra.Id &&
                item.Kind == MercuryMovementKind.SweepInput &&
                item.SweepId == sweepId);
            LocalMercuryMovement? remainder = mercuryMovements.LastOrDefault(item =>
                item.LineComponentId == rastra.Id &&
                item.Kind == MercuryMovementKind.SweepRemainder &&
                item.SweepId == sweepId);
            rastra.CurrentDescription =
                $"Entró {FormatMercury(input?.AmountGrams)} · quedó {FormatMercury(remainder?.AmountGrams)}";
            rastra.InputAmountText = FormatMercuryInput(input?.AmountGrams);
            rastra.RemainderAmountText = FormatMercuryInput(remainder?.AmountGrams);
        }
    }

    private static MercurySweepOption? PreserveSweep(
        MercurySweepOption? current,
        IReadOnlyList<MercurySweepOption> available) =>
        current is null
            ? (available.Count == 0 ? null : available[0])
            : available.FirstOrDefault(item => item.Id == current.Id) ??
              (available.Count == 0 ? null : available[0]);

    private static bool TryParseMercury(
        string? text,
        out decimal? amount,
        out string? error)
    {
        string normalized = (text ?? string.Empty).Trim().Replace(',', '.');
        if (normalized.Length == 0)
        {
            amount = null;
            error = null;
            return true;
        }
        if (!decimal.TryParse(
                normalized,
                System.Globalization.NumberStyles.AllowDecimalPoint,
                System.Globalization.CultureInfo.InvariantCulture,
                out decimal value) ||
            value < 0 || decimal.Round(value, 2) != value)
        {
            amount = null;
            error = "use un número positivo o cero con máximo dos decimales.";
            return false;
        }
        amount = value;
        error = null;
        return true;
    }

    private static string FormatMercury(decimal? amount) =>
        amount is null
            ? "pendiente"
            : $"{amount.Value.ToString("0.##", System.Globalization.CultureInfo.InvariantCulture)} g";

    private static string FormatMercuryInput(decimal? amount) =>
        amount?.ToString("0.##", System.Globalization.CultureInfo.InvariantCulture) ?? string.Empty;

    private void UpdateLineStatuses()
    {
        string[] accents = ["#8959DD", "#35ADDD", "#ED70A9", "#F19B2C"];
        LineStatuses = Lines.Select((line, index) => new StationLineStatus(
            line.Id,
            line.Name,
            activeSessions.ContainsKey(line.Id),
            SelectedLine?.Id == line.Id,
            accents[index % accents.Length],
            activeSessions.TryGetValue(line.Id, out LocalOperationalSession? session)
                ? $"Activa · {SupplierName(line.Id)} · {WorkerName(session.ResponsibleWorkerId)}"
                : "Disponible para preparar")).ToArray();
    }

    private void SelectLine(Guid lineId)
    {
        CachedProductionLine? selected = Lines.FirstOrDefault(line => line.Id == lineId);
        if (selected is null) return;
        SelectedLine = selected;
        if (!IsSelectedLineActive || activeSession is null) return;
        SelectedWorker = Workers.FirstOrDefault(worker => worker.Id == activeSession.ResponsibleWorkerId);
        SelectedSupplier = Suppliers.FirstOrDefault(supplier =>
            string.Equals(supplier.Name, activeSupplierName, StringComparison.OrdinalIgnoreCase));
        PreparationSummary = ActiveOperationSummary;
    }

    private void ShowComingSoon(string? feature) =>
        Status = $"{(string.IsNullOrWhiteSpace(feature) ? "Esta función" : feature)} estará disponible próximamente.";

    private string WorkerName(Guid workerId) =>
        Workers.FirstOrDefault(worker => worker.Id == workerId)?.Name ?? "responsable registrado";

    private string LineName(Guid lineId) =>
        Lines.FirstOrDefault(line => line.Id == lineId)?.Name ?? "Línea registrada";

    private string SupplierName(Guid lineId) =>
        activeSupplierNames.TryGetValue(lineId, out string? supplierName)
            ? supplierName
            : "Proveedor registrado";

    private static string FormatLocalTime(DateTimeOffset instant) =>
        instant.ToOffset(TimeSpan.FromHours(-6)).ToString(
            "dd/MM/yyyy HH:mm",
            System.Globalization.CultureInfo.InvariantCulture);

    private void CompleteManagerAction(string message)
    {
        Status = message;
        NotifyOperationCommands();
    }

    private void NotifyOperationCommands()
    {
        OnPropertyChanged(nameof(CanRequestStart));
        OnPropertyChanged(nameof(CanRequestRelief));
        OnPropertyChanged(nameof(CanRequestCompletion));
        PrepareLineCommand.NotifyCanExecuteChanged();
        ConfirmLineCommand.NotifyCanExecuteChanged();
        CancelPreparationCommand.NotifyCanExecuteChanged();
        PrepareReliefCommand.NotifyCanExecuteChanged();
        ConfirmReliefCommand.NotifyCanExecuteChanged();
        PrepareCompletionCommand.NotifyCanExecuteChanged();
        ConfirmCompletionCommand.NotifyCanExecuteChanged();
        CancelManagementChangeCommand.NotifyCanExecuteChanged();
        RecordMercuryCommand.NotifyCanExecuteChanged();
        RefreshMercuryCommand.NotifyCanExecuteChanged();
    }
}
