using System.ComponentModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using IndustriasDoradas.Desktop.Application.Abstractions;

namespace IndustriasDoradas.Desktop.Presentation.ViewModels;

public sealed record AuditResponsibilityItemViewModel(
    string WorkerName,
    string PeriodDescription);

public sealed record AuditShipmentItemViewModel(
    LocalCompletedShipmentAudit Source,
    string AccentColor,
    string PeriodDescription,
    string Summary,
    IReadOnlyList<AuditResponsibilityItemViewModel> Responsibilities)
{
    public Guid ShipmentId => Source.ShipmentId;
    public string LineName => Source.LineName;
    public string SupplierName => Source.SupplierName;
    public int TotalCajuelas => Source.TotalCajuelas;
    public int SweepCount => Source.SweepCount;
    public int SweptCajuelas => Source.SweptCajuelas;
    public int CorrectionCount => Source.CorrectionCount;
    public string MercuryStatusDescription => Source.SweepCount == 0
        ? "Sin barridas"
        : Source.MercuryRecordedSweepCount >= Source.SweepCount
            ? "Completo"
            : $"{Source.SweepCount - Source.MercuryRecordedSweepCount} pendiente(s)";
}

public sealed record AuditCorrectionItemViewModel(
    LocalCajuelaCorrectionAudit Source,
    string ConfirmedDescription,
    string TotalDescription)
{
    public string LineName => Source.LineName;
    public string ActorName => Source.ActorName;
    public string ActorRole => Source.ActorRole;
    public string Reason => Source.Reason;
    public bool RequiredPlantManager => Source.RequiredPlantManager;
}

public enum AuditCategory
{
    Operation,
    Corrections,
    Access,
    Administration,
}

public sealed class AuditViewModel : ObservableObject
{
    private readonly DiagnosticsViewModel diagnostics;
    private readonly StationViewModel? station;
    private readonly ILocalAuditRepository? localAudit;
    private AuditCategory selectedCategory = AuditCategory.Operation;
    private string status =
        "Actividad de operación visible. Eleve el acceso para consultar categorías protegidas.";
    private IReadOnlyList<AuditShipmentItemViewModel> completedShipments = [];
    private IReadOnlyList<AuditCorrectionItemViewModel> cajuelaCorrections = [];
    private AuditShipmentItemViewModel? selectedShipment;

    public AuditViewModel(DiagnosticsViewModel diagnostics)
        : this(diagnostics, null, null)
    {
    }

    public AuditViewModel(DiagnosticsViewModel diagnostics, StationViewModel? station)
        : this(diagnostics, station, null)
    {
    }

    public AuditViewModel(
        DiagnosticsViewModel diagnostics,
        StationViewModel? station,
        ILocalAuditRepository? localAudit)
    {
        this.diagnostics = diagnostics;
        this.station = station;
        this.localAudit = localAudit;
        RefreshCommand = new AsyncRelayCommand(RefreshAsync);
        SelectCategoryCommand = new RelayCommand<AuditCategory>(SelectCategory);
        SelectShipmentCommand = new RelayCommand<AuditShipmentItemViewModel>(SelectShipment);
        ShowComingSoonCommand = new RelayCommand<string>(ShowComingSoon);
        diagnostics.PropertyChanged += OnDiagnosticsPropertyChanged;
        if (station is not null)
        {
            station.PropertyChanged += OnStationPropertyChanged;
        }
    }

