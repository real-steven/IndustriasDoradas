using System.Collections.ObjectModel;
using System.Globalization;
using System.IO;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain;
using IndustriasDoradas.Desktop.Domain.Inventory;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.DependencyInjection;

namespace IndustriasDoradas.Desktop.Presentation.ViewModels;

public sealed record InventoryMovementOption(
    InventoryMovementType Type,
    string Name,
    bool RequiresReason = false,
    bool AllowsWorker = true,
    bool RequiresQuantity = true,
    bool AllowsRelatedMovement = false)
{
    public string QuantityHint => Type == InventoryMovementType.Adjustment
        ? "Use signo negativo para disminuir"
        : "Cantidad positiva";
}

public sealed record InventoryRelatedMovementOption(LocalInventoryMovementReference Movement)
{
    public Guid Id => Movement.Id;
    public string Description =>
        $"{MovementName(Movement.MovementType)} {Movement.QuantityDelta:+0.###;-0.###} · " +
        $"{Movement.OccurredAt.ToLocalTime():dd/MM/yyyy HH:mm}";

    private static string MovementName(InventoryMovementType type) => type switch
    {
        InventoryMovementType.Entry => "Entrada",
        InventoryMovementType.Exit => "Salida",
        InventoryMovementType.Consumption => "Consumo",
        InventoryMovementType.Return => "Reintegro",
        InventoryMovementType.Adjustment => "Ajuste",
        InventoryMovementType.Reversal => "Reverso",
        _ => type.ToString(),
    };
}

public sealed record InventoryItemStatus(LocalInventoryStock Stock)
{
    public Guid Id => Stock.Item.Id;
    public string Name => Stock.Item.Name;
    public string TypeName => Stock.Item.Type.Name;
    public string UnitName => Stock.Item.Unit.Name;
    public string LocalBalance => Format(Stock.LocalBalance);
    public string CentralBalance => Format(Stock.CentralKnownBalance);
    public string PendingLabel => Stock.PendingMovementCount == 0
        ? "Sin pendientes locales"
        : $"{Stock.PendingMovementCount} pendiente(s)";

    private string Format(decimal value) =>
        $"{value.ToString($"F{Stock.Item.Unit.DecimalPlaces}", CultureInfo.CurrentCulture)} {UnitName}";
}

public sealed record InventoryComponentActionOption(RastraComponentChangeType Type, string Name);

public sealed class InventoryViewModel : ObservableObject
{
    private readonly ILocalInventoryRepository? inventory;
    private readonly ILocalCatalogRepository? catalogs;
    private readonly ILocalInventoryMaintenanceRepository? maintenance;
    private readonly IProtectedStationStore? stationStore;
    private readonly IPlantManagerModeAccessor? managerMode;
    private readonly TimeProvider timeProvider;
    private ProtectedStationState? station;
    private InventoryItemStatus? selectedItem;
    private InventoryMovementOption? selectedMovement;
    private InventoryRelatedMovementOption? selectedRelatedMovement;
    private IReadOnlyList<LocalInventoryMovementReference> movementHistory = [];
    private CachedWorker? selectedWorker;
    private string quantity = string.Empty;
    private string destination = string.Empty;
    private string reason = string.Empty;
    private string notes = string.Empty;
    private string countedQuantity = string.Empty;
    private string reviewNotes = string.Empty;
    private string status = "Cargando inventario local…";
    private string freshness = "Sin información de frescura central.";
    private bool isBusy;
    private readonly Dictionary<Guid, IReadOnlyList<LocalRastraInstallation>> installationsByRastra = [];
    private LocalRastra? selectedRastra;
    private InventoryComponentActionOption? selectedComponentAction;
    private LocalRastraInstallation? selectedInstallation;
    private InventoryItemStatus? selectedComponentItem;
    private string componentQuantity = string.Empty;
    private string componentIdentifier = string.Empty;
    private string installedCondition = "Bueno";
    private string removedCondition = string.Empty;
    private string componentReason = string.Empty;
    private string componentNotes = string.Empty;
    private OperationalNoveltyCategory? selectedNoveltyCategory;
    private CachedProductionLine? selectedNoveltyLine;
    private bool noveltyIsPlantWide = true;
    private string noveltyDescription = string.Empty;
    private LocalOperationalNovelty? selectedOpenNovelty;

