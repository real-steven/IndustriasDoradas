using System.ComponentModel;
using System.IO;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Configuration;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Presentation.ViewModels;

public sealed record AuditResponsibilityItemViewModel(
    string WorkerName,
    string PeriodDescription);

public sealed class AuditLineFilterViewModel(
    Guid lineId,
    string lineName,
    string accentColor,
    int shipmentCount) : ObservableObject
{
    private bool isSelected;

    public Guid LineId { get; } = lineId;
    public string LineName { get; } = lineName;
    public string AccentColor { get; } = accentColor;
    public int ShipmentCount { get; } = shipmentCount;
    public string ShipmentCountDescription => ShipmentCount == 1
        ? "1 cargamento finalizado"
        : $"{ShipmentCount} cargamentos finalizados";
    public bool IsSelected
    {
        get => isSelected;
        set => SetProperty(ref isSelected, value);
    }
}

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

public enum AuditPeriodMode
{
    CurrentWeek,
    PreviousWeek,
    SelectedWeek,
    SpecificDay,
    AllHistory,
}

public sealed record AuditPeriodOption(AuditPeriodMode Mode, string Name);

public sealed class AuditViewModel : ObservableObject
{
    private static readonly TimeSpan CostaRicaOffset = TimeSpan.FromHours(-6);
    private readonly DiagnosticsViewModel diagnostics;
    private readonly StationViewModel? station;
    private readonly ILocalAuditRepository? localAudit;
    private readonly RecordMercuryMovementHandler? mercuryHandler;
    private readonly Guid stationId;
    private AuditCategory selectedCategory = AuditCategory.Operation;
    private readonly IReadOnlyList<AuditPeriodOption> periodOptions;
    private IReadOnlyList<AuditShipmentItemViewModel> allCompletedShipments = [];
    private AuditPeriodOption selectedPeriodOption;
    private DateTime? selectedFilterDate;
    private string status =
        "Actividad de operación visible. Eleve el acceso para consultar categorías protegidas.";
    private IReadOnlyList<AuditShipmentItemViewModel> completedShipments = [];
    private IReadOnlyList<AuditLineFilterViewModel> shipmentLines = [];
    private IReadOnlyList<AuditShipmentItemViewModel> visibleCompletedShipments = [];
    private IReadOnlyList<AuditCorrectionItemViewModel> cajuelaCorrections = [];
    private AuditLineFilterViewModel? selectedLine;
    private AuditShipmentItemViewModel? selectedShipment;
    private IReadOnlyList<MercuryRastraEntryViewModel> mercuryRastras = [];
    private IReadOnlyList<MercurySweepOption> mercurySweeps = [];
    private IReadOnlyList<LocalMercuryMovement> mercuryMovements = [];
    private MercurySweepOption? selectedMercurySweep;
    private string mercuryStatus = "Seleccione un cargamento finalizado para revisar el mercurio.";

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
        : this(diagnostics, station, localAudit, null, null)
    {
    }