    public IReadOnlyList<AdministrativeCorrectionDiagnostic> Corrections => diagnostics.Corrections;
    public IReadOnlyList<SyncFailureDiagnostic> ReviewEvents => diagnostics.Failures;
    public int FailedReviewCount => diagnostics.FailedReviewCount;
    public int PullReviewCount => diagnostics.PullReviewCount;
    public string LocalReviewCountDescription => FailedReviewCount == 0
        ? "No hay eventos locales rechazados pendientes de revisión."
        : $"{FailedReviewCount} evento(s) local(es) requieren revisión. " +
          $"Se muestran los {ReviewEvents.Count} más recientes.";
    public bool CanViewSensitiveAudit => station?.IsPlantManager ?? true;
    public IReadOnlyList<AuditShipmentItemViewModel> CompletedShipments
    {
        get => completedShipments;
        private set
        {
            if (!SetProperty(ref completedShipments, value)) return;
            OnPropertyChanged(nameof(HasCompletedShipments));
        }
    }
    public bool HasCompletedShipments => CompletedShipments.Count > 0;
    public IReadOnlyList<AuditCorrectionItemViewModel> CajuelaCorrections
    {
        get => cajuelaCorrections;
        private set => SetProperty(ref cajuelaCorrections, value);
    }
    public AuditShipmentItemViewModel? SelectedShipment
    {
        get => selectedShipment;
        private set
        {
            if (!SetProperty(ref selectedShipment, value)) return;
            OnPropertyChanged(nameof(HasSelectedShipment));
        }
    }
    public bool HasSelectedShipment => SelectedShipment is not null;
    public AuditCategory SelectedCategory
    {
        get => selectedCategory;
        private set
        {
            if (!SetProperty(ref selectedCategory, value)) return;
            OnPropertyChanged(nameof(IsOperationCategory));
            OnPropertyChanged(nameof(IsCorrectionsCategory));
            OnPropertyChanged(nameof(IsAccessCategory));
            OnPropertyChanged(nameof(IsAdministrationCategory));
        }
    }
    public bool IsOperationCategory => SelectedCategory == AuditCategory.Operation;
    public bool IsCorrectionsCategory => SelectedCategory == AuditCategory.Corrections;
    public bool IsAccessCategory => SelectedCategory == AuditCategory.Access;
    public bool IsAdministrationCategory => SelectedCategory == AuditCategory.Administration;
    public string CorrectionCountDescription => Corrections.Count > 0
        ? $"{Corrections.Count} corrección(es) disponible(s) para revisión."
        : "No hay correcciones administrativas registradas para revisar.";
    public string Status { get => status; private set => SetProperty(ref status, value); }
    public IAsyncRelayCommand RefreshCommand { get; }
    public IRelayCommand<AuditCategory> SelectCategoryCommand { get; }
    public IRelayCommand<AuditShipmentItemViewModel> SelectShipmentCommand { get; }
    public IRelayCommand<string> ShowComingSoonCommand { get; }

    public Task InitializeAsync() => RefreshAsync();

    private async Task RefreshAsync()
    {
        Status = "Actualizando los registros disponibles…";
        await diagnostics.RefreshAsync().ConfigureAwait(true);
        if (localAudit is not null)
        {
            IReadOnlyList<LocalCompletedShipmentAudit> shipments = await localAudit
                .ListCompletedShipmentsAsync().ConfigureAwait(true);
            string[] accents = ["#8959DD", "#35ADDD", "#ED70A9", "#F19B2C"];
            CompletedShipments = shipments.Select((item, index) => ToViewModel(
                item,
                accents[index % accents.Length])).ToArray();
            SelectedShipment = SelectedShipment is null
                ? FirstOrDefault(CompletedShipments)
                : CompletedShipments.FirstOrDefault(item =>
                    item.ShipmentId == SelectedShipment.ShipmentId)
                  ?? FirstOrDefault(CompletedShipments);
            CajuelaCorrections = (await localAudit.ListCajuelaCorrectionsAsync()
                    .ConfigureAwait(true))
                .Select(ToViewModel)
                .ToArray();
        }
        Status = SelectedCategory == AuditCategory.Corrections
            ? $"{CajuelaCorrections.Count} corrección(es) locales con trazabilidad."
            : $"{CompletedShipments.Count} cargamento(s) finalizado(s) disponibles.";
    }