    public InventoryViewModel()
        : this(null, null, null, null, null, TimeProvider.System)
    {
        Status = "El inventario estará disponible cuando la estación tenga almacenamiento local.";
    }

    public InventoryViewModel(
        ILocalInventoryRepository? inventory,
        ILocalCatalogRepository? catalogs,
        IProtectedStationStore? stationStore,
        IPlantManagerModeAccessor? managerMode,
        TimeProvider timeProvider)
        : this(inventory, catalogs, null, stationStore, managerMode, timeProvider)
    {
    }

    [ActivatorUtilitiesConstructor]
    public InventoryViewModel(
        ILocalInventoryRepository? inventory,
        ILocalCatalogRepository? catalogs,
        ILocalInventoryMaintenanceRepository? maintenance,
        IProtectedStationStore? stationStore,
        IPlantManagerModeAccessor? managerMode,
        TimeProvider timeProvider)
    {
        this.inventory = inventory;
        this.catalogs = catalogs;
        this.maintenance = maintenance;
        this.stationStore = stationStore;
        this.managerMode = managerMode;
        this.timeProvider = timeProvider;
        MovementTypes =
        [
            new(InventoryMovementType.Entry, "Entrada", AllowsWorker: false),
            new(InventoryMovementType.Exit, "Salida"),
            new(InventoryMovementType.Consumption, "Consumo"),
            new(InventoryMovementType.Return, "Reintegro / devolución", AllowsRelatedMovement: true),
            new(InventoryMovementType.Adjustment, "Ajuste", RequiresReason: true, AllowsWorker: false),
            new(InventoryMovementType.Reversal, "Anular movimiento", RequiresReason: true,
                AllowsWorker: false, RequiresQuantity: false, AllowsRelatedMovement: true),
        ];
        ComponentActions =
        [
            new(RastraComponentChangeType.Installation, "Instalar componente"),
            new(RastraComponentChangeType.Removal, "Retirar componente"),
            new(RastraComponentChangeType.Replacement, "Reemplazar componente"),
        ];
        selectedMovement = MovementTypes[0];
        selectedComponentAction = ComponentActions[0];
        RefreshCommand = new AsyncRelayCommand(RefreshAsync, () => !IsBusy);
        RecordMovementCommand = new AsyncRelayCommand(RecordMovementAsync, CanRecordMovement);
        RecordReviewCommand = new AsyncRelayCommand(RecordReviewAsync, CanRecordReview);
        RecordComponentChangeCommand = new AsyncRelayCommand(RecordComponentChangeAsync, CanRecordComponentChange);
        OpenNoveltyCommand = new AsyncRelayCommand(OpenNoveltyAsync, CanOpenNovelty);
        CloseNoveltyCommand = new AsyncRelayCommand(CloseNoveltyAsync, CanCloseNovelty);
    }

    public ObservableCollection<InventoryItemStatus> Items { get; } = [];
    public ObservableCollection<CachedWorker> Workers { get; } = [];
    public ObservableCollection<InventoryRelatedMovementOption> RelatedMovements { get; } = [];
    public ObservableCollection<LocalRastra> Rastras { get; } = [];
    public ObservableCollection<LocalRastraInstallation> ActiveInstallations { get; } = [];
    public ObservableCollection<CachedProductionLine> NoveltyLines { get; } = [];
    public ObservableCollection<OperationalNoveltyCategory> NoveltyCategories { get; } = [];
    public ObservableCollection<LocalOperationalNovelty> OpenNovelties { get; } = [];
    public IReadOnlyList<InventoryMovementOption> MovementTypes { get; }
    public IReadOnlyList<InventoryComponentActionOption> ComponentActions { get; }

    public InventoryItemStatus? SelectedItem
    {
        get => selectedItem;
        set
        {
            if (!SetProperty(ref selectedItem, value)) return;
            CountedQuantity = value?.Stock.LocalBalance.ToString(CultureInfo.CurrentCulture) ?? string.Empty;
            OnPropertyChanged(nameof(SelectedItemSummary));
            RefreshRelatedMovements();
            NotifyCommands();
        }
    }

