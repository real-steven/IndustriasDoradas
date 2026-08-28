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

public sealed class StationViewModel : ObservableObject, IDisposable
{
    private readonly StationCoordinator coordinator;
    private readonly PrivilegeModeController modeController;
    private readonly ILocalCatalogRepository catalogs;
    private readonly LocalOperationService operations;
    private readonly TimeProvider timeProvider;
    private readonly DispatcherTimer idleTimer;
    private ProtectedStationState? state;
    private string status = "Inicia sesión como jefe de planta para abrir la estación.";
    private string stationSessionStatus = "Estación cerrada.";
    private StationMode mode = StationMode.SignedOut;
    private bool isBusy;
    private string draft = string.Empty;
    private IReadOnlyList<CachedSupplier> suppliers = [];
    private IReadOnlyList<CachedWorker> workers = [];
    private CachedSupplier? selectedSupplier;
    private CachedWorker? selectedWorker;
    private CachedProductionLine? pilotLine;
    private LocalOperationalSession? activeSession;
    private PreparedOperationStart? preparedStart;
    private PreparedResponsibleRelief? preparedRelief;
    private PreparedOperationCompletion? preparedCompletion;
    private string preparationSummary = "Seleccione proveedor y responsable para preparar la línea.";
    private string activeOperationSummary = "No hay un cargamento activo.";
    private string managementSummary = "Seleccione una acción para el cargamento activo.";

