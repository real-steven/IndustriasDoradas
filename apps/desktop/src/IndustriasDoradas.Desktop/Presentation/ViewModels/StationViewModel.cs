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
    private StationMode mode = StationMode.SignedOut;
    private bool isBusy;
    private string draft = string.Empty;
    private IReadOnlyList<CachedSupplier> suppliers = [];
    private IReadOnlyList<CachedWorker> workers = [];
    private CachedSupplier? selectedSupplier;
    private CachedWorker? selectedWorker;
    private CachedProductionLine? pilotLine;
    private PreparedOperationStart? preparedStart;
    private string preparationSummary = "Seleccione proveedor y responsable para preparar la línea.";

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
        idleTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
        idleTimer.Tick += OnIdleTick;
        idleTimer.Start();
    }

    public string Status { get => status; private set => SetProperty(ref status, value); }
    public StationMode Mode
    {
        get => mode;
        private set
        {
            if (SetProperty(ref mode, value))
            {
                OnPropertyChanged(nameof(IsPlantManager));
                NotifyPreparationCommands();
            }
        }
    }
    public bool IsBusy
    {
        get => isBusy;
        private set
        {
            if (SetProperty(ref isBusy, value)) NotifyPreparationCommands();
        }
    }
    public bool IsPlantManager => Mode == StationMode.PlantManager;
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
    public string Draft
    {
        get => draft;
        set { if (SetProperty(ref draft, value)) modeController.Draft = value; }
    }
    public IRelayCommand ExitManagerModeCommand { get; }
    public IAsyncRelayCommand PrepareLineCommand { get; }
    public IAsyncRelayCommand ConfirmLineCommand { get; }
    public IRelayCommand CancelPreparationCommand { get; }

    public async Task InitializeAsync()
    {
        state = await coordinator.ResumeAsync(networkAvailable: true).ConfigureAwait(true);
        if (state is not null)
        {
            OpenOperationMode("Estación revalidada. Modo Operación activo.");
            await LoadPreparationCatalogsAsync().ConfigureAwait(true);
        }
    }

    public Task SignInAsync(string email, string password) => RunAsync(async () =>
    {
        state = await coordinator.SignInAsync(email, password).ConfigureAwait(true);
        await LoadPreparationCatalogsAsync().ConfigureAwait(true);
        OpenOperationMode("Estación abierta. Modo Operación activo.");
    }, "No se pudo abrir la estación.");

    public async Task ElevateAsync(string pin)
    {
        if (state is null) { Status = "Primero abre la estación."; return; }
        await RunAsync(async () =>
        {
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
        catch (Exception exception) when (exception is HttpRequestException or InvalidOperationException or UnauthorizedAccessException or IOException or SqliteException) { Status = failure; }
        finally { IsBusy = false; }
    }

    private void OpenOperationMode(string message) { modeController.OpenOperationMode(); Mode = modeController.Mode; Status = message; }
    private void ExitManagerMode()
    {
        CancelPreparation();
        modeController.ExitPlantManagerMode();
        Mode = modeController.Mode;
        Status = "Modo Operación activo.";
    }
    private void OnIdleTick(object? sender, EventArgs e)
    {
        if (!modeController.EvaluateIdleTimeout()) return;
        CancelPreparation();
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
        else if (Suppliers.Count == 0 || Workers.Count == 0)
        {
            Status = "Faltan proveedores o responsables activos en el catálogo local.";
        }
        NotifyPreparationCommands();
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
            NotifyPreparationCommands();
        }, "No se pudo preparar el cargamento con el contexto seleccionado.").ConfigureAwait(true);
    }

    private async Task ConfirmLineAsync()
    {
        PreparedOperationStart? prepared = preparedStart;
        if (prepared is null) return;
        await RunAsync(async () =>
        {
            await operations.ConfirmStartAsync(prepared).ConfigureAwait(true);
            preparedStart = null;
            modeController.ExitPlantManagerMode();
            Mode = modeController.Mode;
            Status = "Línea lista. Abra Modo Operación para comenzar el registro.";
            PreparationSummary = "Cargamento confirmado y guardado localmente.";
            NotifyPreparationCommands();
        }, "No se pudo confirmar el cargamento; el contexto anterior se conservó.").ConfigureAwait(true);
    }

    private void CancelPreparation()
    {
        preparedStart = null;
        PreparationSummary = "Preparación cancelada; no se modificó la línea.";
        NotifyPreparationCommands();
    }

    private bool CanPrepareLine() =>
        IsPlantManager && !IsBusy && pilotLine is not null && SelectedSupplier is not null && SelectedWorker is not null;

    private void SelectionChanged()
    {
        preparedStart = null;
        PreparationSummary = SelectedSupplier is null || SelectedWorker is null
            ? "Seleccione proveedor y responsable para preparar la línea."
            : $"{PilotLineName} · {SelectedSupplier.Name} · responsable {SelectedWorker.Name}.";
        NotifyPreparationCommands();
    }

    private void NotifyPreparationCommands()
    {
        PrepareLineCommand.NotifyCanExecuteChanged();
        ConfirmLineCommand.NotifyCanExecuteChanged();
        CancelPreparationCommand.NotifyCanExecuteChanged();
    }
}