    public InventoryMovementOption? SelectedMovement
    {
        get => selectedMovement;
        set
        {
            if (!SetProperty(ref selectedMovement, value)) return;
            if (value?.AllowsWorker != true) SelectedWorker = null;
            OnPropertyChanged(nameof(RequiresReason));
            OnPropertyChanged(nameof(AllowsWorker));
            OnPropertyChanged(nameof(RequiresQuantity));
            OnPropertyChanged(nameof(AllowsRelatedMovement));
            OnPropertyChanged(nameof(RelatedMovementLabel));
            OnPropertyChanged(nameof(QuantityHint));
            SelectedRelatedMovement = null;
            RefreshRelatedMovements();
            NotifyCommands();
        }
    }

    public InventoryRelatedMovementOption? SelectedRelatedMovement
    {
        get => selectedRelatedMovement;
        set
        {
            if (SetProperty(ref selectedRelatedMovement, value))
                RecordMovementCommand.NotifyCanExecuteChanged();
        }
    }

    public CachedWorker? SelectedWorker
    {
        get => selectedWorker;
        set => SetProperty(ref selectedWorker, value);
    }

    public string Quantity
    {
        get => quantity;
        set
        {
            if (SetProperty(ref quantity, value)) RecordMovementCommand.NotifyCanExecuteChanged();
        }
    }

    public string Destination { get => destination; set => SetProperty(ref destination, value); }

    public string Reason
    {
        get => reason;
        set
        {
            if (SetProperty(ref reason, value)) RecordMovementCommand.NotifyCanExecuteChanged();
        }
    }

    public string Notes { get => notes; set => SetProperty(ref notes, value); }

    public string CountedQuantity
    {
        get => countedQuantity;
        set
        {
            if (SetProperty(ref countedQuantity, value)) RecordReviewCommand.NotifyCanExecuteChanged();
        }
    }

    public string ReviewNotes { get => reviewNotes; set => SetProperty(ref reviewNotes, value); }

    public LocalRastra? SelectedRastra
    {
        get => selectedRastra;
        set
        {
            if (!SetProperty(ref selectedRastra, value)) return;
            RefreshActiveInstallations();
            NotifyCommands();
        }
    }

    public InventoryComponentActionOption? SelectedComponentAction
    {
        get => selectedComponentAction;
        set
        {
            if (!SetProperty(ref selectedComponentAction, value)) return;
            SelectedInstallation = null;
            OnPropertyChanged(nameof(ComponentNeedsExisting));
            OnPropertyChanged(nameof(ComponentNeedsNewItem));
            OnPropertyChanged(nameof(ComponentActionHelp));
            NotifyCommands();
        }
    }

    public LocalRastraInstallation? SelectedInstallation
    {
        get => selectedInstallation;
        set
        {
            if (SetProperty(ref selectedInstallation, value)) RecordComponentChangeCommand.NotifyCanExecuteChanged();
        }
    }

    public InventoryItemStatus? SelectedComponentItem
    {
        get => selectedComponentItem;
        set
        {
            if (SetProperty(ref selectedComponentItem, value)) RecordComponentChangeCommand.NotifyCanExecuteChanged();
        }
    }

    public string ComponentQuantity
    {
        get => componentQuantity;
        set
        {
            if (SetProperty(ref componentQuantity, value)) RecordComponentChangeCommand.NotifyCanExecuteChanged();
        }
    }

    public string ComponentIdentifier { get => componentIdentifier; set => SetProperty(ref componentIdentifier, value); }
    public string InstalledCondition
    {
        get => installedCondition;
        set
        {
            if (SetProperty(ref installedCondition, value)) RecordComponentChangeCommand.NotifyCanExecuteChanged();
        }
    }
    public string RemovedCondition
    {
        get => removedCondition;
        set
        {
            if (SetProperty(ref removedCondition, value)) RecordComponentChangeCommand.NotifyCanExecuteChanged();
        }
    }
    public string ComponentReason
    {
        get => componentReason;
        set
        {
            if (SetProperty(ref componentReason, value)) RecordComponentChangeCommand.NotifyCanExecuteChanged();
        }
    }
    public string ComponentNotes { get => componentNotes; set => SetProperty(ref componentNotes, value); }

    public OperationalNoveltyCategory? SelectedNoveltyCategory
    {
        get => selectedNoveltyCategory;
        set => SetProperty(ref selectedNoveltyCategory, value);
    }

    public CachedProductionLine? SelectedNoveltyLine
    {
        get => selectedNoveltyLine;
        set
        {
            if (SetProperty(ref selectedNoveltyLine, value)) OpenNoveltyCommand.NotifyCanExecuteChanged();
        }
    }

