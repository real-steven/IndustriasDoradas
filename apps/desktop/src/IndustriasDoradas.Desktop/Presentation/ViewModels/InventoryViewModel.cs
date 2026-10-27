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

namespace IndustriasDoradas.Desktop.Presentation.ViewModels;

public sealed record InventoryMovementOption(
    InventoryMovementType Type,
    string Name,
    bool RequiresReason = false,
    bool AllowsWorker = true)
{
    public string QuantityHint => Type == InventoryMovementType.Adjustment
        ? "Use signo negativo para disminuir"
        : "Cantidad positiva";
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

public sealed class InventoryViewModel : ObservableObject
{
    private readonly ILocalInventoryRepository? inventory;
    private readonly ILocalCatalogRepository? catalogs;
    private readonly IProtectedStationStore? stationStore;
    private readonly IPlantManagerModeAccessor? managerMode;
    private readonly TimeProvider timeProvider;
    private ProtectedStationState? station;
    private InventoryItemStatus? selectedItem;
    private InventoryMovementOption? selectedMovement;
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

    public InventoryViewModel()
        : this(null, null, null, null, TimeProvider.System)
    {
        Status = "El inventario estará disponible cuando la estación tenga almacenamiento local.";
    }

    public InventoryViewModel(
        ILocalInventoryRepository? inventory,
        ILocalCatalogRepository? catalogs,
        IProtectedStationStore? stationStore,
        IPlantManagerModeAccessor? managerMode,
        TimeProvider timeProvider)
    {
        this.inventory = inventory;
        this.catalogs = catalogs;
        this.stationStore = stationStore;
        this.managerMode = managerMode;
        this.timeProvider = timeProvider;
        MovementTypes =
        [
            new(InventoryMovementType.Entry, "Entrada", AllowsWorker: false),
            new(InventoryMovementType.Exit, "Salida"),
            new(InventoryMovementType.Consumption, "Consumo"),
            new(InventoryMovementType.Return, "Devolución"),
            new(InventoryMovementType.Adjustment, "Ajuste", RequiresReason: true, AllowsWorker: false),
        ];
        selectedMovement = MovementTypes[0];
        RefreshCommand = new AsyncRelayCommand(RefreshAsync, () => !IsBusy);
        RecordMovementCommand = new AsyncRelayCommand(RecordMovementAsync, CanRecordMovement);
        RecordReviewCommand = new AsyncRelayCommand(RecordReviewAsync, CanRecordReview);
    }

    public ObservableCollection<InventoryItemStatus> Items { get; } = [];
    public ObservableCollection<CachedWorker> Workers { get; } = [];
    public IReadOnlyList<InventoryMovementOption> MovementTypes { get; }

    public InventoryItemStatus? SelectedItem
    {
        get => selectedItem;
        set
        {
            if (!SetProperty(ref selectedItem, value)) return;
            CountedQuantity = value?.Stock.LocalBalance.ToString(CultureInfo.CurrentCulture) ?? string.Empty;
            OnPropertyChanged(nameof(SelectedItemSummary));
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
            OnPropertyChanged(nameof(QuantityHint));
            NotifyCommands();
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
    public string QuantityHint => SelectedMovement?.QuantityHint ?? "Cantidad";
    public string SelectedItemSummary => SelectedItem is null
        ? "Seleccione un artículo del catálogo local."
        : $"{SelectedItem.Name} · Local {SelectedItem.LocalBalance} · Central conocido {SelectedItem.CentralBalance}";

    public IAsyncRelayCommand RefreshCommand { get; }
    public IAsyncRelayCommand RecordMovementCommand { get; }
    public IAsyncRelayCommand RecordReviewCommand { get; }

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

        await RunAsync(async () =>
        {
            station = await stationStore.LoadAsync().ConfigureAwait(true);
            if (station is null || station.IsClosed)
            {
                Items.Clear();
                Workers.Clear();
                SelectedItem = null;
                Status = "Abra la estación para consultar el inventario.";
                return;
            }

            Guid? selectedId = SelectedItem?.Id;
            IReadOnlyList<LocalInventoryStock> stocks = await inventory.ListStockAsync(
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

            LocalInventoryFreshness current = await inventory.GetFreshnessAsync(
                station.Authorization.StationId).ConfigureAwait(true);
            Freshness = DescribeFreshness(current);
            Status = Items.Count == 0
                ? "No hay artículos activos en el catálogo local. Conéctese para actualizarlo."
                : managerMode?.IsActive == true
                    ? "Inventario local disponible para movimientos y conteos físicos."
                    : "Consulta disponible. Active el Modo Jefe de Planta para registrar cambios.";
        }).ConfigureAwait(true);
    }

    private async Task RecordMovementAsync()
    {
        if (inventory is null || station is null || SelectedItem is null || SelectedMovement is null ||
            !TryDecimal(Quantity, out decimal amount)) return;
        DateTimeOffset now = timeProvider.GetUtcNow();
        await RunAsync(async () =>
        {
            LocalInventoryMovementRegistration result = await inventory.RecordMovementAsync(
                new(Guid.NewGuid(), station.Authorization.OrganizationId,
                    station.Authorization.PlantId, station.Authorization.StationId,
                    station.Session.ProfileId, SelectedItem.Id, SelectedMovement.Type, amount,
                    now, now, SelectedWorker?.Id, Optional(Reason), Optional(Destination),
                    Optional(Notes), Authorization: AuthorizationFrom(station))).ConfigureAwait(true);
            Quantity = string.Empty;
            Reason = string.Empty;
            Destination = string.Empty;
            Notes = string.Empty;
            await RefreshAsync().ConfigureAwait(true);
            Status = $"Movimiento guardado localmente. Saldo local: {result.LocalBalance}.";
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
            await RefreshAsync().ConfigureAwait(true);
            Status = result.Status == InventoryReviewStatus.WithoutDifferences
                ? "Conteo guardado sin diferencias; el kardex no fue modificado."
                : $"Conteo guardado con diferencia {result.Difference}; requiere ajuste separado.";
        }).ConfigureAwait(true);
    }

    private bool CanRecordMovement() => !IsBusy && managerMode?.IsActive == true && station is not null &&
        SelectedItem is not null && SelectedMovement is not null && TryDecimal(Quantity, out decimal value) &&
        value != 0m && (!RequiresReason || !string.IsNullOrWhiteSpace(Reason));

    private bool CanRecordReview() => !IsBusy && managerMode?.IsActive == true && station is not null &&
        SelectedItem is not null && TryDecimal(CountedQuantity, out decimal value) && value >= 0m;

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