    public StationViewModel(
        StationCoordinator coordinator,
        ILocalCatalogRepository catalogs,
        LocalOperationService operations,
        IOptions<StationOptions> options,
        TimeProvider timeProvider)
    {
        this.coordinator = coordinator;
        this.catalogs = catalogs;
        this.operations = operations;
        this.timeProvider = timeProvider;
        modeController = new PrivilegeModeController(timeProvider, TimeSpan.FromSeconds(options.Value.PrivilegedIdleSeconds));
        ExitManagerModeCommand = new RelayCommand(ExitManagerMode);
        PrepareLineCommand = new AsyncRelayCommand(PrepareLineAsync, CanPrepareLine);
        ConfirmLineCommand = new AsyncRelayCommand(ConfirmLineAsync, () => preparedStart is not null && !IsBusy);
        CancelPreparationCommand = new RelayCommand(CancelPreparation, () => IsPlantManager && !IsBusy);
        PrepareReliefCommand = new AsyncRelayCommand(PrepareReliefAsync, CanPrepareRelief);
        ConfirmReliefCommand = new AsyncRelayCommand(
            ConfirmReliefAsync,
            () => preparedRelief is not null && !IsBusy);
        PrepareCompletionCommand = new AsyncRelayCommand(PrepareCompletionAsync, CanPrepareCompletion);
        ConfirmCompletionCommand = new AsyncRelayCommand(
            ConfirmCompletionAsync,
            () => preparedCompletion is not null && !IsBusy);
        CancelManagementChangeCommand = new RelayCommand(
            CancelManagementChange,
            () => IsPlantManager && !IsBusy && (preparedRelief is not null || preparedCompletion is not null));
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
                NotifyOperationCommands();
            }
        }
    }
    public bool IsPlantManager => Mode == StationMode.PlantManager;
    public bool IsStationOpen => state is not null;
    public bool CanInteract => !IsBusy;
    public bool HasActiveOperation => activeSession?.Status == LineFeedCycleStatus.Active;
    public bool CanPrepareNewShipment => IsPlantManager && !HasActiveOperation;
    public bool CanManageActiveOperation => IsPlantManager && HasActiveOperation;
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
    public string PilotLineName => pilotLine?.Name ?? "Línea 1 no disponible";
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
    public IAsyncRelayCommand PrepareLineCommand { get; }
    public IAsyncRelayCommand ConfirmLineCommand { get; }
    public IRelayCommand CancelPreparationCommand { get; }
    public IAsyncRelayCommand PrepareReliefCommand { get; }
    public IAsyncRelayCommand ConfirmReliefCommand { get; }
    public IAsyncRelayCommand PrepareCompletionCommand { get; }
    public IAsyncRelayCommand ConfirmCompletionCommand { get; }
    public IRelayCommand CancelManagementChangeCommand { get; }

    public async Task InitializeAsync()
    {
        state = await coordinator.ResumeAsync(networkAvailable: true).ConfigureAwait(true);
        OnPropertyChanged(nameof(IsStationOpen));
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
        OnPropertyChanged(nameof(IsStationOpen));
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
                modeController.EnterPlantManagerMode();
                Mode = modeController.Mode;
                Status = "Modo Jefe de Planta activo. Se cerrará tras dos minutos de inactividad total.";
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

    private async Task RunAsync(Func<Task> action, string failure)
    {
        IsBusy = true;
        try { await action().ConfigureAwait(true); }
        catch (Exception exception) when (exception is HttpRequestException or OperationCanceledException or InvalidOperationException or UnauthorizedAccessException or IOException or SqliteException) { Status = failure; }
        finally { IsBusy = false; }
    }

    private void OpenOperationMode(string message) { modeController.OpenOperationMode(); Mode = modeController.Mode; Status = message; }
    private void ExitManagerMode()
    {
        CancelPreparation();
        CancelManagementChange();
        modeController.ExitPlantManagerMode();
        Mode = modeController.Mode;
        Status = "Modo Operación activo.";
    }
    private void OnIdleTick(object? sender, EventArgs e)
    {
        if (!modeController.EvaluateIdleTimeout()) return;
        CancelPreparation();
        CancelManagementChange();
        Mode = modeController.Mode;
        Status = "Modo Jefe de Planta cerrado por inactividad. El borrador se conserva.";
    }

    private async Task LoadPreparationCatalogsAsync()
    {
        if (state is null) return;
        Suppliers = await catalogs.ListActiveSuppliersAsync(state.Session.OrganizationId).ConfigureAwait(true);
        Workers = await catalogs.ListActiveWorkersAsync(state.Session.OrganizationId).ConfigureAwait(true);
        IReadOnlyList<CachedProductionLine> lines = await catalogs.ListActiveLinesAsync(
            state.Session.OrganizationId,
            state.Authorization.PlantId).ConfigureAwait(true);
        pilotLine = lines.Count == 1 ? lines[0] : null;
        OnPropertyChanged(nameof(PilotLineName));
        OnPropertyChanged(nameof(WorkPeriodDescription));
        if (lines.Count != 1)
        {
            Status = lines.Count == 0
                ? "No hay una línea activa en el catálogo local. Revise la configuración del piloto."
                : "El piloto requiere exactamente una línea activa antes de preparar el cargamento.";
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
            SetActiveSession(confirmed.Session);
            preparedStart = null;
            modeController.ExitPlantManagerMode();
            Mode = modeController.Mode;
            Status = "Línea lista. Abra Modo Operación para comenzar el registro.";
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
            ExitManagerAfterChange("Responsable actualizado. La línea continúa activa.");
        }, "No se pudo confirmar el relevo; el responsable anterior se conservó.").ConfigureAwait(true);
    }

    private async Task PrepareCompletionAsync()
    {
        if (state is null || !HasActiveOperation) return;
        await RunAsync(async () =>
        {
            preparedRelief = null;
            preparedCompletion = await operations.PrepareCompletionAsync(
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
            SetActiveSession(null);
            ManagementSummary = "Cargamento finalizado localmente con su historial conservado.";
            ExitManagerAfterChange("Cargamento finalizado. Puede preparar el siguiente cargamento.");
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
        IsPlantManager && HasActiveOperation && !IsBusy && SelectedWorker is not null &&
        SelectedWorker.Id != activeSession!.ResponsibleWorkerId;

    private bool CanPrepareCompletion() => IsPlantManager && HasActiveOperation && !IsBusy;

    private void SelectionChanged()
    {
        preparedStart = null;
        preparedRelief = null;
        PreparationSummary = SelectedSupplier is null || SelectedWorker is null
            ? "Seleccione proveedor y responsable para preparar la línea."
            : $"{PilotLineName} · {SelectedSupplier.Name} · responsable {SelectedWorker.Name}.";
        NotifyOperationCommands();
    }

    private async Task RefreshActiveOperationAsync()
    {
        if (state is null) return;
        LocalOperationContext context = await operations.GetContextAsync(state.Authorization.StationId)
            .ConfigureAwait(true);
        SetActiveSession(context.Session?.Status == LineFeedCycleStatus.Active ? context.Session : null);
    }

    private void SetActiveSession(LocalOperationalSession? session)
    {
        activeSession = session;
        OnPropertyChanged(nameof(HasActiveOperation));
        OnPropertyChanged(nameof(CanPrepareNewShipment));
        OnPropertyChanged(nameof(CanManageActiveOperation));
        ActiveOperationSummary = session is null
            ? "No hay un cargamento activo."
            : $"{PilotLineName} · cargamento iniciado {FormatLocalTime(session.StartedAt)} · " +
              $"responsable {WorkerName(session.ResponsibleWorkerId)}.";
        NotifyOperationCommands();
    }

    private string WorkerName(Guid workerId) =>
        Workers.FirstOrDefault(worker => worker.Id == workerId)?.Name ?? "responsable registrado";

    private static string FormatLocalTime(DateTimeOffset instant) =>
        instant.ToOffset(TimeSpan.FromHours(-6)).ToString(
            "dd/MM/yyyy HH:mm",
            System.Globalization.CultureInfo.InvariantCulture);

    private void ExitManagerAfterChange(string message)
    {
        modeController.ExitPlantManagerMode();
        Mode = modeController.Mode;
        Status = message;
        NotifyOperationCommands();
    }

    private void NotifyOperationCommands()
    {
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