    public bool NoveltyIsPlantWide
    {
        get => noveltyIsPlantWide;
        set
        {
            if (!SetProperty(ref noveltyIsPlantWide, value)) return;
            OnPropertyChanged(nameof(NoveltyNeedsLine));
            OpenNoveltyCommand.NotifyCanExecuteChanged();
        }
    }

    public string NoveltyDescription
    {
        get => noveltyDescription;
        set
        {
            if (SetProperty(ref noveltyDescription, value)) OpenNoveltyCommand.NotifyCanExecuteChanged();
        }
    }

    public LocalOperationalNovelty? SelectedOpenNovelty
    {
        get => selectedOpenNovelty;
        set
        {
            if (SetProperty(ref selectedOpenNovelty, value)) CloseNoveltyCommand.NotifyCanExecuteChanged();
        }
    }
    public string Status { get => status; private set => SetProperty(ref status, value); }
    public string Freshness { get => freshness; private set => SetProperty(ref freshness, value); }

    public bool IsBusy
    {
        get => isBusy;
        private set
        {
            if (!SetProperty(ref isBusy, value)) return;
            RefreshCommand.NotifyCanExecuteChanged();
            NotifyCommands();
        }
    }

    public bool RequiresReason => SelectedMovement?.RequiresReason == true;
    public bool AllowsWorker => SelectedMovement?.AllowsWorker == true;
    public bool RequiresQuantity => SelectedMovement?.RequiresQuantity != false;
    public bool AllowsRelatedMovement => SelectedMovement?.AllowsRelatedMovement == true;
    public string RelatedMovementLabel => SelectedMovement?.Type == InventoryMovementType.Reversal
        ? "MOVIMIENTO ORIGINAL OBLIGATORIO"
        : "SALIDA ORIGINAL OPCIONAL";
    public string QuantityHint => SelectedMovement?.QuantityHint ?? "Cantidad";
    public bool ComponentNeedsExisting => SelectedComponentAction?.Type is
        RastraComponentChangeType.Removal or RastraComponentChangeType.Replacement;
    public bool ComponentNeedsNewItem => SelectedComponentAction?.Type is
        RastraComponentChangeType.Installation or RastraComponentChangeType.Replacement;
    public bool NoveltyNeedsLine => !NoveltyIsPlantWide;
    public string ComponentActionHelp => SelectedComponentAction?.Type switch
    {
        RastraComponentChangeType.Removal => "Retira una instalación activa y conserva su historial.",
        RastraComponentChangeType.Replacement => "Cierra la instalación anterior y abre la nueva en un solo hecho.",
        _ => "Registra el componente instalado sin descontarlo automáticamente del inventario.",
    };
    public string SelectedItemSummary => SelectedItem is null
        ? "Seleccione un artículo del catálogo local."
        : $"{SelectedItem.Name} · Local {SelectedItem.LocalBalance} · Central conocido {SelectedItem.CentralBalance}";

    public IAsyncRelayCommand RefreshCommand { get; }
    public IAsyncRelayCommand RecordMovementCommand { get; }
    public IAsyncRelayCommand RecordReviewCommand { get; }
    public IAsyncRelayCommand RecordComponentChangeCommand { get; }
    public IAsyncRelayCommand OpenNoveltyCommand { get; }
    public IAsyncRelayCommand CloseNoveltyCommand { get; }

    public Task InitializeAsync() => RefreshAsync();

    public void RefreshManagerMode()
    {
        NotifyCommands();
        if (managerMode?.IsActive != true)
            Status = "Active el Modo Jefe de Planta para modificar inventario.";
    }

    public async Task RefreshAsync()
    {
        if (inventory is null || catalogs is null || stationStore is null)
        {
            Status = "El inventario local no está configurado.";
            return;
        }

        await RunAsync(RefreshCoreAsync).ConfigureAwait(true);
    }