    public AuditViewModel(
        DiagnosticsViewModel diagnostics,
        StationViewModel? station,
        ILocalAuditRepository? localAudit,
        RecordMercuryMovementHandler? mercuryHandler,
        IOptions<StationOptions>? stationOptions)
    {
        this.diagnostics = diagnostics;
        this.station = station;
        this.localAudit = localAudit;
        this.mercuryHandler = mercuryHandler;
        stationId = stationOptions?.Value.Id ?? Guid.Empty;
        periodOptions =
        [
            new(AuditPeriodMode.CurrentWeek, "Esta semana"),
            new(AuditPeriodMode.PreviousWeek, "Semana anterior"),
            new(AuditPeriodMode.SelectedWeek, "Elegir semana"),
            new(AuditPeriodMode.SpecificDay, "Día específico"),
            new(AuditPeriodMode.AllHistory, "Todo el historial"),
        ];
        selectedPeriodOption = periodOptions[0];
        selectedFilterDate = TodayInCostaRica();
        RefreshCommand = new AsyncRelayCommand(RefreshAsync);
        SelectCategoryCommand = new RelayCommand<AuditCategory>(SelectCategory);
        SelectLineCommand = new AsyncRelayCommand<AuditLineFilterViewModel>(SelectLineAsync);
        SelectShipmentCommand = new AsyncRelayCommand<AuditShipmentItemViewModel>(SelectShipmentAsync);
        RecordMercuryCommand = new AsyncRelayCommand(RecordMercuryAsync, () => CanEditMercury);
        PreviousPeriodCommand = new RelayCommand(() => MovePeriod(-1), () => CanNavigatePeriod);
        NextPeriodCommand = new RelayCommand(() => MovePeriod(1), () => CanNavigatePeriod);
        ResetPeriodCommand = new RelayCommand(ResetPeriod);
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
    public IReadOnlyList<AuditPeriodOption> PeriodOptions => periodOptions;
    public AuditPeriodOption SelectedPeriodOption
    {
        get => selectedPeriodOption;
        set
        {
            if (value is null || !SetProperty(ref selectedPeriodOption, value)) return;
            selectedFilterDate = value.Mode switch
            {
                AuditPeriodMode.CurrentWeek => TodayInCostaRica(),
                AuditPeriodMode.PreviousWeek => TodayInCostaRica().AddDays(-7),
                AuditPeriodMode.AllHistory => selectedFilterDate,
                _ => selectedFilterDate ?? TodayInCostaRica(),
            };
            OnPropertyChanged(nameof(SelectedFilterDate));
            NotifyPeriodChanged();
            ApplyShipmentPeriodFilter();
        }
    }
    public DateTime? SelectedFilterDate
    {
        get => selectedFilterDate;
        set
        {
            DateTime? normalized = value?.Date;
            if (!SetProperty(ref selectedFilterDate, normalized)) return;
            NotifyPeriodChanged();
            ApplyShipmentPeriodFilter();
        }
    }
    public bool IsFilterDateVisible => SelectedPeriodOption.Mode is
        AuditPeriodMode.SelectedWeek or AuditPeriodMode.SpecificDay;
    public bool CanNavigatePeriod => SelectedPeriodOption.Mode != AuditPeriodMode.AllHistory;
    public string PeriodDescription => DescribeSelectedPeriod();
    public string FilteredShipmentCountDescription => CompletedShipments.Count == 1
        ? "1 cargamento encontrado"
        : $"{CompletedShipments.Count} cargamentos encontrados";
    public IReadOnlyList<AuditShipmentItemViewModel> CompletedShipments
    {
        get => completedShipments;
        private set
        {
            if (!SetProperty(ref completedShipments, value)) return;
            OnPropertyChanged(nameof(HasCompletedShipments));
            OnPropertyChanged(nameof(FilteredShipmentCountDescription));
        }
    }
    public bool HasCompletedShipments => CompletedShipments.Count > 0;
    public IReadOnlyList<AuditLineFilterViewModel> ShipmentLines
    {
        get => shipmentLines;
        private set => SetProperty(ref shipmentLines, value);
    }
    public IReadOnlyList<AuditShipmentItemViewModel> VisibleCompletedShipments
    {
        get => visibleCompletedShipments;
        private set => SetProperty(ref visibleCompletedShipments, value);
    }
    public AuditLineFilterViewModel? SelectedLine
    {
        get => selectedLine;
        private set
        {
            if (!SetProperty(ref selectedLine, value)) return;
            OnPropertyChanged(nameof(HasSelectedLine));
        }
    }
    public bool HasSelectedLine => SelectedLine is not null;
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
            OnPropertyChanged(nameof(CanEditMercury));
            RecordMercuryCommand.NotifyCanExecuteChanged();
        }
    }
    public bool HasSelectedShipment => SelectedShipment is not null;
    public IReadOnlyList<MercuryRastraEntryViewModel> MercuryRastras
    {
        get => mercuryRastras;
        private set
        {
            if (!SetProperty(ref mercuryRastras, value)) return;
            OnPropertyChanged(nameof(HasMercuryRastras));
            OnPropertyChanged(nameof(CanEditMercury));
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
            OnPropertyChanged(nameof(CanEditMercury));
            LoadMercuryInputs();
            RecordMercuryCommand.NotifyCanExecuteChanged();
        }
    }
    public bool CanEditMercury => CanViewSensitiveAudit && mercuryHandler is not null &&
        stationId != Guid.Empty && SelectedShipment is not null && HasMercuryRastras &&
        SelectedMercurySweep is not null;
    public string MercuryStatus
    {
        get => mercuryStatus;
        private set => SetProperty(ref mercuryStatus, value);
    }
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
    public IAsyncRelayCommand<AuditLineFilterViewModel> SelectLineCommand { get; }
    public IAsyncRelayCommand<AuditShipmentItemViewModel> SelectShipmentCommand { get; }
    public IAsyncRelayCommand RecordMercuryCommand { get; }
    public IRelayCommand PreviousPeriodCommand { get; }
    public IRelayCommand NextPeriodCommand { get; }
    public IRelayCommand ResetPeriodCommand { get; }
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
            Guid? selectedLineId = SelectedLine?.LineId;
            Guid? selectedShipmentId = SelectedShipment?.ShipmentId;
            string[] accents = ["#8959DD", "#35ADDD", "#ED70A9", "#F19B2C"];
            var groupedLines = shipments
                .GroupBy(item => new { item.LineId, item.LineName })
                .OrderBy(group => group.Key.LineName, StringComparer.CurrentCultureIgnoreCase)
                .ToArray();
            Dictionary<Guid, string> accentsByLine = groupedLines
                .Select((group, index) => new
                {
                    group.Key.LineId,
                    Accent = accents[index % accents.Length],
                })
                .ToDictionary(item => item.LineId, item => item.Accent);
            allCompletedShipments = shipments
                .Select(item => ToViewModel(item, accentsByLine[item.LineId]))
                .ToArray();
            ApplyShipmentPeriodFilter(selectedLineId, selectedShipmentId);
            await RefreshSelectedMercuryAsync().ConfigureAwait(true);
            CajuelaCorrections = (await localAudit.ListCajuelaCorrectionsAsync()
                    .ConfigureAwait(true))
                .Select(ToViewModel)
                .ToArray();
        }
        Status = SelectedCategory == AuditCategory.Corrections
            ? $"{CajuelaCorrections.Count} corrección(es) locales con trazabilidad."
            : $"{FilteredShipmentCountDescription} en {PeriodDescription.ToLowerInvariant()}.";
    }

    private void ApplyShipmentPeriodFilter(
        Guid? selectedLineId = null,
        Guid? selectedShipmentId = null)
    {
        selectedLineId ??= SelectedLine?.LineId;
        selectedShipmentId ??= SelectedShipment?.ShipmentId;
        (DateTime? start, DateTime? endExclusive) = SelectedPeriodRange();
        CompletedShipments = allCompletedShipments
            .Where(item => IsWithinPeriod(item.Source.CompletedAt, start, endExclusive))
            .ToArray();
        ShipmentLines = CompletedShipments
            .GroupBy(item => new { item.Source.LineId, item.LineName, item.AccentColor })
            .OrderBy(group => group.Key.LineName, StringComparer.CurrentCultureIgnoreCase)
            .Select(group => new AuditLineFilterViewModel(
                group.Key.LineId,
                group.Key.LineName,
                group.Key.AccentColor,
                group.Count()))
            .ToArray();
        SelectedLine = selectedLineId is null
            ? null
            : ShipmentLines.FirstOrDefault(item => item.LineId == selectedLineId.Value);
        foreach (AuditLineFilterViewModel line in ShipmentLines)
        {
            line.IsSelected = line.LineId == SelectedLine?.LineId;
        }
        VisibleCompletedShipments = SelectedLine is null
            ? []
            : CompletedShipments
                .Where(item => item.Source.LineId == SelectedLine.LineId)
                .ToArray();
        SelectedShipment = selectedShipmentId is null
            ? null
            : VisibleCompletedShipments.FirstOrDefault(item =>
                item.ShipmentId == selectedShipmentId.Value);
        if (SelectedShipment is null)
        {
            MercuryRastras = [];
            MercurySweeps = [];
            mercuryMovements = [];
            SelectedMercurySweep = null;
            MercuryStatus = "Seleccione un cargamento finalizado para revisar el mercurio.";
        }
        if (SelectedCategory == AuditCategory.Operation)
        {
            Status = $"{FilteredShipmentCountDescription} en {PeriodDescription.ToLowerInvariant()}.";
        }
    }

    private (DateTime? Start, DateTime? EndExclusive) SelectedPeriodRange()
    {
        if (SelectedPeriodOption.Mode == AuditPeriodMode.AllHistory) return (null, null);
        DateTime anchor = SelectedFilterDate ?? TodayInCostaRica();
        if (SelectedPeriodOption.Mode == AuditPeriodMode.SpecificDay)
        {
            return (anchor.Date, anchor.Date.AddDays(1));
        }

        DateTime weekStart = StartOfWeek(anchor);
        return (weekStart, weekStart.AddDays(7));
    }

    private string DescribeSelectedPeriod()
    {
        if (SelectedPeriodOption.Mode == AuditPeriodMode.AllHistory) return "Todo el historial";
        (DateTime? start, DateTime? endExclusive) = SelectedPeriodRange();
        if (start is null || endExclusive is null) return "Periodo seleccionado";
        if (SelectedPeriodOption.Mode == AuditPeriodMode.SpecificDay)
        {
            return start.Value.ToString("d 'de' MMMM 'de' yyyy", SpanishCulture());
        }

        DateTime end = endExclusive.Value.AddDays(-1);
        return $"{start.Value.ToString("d MMM", SpanishCulture())} – " +
            end.ToString("d MMM yyyy", SpanishCulture());
    }

    private void MovePeriod(int direction)
    {
        if (!CanNavigatePeriod || direction == 0) return;
        DateTime anchor = SelectedFilterDate ?? TodayInCostaRica();
        bool isDay = SelectedPeriodOption.Mode == AuditPeriodMode.SpecificDay;
        selectedFilterDate = anchor.AddDays(isDay ? direction : direction * 7).Date;
        OnPropertyChanged(nameof(SelectedFilterDate));
        if (!isDay && SelectedPeriodOption.Mode is
            AuditPeriodMode.CurrentWeek or AuditPeriodMode.PreviousWeek)
        {
            selectedPeriodOption = PeriodOptions.Single(item =>
                item.Mode == AuditPeriodMode.SelectedWeek);
            OnPropertyChanged(nameof(SelectedPeriodOption));
        }
        NotifyPeriodChanged();
        ApplyShipmentPeriodFilter();
    }

    private void ResetPeriod()
    {
        selectedPeriodOption = PeriodOptions[0];
        selectedFilterDate = TodayInCostaRica();
        OnPropertyChanged(nameof(SelectedPeriodOption));
        OnPropertyChanged(nameof(SelectedFilterDate));
        NotifyPeriodChanged();
        ApplyShipmentPeriodFilter();
    }

    private void NotifyPeriodChanged()
    {
        OnPropertyChanged(nameof(IsFilterDateVisible));
        OnPropertyChanged(nameof(CanNavigatePeriod));
        OnPropertyChanged(nameof(PeriodDescription));
        PreviousPeriodCommand.NotifyCanExecuteChanged();
        NextPeriodCommand.NotifyCanExecuteChanged();
    }

    private static bool IsWithinPeriod(
        DateTimeOffset completedAt,
        DateTime? start,
        DateTime? endExclusive)
    {
        DateTime localDate = completedAt.ToOffset(CostaRicaOffset).Date;
        return (start is null || localDate >= start.Value) &&
            (endExclusive is null || localDate < endExclusive.Value);
    }

    private static DateTime StartOfWeek(DateTime date)
    {
        int daysSinceMonday = ((int)date.DayOfWeek + 6) % 7;
        return date.Date.AddDays(-daysSinceMonday);
    }

    private static DateTime TodayInCostaRica() =>
        DateTimeOffset.UtcNow.ToOffset(CostaRicaOffset).Date;

    private static System.Globalization.CultureInfo SpanishCulture() =>
        System.Globalization.CultureInfo.GetCultureInfo("es-CR");

    private async Task SelectLineAsync(AuditLineFilterViewModel? line)
    {
        if (line is null) return;
        foreach (AuditLineFilterViewModel item in ShipmentLines)
        {
            item.IsSelected = item.LineId == line.LineId;
        }
        SelectedLine = line;
        VisibleCompletedShipments = CompletedShipments
            .Where(item => item.Source.LineId == line.LineId)
            .ToArray();
        SelectedShipment = null;
        await RefreshSelectedMercuryAsync().ConfigureAwait(true);
        Status = $"{VisibleCompletedShipments.Count} cargamento(s) finalizado(s) en {line.LineName}.";
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
                $"{FilteredShipmentCountDescription} en {PeriodDescription.ToLowerInvariant()}.",
            AuditCategory.Corrections =>
                $"{CajuelaCorrections.Count} corrección(es) locales con trazabilidad.",
            AuditCategory.Access =>
                "Accesos y validaciones de seguridad estarán disponibles próximamente.",
            _ => "Cambios administrativos estarán disponibles próximamente.",
        };
    }

    private async Task SelectShipmentAsync(AuditShipmentItemViewModel? shipment)
    {
        if (shipment is null) return;
        SelectedShipment = shipment;
        await RefreshSelectedMercuryAsync().ConfigureAwait(true);
        Status = $"Detalle de {shipment.LineName} · {shipment.SupplierName}.";
    }

    private async Task RefreshSelectedMercuryAsync()
    {
        if (mercuryHandler is null || SelectedShipment is null)
        {
            MercuryRastras = [];
            MercurySweeps = [];
            mercuryMovements = [];
            SelectedMercurySweep = null;
            return;
        }

        try
        {
            MercuryRastras = (await mercuryHandler.ListRastrasForShipmentAsync(
                    SelectedShipment.ShipmentId)
                .ConfigureAwait(true))
                .Select(component => new MercuryRastraEntryViewModel(component))
                .ToArray();
            MercurySweeps = (await mercuryHandler.ListSweepsAsync(SelectedShipment.ShipmentId)
                    .ConfigureAwait(true))
                .Select((sweep, index) => new MercurySweepOption(
                    sweep,
                    $"Barrida {index + 1} · {sweep.CajuelaCount} cajuelas" +
                    (sweep.IsFinal ? " · final" : string.Empty)))
                .ToArray();
            mercuryMovements = await mercuryHandler.ListCurrentAsync(SelectedShipment.ShipmentId)
                .ConfigureAwait(true);
            SelectedMercurySweep = MercurySweeps.Count == 0 ? null : MercurySweeps[0];
            LoadMercuryInputs();
            MercuryStatus = MercuryRastras.Count == 0
                ? "No hay rastras disponibles para este cargamento."
                : "Seleccione una barrida y complete cuánto entró y cuánto quedó al final en cada rastra.";
        }
        catch (Exception exception) when (
            exception is IOException or InvalidOperationException or Microsoft.Data.Sqlite.SqliteException)
        {
            MercuryRastras = [];
            MercurySweeps = [];
            mercuryMovements = [];
            SelectedMercurySweep = null;
            MercuryStatus = "No se pudo reconstruir el historial local de mercurio.";
        }
    }

    private async Task RecordMercuryAsync()
    {
        if (!CanEditMercury || mercuryHandler is null || SelectedShipment is null) return;
        var parsed = new List<(MercuryRastraEntryViewModel Rastra, decimal? Input, decimal? Remainder)>();
        foreach (MercuryRastraEntryViewModel rastra in MercuryRastras)
        {
            if (!TryParseMercury(rastra.InputAmountText, out decimal? input))
            {
                MercuryStatus = $"{rastra.Name}, mercurio que entró: use cero o un número positivo con máximo dos decimales.";
                return;
            }
            if (!TryParseMercury(rastra.RemainderAmountText, out decimal? remainder))
            {
                MercuryStatus = $"{rastra.Name}, mercurio que quedó al final: use cero o un número positivo con máximo dos decimales.";
                return;
            }
            parsed.Add((rastra, input, remainder));
        }

        try
        {
            station?.RecordActivity();
            foreach ((MercuryRastraEntryViewModel rastra, decimal? input, decimal? remainder) in parsed)
            {
                await mercuryHandler.RecordAsync(
                        stationId,
                        SelectedShipment.ShipmentId,
                        rastra.Id,
                        MercuryMovementKind.SweepInput,
                        input,
                        SelectedMercurySweep!.Id,
                        replaceCurrent: true)
                    .ConfigureAwait(true);
                await mercuryHandler.RecordAsync(
                        stationId,
                        SelectedShipment.ShipmentId,
                        rastra.Id,
                        MercuryMovementKind.SweepRemainder,
                        remainder,
                        SelectedMercurySweep.Id,
                        replaceCurrent: true)
                    .ConfigureAwait(true);
            }
            await RefreshSelectedMercuryAsync().ConfigureAwait(true);
            await RefreshAsync().ConfigureAwait(true);
            MercuryStatus = $"Entrada y saldo final guardados para {parsed.Count} rastra(s).";
        }
        catch (Exception exception) when (
            exception is IOException or InvalidOperationException or UnauthorizedAccessException or
            Microsoft.Data.Sqlite.SqliteException)
        {
            MercuryStatus = exception is UnauthorizedAccessException
                ? exception.Message
                : "No se pudo guardar el movimiento; el historial anterior se conservó.";
        }
    }

    private void LoadMercuryInputs()
    {
        Guid? sweepId = SelectedMercurySweep?.Id;
        foreach (MercuryRastraEntryViewModel rastra in MercuryRastras)
        {
            LocalMercuryMovement? input = mercuryMovements.LastOrDefault(item =>
                item.LineComponentId == rastra.Id && item.Kind == MercuryMovementKind.SweepInput &&
                item.SweepId == sweepId);
            LocalMercuryMovement? remainder = mercuryMovements.LastOrDefault(item =>
                item.LineComponentId == rastra.Id && item.Kind == MercuryMovementKind.SweepRemainder &&
                item.SweepId == sweepId);
            rastra.CurrentDescription =
                $"Entró {FormatMercury(input?.AmountGrams)} · quedó {FormatMercury(remainder?.AmountGrams)}";
            rastra.InputAmountText = FormatInput(input?.AmountGrams);
            rastra.RemainderAmountText = FormatInput(remainder?.AmountGrams);
        }
    }

    private static bool TryParseMercury(string? text, out decimal? amount)
    {
        string normalized = (text ?? string.Empty).Trim().Replace(',', '.');
        if (normalized.Length == 0)
        {
            amount = null;
            return true;
        }
        bool valid = decimal.TryParse(
            normalized,
            System.Globalization.NumberStyles.AllowDecimalPoint,
            System.Globalization.CultureInfo.InvariantCulture,
            out decimal value);
        amount = valid ? value : null;
        return valid && value >= 0 && decimal.Round(value, 2) == value;
    }

    private static string FormatMercury(decimal? value) => value is null
        ? "pendiente"
        : $"{value.Value.ToString("0.##", System.Globalization.CultureInfo.InvariantCulture)} g";

    private static string FormatInput(decimal? value) =>
        value?.ToString("0.##", System.Globalization.CultureInfo.InvariantCulture) ?? string.Empty;

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
        OnPropertyChanged(nameof(CanEditMercury));
        RecordMercuryCommand.NotifyCanExecuteChanged();
        if (!CanViewSensitiveAudit && SelectedCategory != AuditCategory.Operation)
        {
            SelectedCategory = AuditCategory.Operation;
            Status = "El acceso elevado finalizó. Se muestra únicamente la actividad de operación.";
        }
    }
}