    private void SelectCategory(AuditCategory category)
    {
        if (category != AuditCategory.Operation && !CanViewSensitiveAudit)
        {
            Status = "Esta categoría contiene información protegida. Eleve el acceso para consultarla.";
            return;
        }

        SelectedCategory = category;
        Status = category switch
        {
            AuditCategory.Operation =>
                $"{CompletedShipments.Count} cargamento(s) finalizado(s) disponibles.",
            AuditCategory.Corrections =>
                $"{CajuelaCorrections.Count} corrección(es) locales con trazabilidad.",
            AuditCategory.Access =>
                "Accesos y validaciones de seguridad estarán disponibles próximamente.",
            _ => "Cambios administrativos estarán disponibles próximamente.",
        };
    }

    private void SelectShipment(AuditShipmentItemViewModel? shipment)
    {
        if (shipment is null) return;
        SelectedShipment = shipment;
        Status = $"Detalle de {shipment.LineName} · {shipment.SupplierName}.";
    }

    private static AuditShipmentItemViewModel ToViewModel(
        LocalCompletedShipmentAudit item,
        string accentColor)
    {
        string period = $"{FormatLocal(item.StartedAt)} → {FormatLocal(item.CompletedAt)}";
        string summary = $"{item.TotalCajuelas} cajuelas · {item.SweepCount} barrida(s) · " +
            $"{item.CorrectionCount} corrección(es)";
        AuditResponsibilityItemViewModel[] responsibilities = item.Responsibilities
            .Select(responsibility => new AuditResponsibilityItemViewModel(
                responsibility.WorkerName,
                $"{FormatLocal(responsibility.AssignedAt)} → " +
                (responsibility.UnassignedAt is null
                    ? "sin cierre registrado"
                    : FormatLocal(responsibility.UnassignedAt.Value))))
            .ToArray();
        return new AuditShipmentItemViewModel(item, accentColor, period, summary, responsibilities);
    }

    private static AuditCorrectionItemViewModel ToViewModel(LocalCajuelaCorrectionAudit item)
    {
        string total = item.TotalBefore is null || item.TotalAfter is null
            ? "Conteo anterior no disponible"
            : $"Conteo: {item.TotalBefore} → {item.TotalAfter}";
        return new AuditCorrectionItemViewModel(item, FormatLocal(item.ConfirmedAt), total);
    }

    private static string FormatLocal(DateTimeOffset value) =>
        value.ToOffset(TimeSpan.FromHours(-6)).ToString(
            "dd/MM/yyyy HH:mm",
            System.Globalization.CultureInfo.InvariantCulture);

    private static T? FirstOrDefault<T>(IReadOnlyList<T> items) =>
        items.Count == 0 ? default : items[0];

    private void ShowComingSoon(string? action)
    {
        string description = string.IsNullOrWhiteSpace(action) ? "Esta acción" : action;
        Status = $"Próximamente: {description}. No se realizó ningún cambio.";
    }

    private void OnDiagnosticsPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName is nameof(DiagnosticsViewModel.Corrections) or
            nameof(DiagnosticsViewModel.Failures) or
            nameof(DiagnosticsViewModel.FailedReviewCount) or
            nameof(DiagnosticsViewModel.PullReviewCount))
        {
            OnPropertyChanged(nameof(Corrections));
            OnPropertyChanged(nameof(ReviewEvents));
            OnPropertyChanged(nameof(FailedReviewCount));
            OnPropertyChanged(nameof(PullReviewCount));
            OnPropertyChanged(nameof(LocalReviewCountDescription));
            OnPropertyChanged(nameof(CorrectionCountDescription));
        }
    }

    private void OnStationPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName != nameof(StationViewModel.Mode)) return;
        OnPropertyChanged(nameof(CanViewSensitiveAudit));
        if (!CanViewSensitiveAudit && SelectedCategory != AuditCategory.Operation)
        {
            SelectedCategory = AuditCategory.Operation;
            Status = "El acceso elevado finalizó. Se muestra únicamente la actividad de operación.";
        }
    }
}