    private async Task RefreshCoreAsync()
    {
        if (inventory is null || catalogs is null || stationStore is null) return;
        station = await stationStore.LoadAsync().ConfigureAwait(true);
        if (station is null || station.IsClosed)
        {
            Items.Clear();
            Workers.Clear();
            ClearMaintenance();
            SelectedItem = null;
            Status = "Abra la estación para consultar el inventario.";
            return;
        }

        Guid? selectedId = SelectedItem?.Id;
        IReadOnlyList<LocalInventoryStock> stocks = await inventory.ListStockAsync(
            station.Authorization.OrganizationId, station.Authorization.PlantId).ConfigureAwait(true);
        movementHistory = await inventory.ListMovementsAsync(
            station.Authorization.OrganizationId, station.Authorization.PlantId).ConfigureAwait(true);
        Items.Clear();
        foreach (LocalInventoryStock stock in stocks) Items.Add(new(stock));
        SelectedItem = selectedId.HasValue
            ? Items.FirstOrDefault(item => item.Id == selectedId.Value)
            : Items.FirstOrDefault();

        IReadOnlyList<CachedWorker> workers = await catalogs.ListActiveWorkersAsync(
            station.Authorization.OrganizationId).ConfigureAwait(true);
        Workers.Clear();
        foreach (CachedWorker worker in workers.OrderBy(item => item.Name)) Workers.Add(worker);

        if (maintenance is not null)
        {
            await LoadMaintenanceAsync().ConfigureAwait(true);
        }

        LocalInventoryFreshness current = await inventory.GetFreshnessAsync(
            station.Authorization.StationId).ConfigureAwait(true);
        Freshness = DescribeFreshness(current);
        Status = Items.Count == 0
            ? "No hay artículos activos en el catálogo local. Conéctese para actualizarlo."
            : managerMode?.IsActive == true
                ? "Inventario local disponible para movimientos y conteos físicos."
                : "Consulta disponible. Active el Modo Jefe de Planta para registrar cambios.";
    }

    private async Task LoadMaintenanceAsync()
    {
        if (maintenance is null || catalogs is null || station is null) return;
        Guid? selectedRastraId = SelectedRastra?.Id;
        Guid? selectedNoveltyId = SelectedOpenNovelty?.NoveltyId;
        IReadOnlyList<LocalRastra> rastras = await maintenance.ListRastrasAsync(
            station.Authorization.OrganizationId, station.Authorization.PlantId).ConfigureAwait(true);
        installationsByRastra.Clear();
        foreach (LocalRastra rastra in rastras)
        {
            installationsByRastra[rastra.Id] = await maintenance.ListActiveInstallationsAsync(
                station.Authorization.OrganizationId, station.Authorization.PlantId, rastra.Id).ConfigureAwait(true);
        }
        Rastras.Clear();
        foreach (LocalRastra rastra in rastras) Rastras.Add(rastra);
        SelectedRastra = selectedRastraId.HasValue
            ? Rastras.FirstOrDefault(item => item.Id == selectedRastraId.Value)
            : Rastras.FirstOrDefault();

        IReadOnlyList<CachedProductionLine> lines = await catalogs.ListActiveLinesAsync(
            station.Authorization.OrganizationId, station.Authorization.PlantId,
            station.Authorization.StationId).ConfigureAwait(true);
        NoveltyLines.Clear();
        foreach (CachedProductionLine line in lines) NoveltyLines.Add(line);
        SelectedNoveltyLine ??= NoveltyLines.FirstOrDefault();

        NoveltyCategories.Clear();
        foreach (OperationalNoveltyCategory category in await maintenance.ListNoveltyCategoriesAsync(
                     station.Authorization.OrganizationId).ConfigureAwait(true))
            NoveltyCategories.Add(category);

        OpenNovelties.Clear();
        foreach (LocalOperationalNovelty novelty in (await maintenance.ListNoveltiesAsync(
                     station.Authorization.OrganizationId, station.Authorization.PlantId)
                 .ConfigureAwait(true)).Where(item => item.IsOpen))
            OpenNovelties.Add(novelty);
        SelectedOpenNovelty = selectedNoveltyId.HasValue
            ? OpenNovelties.FirstOrDefault(item => item.NoveltyId == selectedNoveltyId.Value)
            : OpenNovelties.FirstOrDefault();
    }

