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

public sealed record StationLineStatus(
    Guid Id,
    string Name,
    bool IsPrepared,
    bool IsSelected,
    string AccentColor,
    string Detail);

public sealed class StationViewModel : ObservableObject, IDisposable
{
    private readonly StationCoordinator coordinator;
    private readonly PrivilegeModeController modeController;
    private readonly ILocalCatalogRepository catalogs;
    private readonly LocalOperationService operations;
    private readonly TimeProvider timeProvider;
    private readonly ILocalOperationDashboardRepository? dashboard;
    private readonly DispatcherTimer idleTimer;
    private bool isClosingForIdle;
    private bool isMaintainingSession;
    private bool wasSessionRestored;
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
    private string preparationSummary =
        "Seleccione línea, proveedor y responsable para preparar el cargamento.";
    private string activeOperationSummary = "No hay un cargamento activo.";
    private string managementSummary = "Seleccione una acción para el cargamento activo.";
    private string activeSupplierName = "Proveedor registrado";

    public StationViewModel(
        StationCoordinator coordinator,
        ILocalCatalogRepository catalogs,
        LocalOperationService operations,
        IOptions<StationOptions> options,
        TimeProvider timeProvider)
        : this(coordinator, catalogs, operations, options, timeProvider, null)
    {
    }

    public StationViewModel(
        StationCoordinator coordinator,
        ILocalCatalogRepository catalogs,
        LocalOperationService operations,
        IOptions<StationOptions> options,
        TimeProvider timeProvider,
        ILocalOperationDashboardRepository? dashboard)
    {
        this.coordinator = coordinator;
        this.catalogs = catalogs;
        this.operations = operations;
        this.timeProvider = timeProvider;
        this.dashboard = dashboard;
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
                OnPropertyChanged(nameof(IsPlantManager));
                OnPropertyChanged(nameof(CanPrepareNewShipment));
                OnPropertyChanged(nameof(CanManageActiveOperation));
                OnPropertyChanged(nameof(CanUseContextActions));
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
                OnPropertyChanged(nameof(CanUseContextActions));
                CloseStationCommand.NotifyCanExecuteChanged();
                NotifyOperationCommands();
            }
        }
    }
    public bool IsPlantManager => Mode == StationMode.PlantManager;
    public bool IsStationOpen => state is not null;
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

    public async Task InitializeAsync()
    {
        state = await coordinator.ResumeAsync(networkAvailable: true).ConfigureAwait(true);
        WasSessionRestored = state is not null;
        OnPropertyChanged(nameof(IsStationOpen));
        CloseStationCommand.NotifyCanExecuteChanged();
        if (state is not null)
        {
            StationSessionStatus = "Estación abierta mediante sesión protegida restaurada.";
            OpenOperationMode(
                "Sesión protegida de estación restaurada. No necesita abrirla nuevamente; Modo Operación activo.");
            await LoadPreparationCatalogsAsync().ConfigureAwait(true);
        }
    }

    public Task SignInAsync(string email, string password) => RunAsync(async () =>
    {
        Status = "Abriendo y validando la estación…";
        state = await coordinator.SignInAsync(email, password).ConfigureAwait(true);
        WasSessionRestored = false;
        OnPropertyChanged(nameof(IsStationOpen));
        CloseStationCommand.NotifyCanExecuteChanged();
        StationSessionStatus = "Estación abierta mediante autenticación reciente.";
        await LoadPreparationCatalogsAsync().ConfigureAwait(true);
        OpenOperationMode("Estación abierta. Modo Operación activo.");
    }, "No se pudo abrir la estación.");

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
            preparedCompletion = await operations.PrepareCompletionAsync(
                activeSession!.LineId,
                OperationAuthority.From(state)).ConfigureAwait(true);
            ManagementSummary =
                "Cierre pendiente: finalizará el cargamento y bloqueará nuevos registros. " +
                "La línea continúa activa hasta confirmar.";
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
        NotifyOperationCommands();
    }

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
    }
}