    private async Task RecordMovementAsync()
    {
        if (inventory is null || station is null || SelectedItem is null || SelectedMovement is null) return;
        decimal amount;
        if (SelectedMovement.Type == InventoryMovementType.Reversal)
        {
            if (SelectedRelatedMovement is null) return;
            amount = -SelectedRelatedMovement.Movement.QuantityDelta;
        }
        else if (!TryDecimal(Quantity, out amount)) return;
        DateTimeOffset now = timeProvider.GetUtcNow();
        await RunAsync(async () =>
        {
            LocalInventoryMovementRegistration result = await inventory.RecordMovementAsync(
                new(Guid.NewGuid(), station.Authorization.OrganizationId,
                    station.Authorization.PlantId, station.Authorization.StationId,
                    station.Session.ProfileId, SelectedItem.Id, SelectedMovement.Type, amount,
                    now, now, SelectedWorker?.Id, Optional(Reason), Optional(Destination),
                    Optional(Notes), SelectedRelatedMovement?.Id,
                    Authorization: AuthorizationFrom(station))).ConfigureAwait(true);
            Quantity = string.Empty;
            Reason = string.Empty;
            Destination = string.Empty;
            Notes = string.Empty;
            await RefreshCoreAsync().ConfigureAwait(true);
            Status = SelectedMovement.Type == InventoryMovementType.Reversal
                ? $"Movimiento anulado sin borrar el original. Saldo local: {result.LocalBalance}."
                : $"Movimiento guardado localmente. Saldo local: {result.LocalBalance}.";
        }).ConfigureAwait(true);
    }

    private async Task RecordReviewAsync()
    {
        if (inventory is null || station is null || SelectedItem is null ||
            !TryDecimal(CountedQuantity, out decimal counted)) return;
        DateTimeOffset now = timeProvider.GetUtcNow();
        await RunAsync(async () =>
        {
            LocalInventoryReviewRegistration result = await inventory.RecordReviewAsync(
                new(Guid.NewGuid(), station.Authorization.OrganizationId,
                    station.Authorization.PlantId, station.Authorization.StationId,
                    station.Session.ProfileId, SelectedItem.Id, counted, now, now,
                    Optional(ReviewNotes), AuthorizationFrom(station))).ConfigureAwait(true);
            ReviewNotes = string.Empty;
            await RefreshCoreAsync().ConfigureAwait(true);
            Status = result.Status == InventoryReviewStatus.WithoutDifferences
                ? "Conteo guardado sin diferencias; el kardex no fue modificado."
                : $"Conteo guardado con diferencia {result.Difference}; requiere ajuste separado.";
        }).ConfigureAwait(true);
    }

    private bool CanRecordMovement()
    {
        if (IsBusy || managerMode?.IsActive != true || station is null || SelectedItem is null ||
            SelectedMovement is null || RequiresReason && string.IsNullOrWhiteSpace(Reason)) return false;
        if (SelectedMovement.Type == InventoryMovementType.Reversal)
            return SelectedRelatedMovement is not null;
        return TryDecimal(Quantity, out decimal value) && value != 0m;
    }

    private bool CanRecordReview() => !IsBusy && managerMode?.IsActive == true && station is not null &&
        SelectedItem is not null && TryDecimal(CountedQuantity, out decimal value) && value >= 0m;

    private async Task RecordComponentChangeAsync()
    {
        if (maintenance is null || station is null || SelectedRastra is null || SelectedComponentAction is null)
            return;
        DateTimeOffset now = timeProvider.GetUtcNow();
        bool installs = ComponentNeedsNewItem;
        Guid installationId = SelectedComponentAction.Type == RastraComponentChangeType.Removal
            ? SelectedInstallation!.InstallationId
            : Guid.NewGuid();
        decimal? amount = installs && TryDecimal(ComponentQuantity, out decimal parsed) ? parsed : null;
        await RunAsync(async () =>
        {
            await maintenance.RecordComponentChangeAsync(new(
                Guid.NewGuid(), installationId, station.Authorization.OrganizationId,
                station.Authorization.PlantId, station.Authorization.StationId,
                station.Session.ProfileId, SelectedRastra.LineId, SelectedRastra.Id,
                SelectedComponentAction.Type, now, now,
                ReplacedInstallationId: SelectedComponentAction.Type == RastraComponentChangeType.Replacement
                    ? SelectedInstallation?.InstallationId : null,
                InventoryItemId: installs ? SelectedComponentItem?.Id : null,
                Quantity: amount,
                ComponentIdentifier: Optional(ComponentIdentifier),
                InstalledCondition: installs ? Optional(InstalledCondition) : null,
                RemovedCondition: ComponentNeedsExisting ? Optional(RemovedCondition) : null,
                Reason: ComponentNeedsExisting ? Optional(ComponentReason) : null,
                InstallationNotes: installs ? Optional(ComponentNotes) : null,
                RemovalNotes: ComponentNeedsExisting ? Optional(ComponentNotes) : null,
                Authorization: AuthorizationFrom(station))).ConfigureAwait(true);
            ClearComponentForm();
            await RefreshCoreAsync().ConfigureAwait(true);
            Status = "Cambio de componente guardado localmente y pendiente de sincronización.";
        }).ConfigureAwait(true);
    }

    private async Task OpenNoveltyAsync()
    {
        if (maintenance is null || station is null) return;
        DateTimeOffset now = timeProvider.GetUtcNow();
        await RunAsync(async () =>
        {
            await maintenance.RecordNoveltyChangeAsync(new(
                Guid.NewGuid(), Guid.NewGuid(), station.Authorization.OrganizationId,
                station.Authorization.PlantId, station.Authorization.StationId,
                station.Session.ProfileId, OperationalNoveltyChangeType.Opening,
                now, now, NoveltyIsPlantWide ? null : SelectedNoveltyLine?.Id,
                SelectedNoveltyCategory?.Id, NoveltyDescription.Trim(),
                Authorization: AuthorizationFrom(station))).ConfigureAwait(true);
            NoveltyDescription = string.Empty;
            await RefreshCoreAsync().ConfigureAwait(true);
            Status = "Novedad abierta localmente y pendiente de sincronización.";
        }).ConfigureAwait(true);
    }

    private async Task CloseNoveltyAsync()
    {
        if (maintenance is null || station is null || SelectedOpenNovelty is null) return;
        DateTimeOffset now = timeProvider.GetUtcNow();
        await RunAsync(async () =>
        {
            await maintenance.RecordNoveltyChangeAsync(new(
                Guid.NewGuid(), SelectedOpenNovelty.NoveltyId,
                station.Authorization.OrganizationId, station.Authorization.PlantId,
                station.Authorization.StationId, station.Session.ProfileId,
                OperationalNoveltyChangeType.Closure, now, now,
                Authorization: AuthorizationFrom(station))).ConfigureAwait(true);
            await RefreshCoreAsync().ConfigureAwait(true);
            Status = "Novedad cerrada localmente y pendiente de sincronización.";
        }).ConfigureAwait(true);
    }

    private bool CanRecordComponentChange()
    {
        if (IsBusy || managerMode?.IsActive != true || station is null || SelectedRastra is null ||
            SelectedComponentAction is null) return false;
        if (ComponentNeedsExisting && SelectedInstallation is null) return false;
        if (!ComponentNeedsNewItem)
            return !string.IsNullOrWhiteSpace(RemovedCondition) && !string.IsNullOrWhiteSpace(ComponentReason);
        return SelectedComponentItem is not null && TryDecimal(ComponentQuantity, out decimal value) && value > 0m &&
            !string.IsNullOrWhiteSpace(InstalledCondition) &&
            (!ComponentNeedsExisting || !string.IsNullOrWhiteSpace(RemovedCondition) &&
                !string.IsNullOrWhiteSpace(ComponentReason));
    }

    private bool CanOpenNovelty() => !IsBusy && managerMode?.IsActive == true && station is not null &&
        !string.IsNullOrWhiteSpace(NoveltyDescription) && (NoveltyIsPlantWide || SelectedNoveltyLine is not null);

    private bool CanCloseNovelty() => !IsBusy && managerMode?.IsActive == true && station is not null &&
        SelectedOpenNovelty is not null;

    private async Task RunAsync(Func<Task> action)
    {
        if (IsBusy) return;
        IsBusy = true;
        try
        {
            await action().ConfigureAwait(true);
        }
        catch (Exception exception) when (exception is IOException or SqliteException or
            InvalidOperationException or ArgumentException or OverflowException)
        {
            Status = FriendlyError(exception);
        }
        finally
        {
            IsBusy = false;
        }
    }

    private void NotifyCommands()
    {
        RecordMovementCommand.NotifyCanExecuteChanged();
        RecordReviewCommand.NotifyCanExecuteChanged();
        RecordComponentChangeCommand.NotifyCanExecuteChanged();
        OpenNoveltyCommand.NotifyCanExecuteChanged();
        CloseNoveltyCommand.NotifyCanExecuteChanged();
    }

    private void RefreshActiveInstallations()
    {
        Guid? selectedId = SelectedInstallation?.InstallationId;
        ActiveInstallations.Clear();
        if (SelectedRastra is not null && installationsByRastra.TryGetValue(
                SelectedRastra.Id, out IReadOnlyList<LocalRastraInstallation>? values))
            foreach (LocalRastraInstallation value in values) ActiveInstallations.Add(value);
        SelectedInstallation = selectedId.HasValue
            ? ActiveInstallations.FirstOrDefault(item => item.InstallationId == selectedId.Value)
            : ActiveInstallations.FirstOrDefault();
    }

    private void ClearComponentForm()
    {
        SelectedInstallation = null;
        SelectedComponentItem = null;
        ComponentQuantity = string.Empty;
        ComponentIdentifier = string.Empty;
        InstalledCondition = "Bueno";
        RemovedCondition = string.Empty;
        ComponentReason = string.Empty;
        ComponentNotes = string.Empty;
    }

    private void ClearMaintenance()
    {
        installationsByRastra.Clear();
        Rastras.Clear();
        ActiveInstallations.Clear();
        NoveltyLines.Clear();
        NoveltyCategories.Clear();
        OpenNovelties.Clear();
        SelectedRastra = null;
        SelectedOpenNovelty = null;
    }

    private void RefreshRelatedMovements()
    {
        Guid? selectedId = SelectedRelatedMovement?.Id;
        RelatedMovements.Clear();
        if (SelectedItem is null || SelectedMovement is null) return;
        HashSet<Guid> exitsWithReturns = movementHistory
            .Where(item => item.MovementType == InventoryMovementType.Return && item.RelatedMovementId.HasValue)
            .Select(item => item.RelatedMovementId!.Value)
            .ToHashSet();
        IEnumerable<LocalInventoryMovementReference> candidates = SelectedMovement.Type switch
        {
            InventoryMovementType.Return => movementHistory.Where(item =>
                item.InventoryItemId == SelectedItem.Id && item.MovementType == InventoryMovementType.Exit &&
                !item.HasBeenReversed),
            InventoryMovementType.Reversal => movementHistory.Where(item =>
                item.InventoryItemId == SelectedItem.Id && item.MovementType != InventoryMovementType.Reversal &&
                !item.HasBeenReversed &&
                !(item.MovementType == InventoryMovementType.Exit && exitsWithReturns.Contains(item.Id))),
            _ => [],
        };
        foreach (LocalInventoryMovementReference candidate in candidates)
            RelatedMovements.Add(new(candidate));
        SelectedRelatedMovement = selectedId.HasValue
            ? RelatedMovements.FirstOrDefault(item => item.Id == selectedId.Value)
            : null;
    }

    private static bool TryDecimal(string value, out decimal result) =>
        decimal.TryParse(value, NumberStyles.Number | NumberStyles.AllowLeadingSign,
            CultureInfo.CurrentCulture, out result) ||
        decimal.TryParse(value, NumberStyles.Number | NumberStyles.AllowLeadingSign,
            CultureInfo.InvariantCulture, out result);

    private static string? Optional(string value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static OutboxAuthorizationEvidence AuthorizationFrom(ProtectedStationState state) => new(
        state.Session.ProfileId, state.Authorization.PermissionVersion, state.Authorization.ValidatedAt,
        state.Authorization.OfflineValidUntil,
        state.Authorization.OfflineValidUntil >= DateTimeOffset.UtcNow ? "VALID" : "EXPIRED_CONTINGENCY");

    private static string DescribeFreshness(LocalInventoryFreshness value)
    {
        string central = value.CentralAsOf is null
            ? "Central aún no consultado"
            : $"Central al {value.CentralAsOf.Value.ToLocalTime():dd/MM/yyyy HH:mm}";
        string network = value.NetworkState == "AVAILABLE" ? "con conexión reciente" : "sin conexión confirmada";
        string pending = value.PendingFactCount == 0
            ? "sin hechos locales pendientes"
            : $"{value.PendingFactCount} hecho(s) local(es) pendiente(s)";
        return $"{central} · {network} · {pending}. El saldo central no incluye otras estaciones offline.";
    }

    private static string FriendlyError(Exception exception)
    {
        if (exception.Message.Contains("INVENTORY_STOCK_INSUFFICIENT", StringComparison.Ordinal))
            return "La cantidad excede la existencia local disponible; el movimiento no se guardó.";
        if (exception.Message.Contains("PRECISION", StringComparison.Ordinal))
            return "La cantidad no cumple la precisión de la unidad seleccionada.";
        return exception.Message;
    }
}
