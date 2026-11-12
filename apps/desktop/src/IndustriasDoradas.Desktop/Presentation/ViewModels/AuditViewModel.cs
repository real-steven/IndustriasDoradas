using System.ComponentModel;
using System.IO;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Configuration;
using IndustriasDoradas.Desktop.Domain.Attendance;
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
    public string ShipmentCode => Application.ShipmentCode.From(Source.ShipmentId);
    public string Identifier => $"{Source.SupplierName} · Cargamento {ShipmentCode}";
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
    public string TypeDescription => RequiredPlantManager
        ? "Corrección posterior · Modo Jefe"
        : "Corrección inmediata";
}

public sealed record AuditFilterOption(string Code, string Name);

public sealed record AuditWorkerFilterOption(Guid? WorkerId, string Name);

public sealed record AuditAttendanceItemViewModel(
    Guid WorkerId,
    string WorkerName,
    string WorkerRole,
    string EntryDescription,
    string ExitDescription,
    string DurationDescription,
    string StatusDescription,
    string CorrectionDescription,
    string IncidentDescription,
    bool IsOpen,
    bool HasIncident,
    DateTimeOffset? EntryAt,
    DateTimeOffset? ExitAt);

public sealed record AuditSecurityItemViewModel(
    LocalSecurityAuditEvent Source,
    string TypeDescription,
    string OccurredDescription,
    string Tone)
{
    public string ActorName => Source.ActorName;
    public string Result => Source.Result;
    public string Details => Source.Details;
}

public enum AuditCategory
{
    Operation,
    Corrections,
    Attendance,
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
    private static readonly string[] LineAccents = ["#8959DD", "#35ADDD", "#ED70A9", "#F19B2C"];
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
    private IReadOnlyList<AuditCorrectionItemViewModel> allCajuelaCorrections = [];
    private IReadOnlyList<AuditAttendanceItemViewModel> allAttendanceItems = [];
    private IReadOnlyList<AuditAttendanceItemViewModel> attendanceItems = [];
    private IReadOnlyList<AuditWorkerFilterOption> attendanceWorkers = [];
    private IReadOnlyList<AuditAttendanceIncidentViewModel> allAttendanceIncidents = [];
    private IReadOnlyList<AuditAttendanceIncidentViewModel> attendanceIncidents = [];
    private bool isIncidentFilterActive;
    private string shipmentCodeCopyStatus = string.Empty;
    private int shipmentCodeCopyVersion;
    private IReadOnlyList<AuditSecurityItemViewModel> allSecurityEvents = [];
    private IReadOnlyList<AuditSecurityItemViewModel> securityEvents = [];
    private readonly IReadOnlyList<AuditFilterOption> correctionTypeOptions;
    private readonly IReadOnlyList<AuditFilterOption> securityTypeOptions;
    private AuditFilterOption selectedCorrectionType;
    private AuditFilterOption selectedSecurityType;
    private AuditWorkerFilterOption? selectedAttendanceWorker;
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
        correctionTypeOptions =
        [
            new("ALL", "Todas las correcciones"),
            new("MANAGER", "Con Modo Jefe de Planta"),
            new("IMMEDIATE", "Correcciones inmediatas"),
        ];
        selectedCorrectionType = correctionTypeOptions[0];
        securityTypeOptions =
        [
            new("ALL", "Toda la seguridad"),
            new("SESSION", "Aperturas y cierres"),
            new("ELEVATION", "Elevaciones de acceso"),
            new("REJECTED", "Accesos rechazados"),
        ];
        selectedSecurityType = securityTypeOptions[0];
        RefreshCommand = new AsyncRelayCommand(RefreshAsync);
        SelectCategoryCommand = new AsyncRelayCommand<AuditCategory>(SelectCategoryAsync);
        SelectLineCommand = new AsyncRelayCommand<AuditLineFilterViewModel>(SelectLineAsync);
        SelectShipmentCommand = new AsyncRelayCommand<AuditShipmentItemViewModel>(SelectShipmentAsync);
        RecordMercuryCommand = new AsyncRelayCommand(RecordMercuryAsync, () => CanEditMercury);
        PreviousPeriodCommand = new RelayCommand(() => MovePeriod(-1), () => CanNavigatePeriod);
        NextPeriodCommand = new RelayCommand(() => MovePeriod(1), () => CanNavigatePeriod);
        ResetPeriodCommand = new RelayCommand(ResetPeriod);
        ShowComingSoonCommand = new RelayCommand<string>(ShowComingSoon);
        ToggleIncidentFilterCommand = new RelayCommand(
            () => IsIncidentFilterActive = !IsIncidentFilterActive);
        ClearIncidentFilterCommand = new RelayCommand(
            () => IsIncidentFilterActive = false,
            () => IsIncidentFilterActive);
        CopyShipmentCodeCommand = new AsyncRelayCommand<AuditShipmentItemViewModel>(
            CopyShipmentCodeAsync,
            AsyncRelayCommandOptions.AllowConcurrentExecutions);
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
        ? "No hay problemas locales de sincronización."
        : $"{FailedReviewCount} evento(s) local(es) no pudieron sincronizarse. " +
          $"Se muestran los {ReviewEvents.Count} más recientes para soporte.";
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
            RequestVisibleRefresh();
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
            RequestVisibleRefresh();
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
            OnPropertyChanged(nameof(VisibleRecordCountDescription));
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
        private set
        {
            if (!SetProperty(ref cajuelaCorrections, value)) return;
            OnPropertyChanged(nameof(VisibleRecordCountDescription));
        }
    }
    public IReadOnlyList<AuditFilterOption> CorrectionTypeOptions => correctionTypeOptions;
    public AuditFilterOption SelectedCorrectionType
    {
        get => selectedCorrectionType;
        set
        {
            if (value is null || !SetProperty(ref selectedCorrectionType, value)) return;
            ApplyCorrectionFilter();
        }
    }
    public IReadOnlyList<AuditAttendanceItemViewModel> AttendanceItems
    {
        get => attendanceItems;
        private set
        {
            if (!SetProperty(ref attendanceItems, value)) return;
            OnPropertyChanged(nameof(HasAttendanceItems));
            OnPropertyChanged(nameof(VisibleRecordCountDescription));
        }
    }
    public bool HasAttendanceItems => AttendanceItems.Count > 0;
    public IReadOnlyList<AuditWorkerFilterOption> AttendanceWorkers
    {
        get => attendanceWorkers;
        private set => SetProperty(ref attendanceWorkers, value);
    }
    public AuditWorkerFilterOption? SelectedAttendanceWorker
    {
        get => selectedAttendanceWorker;
        set
        {
            if (!SetProperty(ref selectedAttendanceWorker, value)) return;
            ApplyAttendanceFilter();
        }
    }
    public int PersonnelInPlantCount => allAttendanceItems.Count(item => item.IsOpen);
    /// <summary>Incidencias del periodo y de la persona elegida: lo mismo que muestra el filtro.</summary>
    public int AttendanceIncidentCount => AttendanceIncidents.Count;
    public int OpenAttendanceIncidentCount => AttendanceIncidents.Count(item => item.IsOpen);
    public string AttendanceIncidentSummary => OpenAttendanceIncidentCount == 1
        ? "1 abierta"
        : $"{OpenAttendanceIncidentCount} abiertas";
    public IReadOnlyList<AuditAttendanceIncidentViewModel> AttendanceIncidents
    {
        get => attendanceIncidents;
        private set
        {
            if (!SetProperty(ref attendanceIncidents, value)) return;
            OnPropertyChanged(nameof(AttendanceIncidentCount));
            OnPropertyChanged(nameof(OpenAttendanceIncidentCount));
            OnPropertyChanged(nameof(AttendanceIncidentSummary));
            OnPropertyChanged(nameof(HasAttendanceIncidents));
            OnPropertyChanged(nameof(IncidentFilterDescription));
            OnPropertyChanged(nameof(VisibleRecordCountDescription));
        }
    }
    public bool HasAttendanceIncidents => AttendanceIncidents.Count > 0;
    public bool IsIncidentFilterActive
    {
        get => isIncidentFilterActive;
        set
        {
            if (!SetProperty(ref isIncidentFilterActive, value)) return;
            OnPropertyChanged(nameof(IsShowingAllAttendance));
            OnPropertyChanged(nameof(IncidentFilterDescription));
            OnPropertyChanged(nameof(VisibleRecordCountDescription));
            ClearIncidentFilterCommand.NotifyCanExecuteChanged();
            if (SelectedCategory == AuditCategory.Attendance)
            {
                Status = value
                    ? $"Filtro de incidencias activo. {IncidentFilterDescription}."
                    : $"Filtro de incidencias quitado. {VisibleRecordCountDescription}.";
            }
        }
    }
    public bool IsShowingAllAttendance => !IsIncidentFilterActive;
    public string IncidentFilterDescription => AttendanceIncidentCount == 1
        ? "Mostrando 1 incidencia"
        : $"Mostrando {AttendanceIncidentCount} incidencias";
    public string ShipmentCodeCopyStatus
    {
        get => shipmentCodeCopyStatus;
        private set
        {
            if (!SetProperty(ref shipmentCodeCopyStatus, value)) return;
            OnPropertyChanged(nameof(HasShipmentCodeCopyStatus));
        }
    }
    public bool HasShipmentCodeCopyStatus => ShipmentCodeCopyStatus.Length > 0;
    /// <summary>Reemplazable en pruebas; en la aplicación usa el portapapeles de Windows.</summary>
    public IClipboardWriter ClipboardWriter { get; set; } = new WpfClipboardWriter();
    /// <summary>Tiempo durante el que se muestra la confirmación de copia.</summary>
    public TimeSpan CopyFeedbackDuration { get; set; } = TimeSpan.FromSeconds(3);
    public string TodayHoursDescription
    {
        get
        {
            TimeSpan total = TimeSpan.Zero;
            DateTime today = TodayInCostaRica();
            var dayStart = new DateTimeOffset(
                DateTime.SpecifyKind(today, DateTimeKind.Unspecified),
                CostaRicaOffset);
            DateTimeOffset dayEnd = dayStart.AddDays(1);
            DateTimeOffset now = DateTimeOffset.UtcNow;
            foreach (AuditAttendanceItemViewModel item in allAttendanceItems)
            {
                if (item.EntryAt is not DateTimeOffset entry) continue;
                DateTimeOffset exit = item.ExitAt ?? now;
                DateTimeOffset overlapStart = entry > dayStart ? entry : dayStart;
                DateTimeOffset overlapEnd = exit < dayEnd ? exit : dayEnd;
                if (overlapEnd > overlapStart) total += overlapEnd - overlapStart;
            }
            return $"{Math.Floor(total.TotalHours):0} h {total.Minutes:00} min";
        }
    }
    public IReadOnlyList<AuditFilterOption> SecurityTypeOptions => securityTypeOptions;
    public AuditFilterOption SelectedSecurityType
    {
        get => selectedSecurityType;
        set
        {
            if (value is null || !SetProperty(ref selectedSecurityType, value)) return;
            ApplySecurityFilter();
        }
    }
    public IReadOnlyList<AuditSecurityItemViewModel> SecurityEvents
    {
        get => securityEvents;
        private set
        {
            if (!SetProperty(ref securityEvents, value)) return;
            OnPropertyChanged(nameof(HasSecurityEvents));
            OnPropertyChanged(nameof(VisibleRecordCountDescription));
        }
    }
    public bool HasSecurityEvents => SecurityEvents.Count > 0;
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
            OnPropertyChanged(nameof(IsAttendanceCategory));
            OnPropertyChanged(nameof(IsAccessCategory));
            OnPropertyChanged(nameof(IsAdministrationCategory));
            OnPropertyChanged(nameof(VisibleRecordCountDescription));
        }
    }
    public bool IsOperationCategory => SelectedCategory == AuditCategory.Operation;
    public bool IsCorrectionsCategory => SelectedCategory == AuditCategory.Corrections;
    public bool IsAttendanceCategory => SelectedCategory == AuditCategory.Attendance;
    public bool IsAccessCategory => SelectedCategory == AuditCategory.Access;
    public bool IsAdministrationCategory => SelectedCategory == AuditCategory.Administration;
    public string VisibleRecordCountDescription => SelectedCategory switch
    {
        AuditCategory.Operation => FilteredShipmentCountDescription,
        AuditCategory.Corrections => CajuelaCorrections.Count == 1
            ? "1 corrección encontrada"
            : $"{CajuelaCorrections.Count} correcciones encontradas",
        AuditCategory.Attendance when IsIncidentFilterActive => IncidentFilterDescription,
        AuditCategory.Attendance => AttendanceItems.Count == 1
            ? "1 jornada encontrada"
            : $"{AttendanceItems.Count} jornadas encontradas",
        AuditCategory.Access => SecurityEvents.Count == 1
            ? "1 evento encontrado"
            : $"{SecurityEvents.Count} eventos encontrados",
        _ => "Módulo próximo",
    };
    public string CorrectionCountDescription => Corrections.Count > 0
        ? $"{Corrections.Count} corrección(es) disponible(s) para revisión."
        : "No hay correcciones administrativas registradas para revisar.";
    public string Status { get => status; private set => SetProperty(ref status, value); }
    public IAsyncRelayCommand RefreshCommand { get; }
    public IAsyncRelayCommand<AuditCategory> SelectCategoryCommand { get; }
    public IAsyncRelayCommand<AuditLineFilterViewModel> SelectLineCommand { get; }
    public IAsyncRelayCommand<AuditShipmentItemViewModel> SelectShipmentCommand { get; }
    public IAsyncRelayCommand RecordMercuryCommand { get; }
    public IRelayCommand PreviousPeriodCommand { get; }
    public IRelayCommand NextPeriodCommand { get; }
    public IRelayCommand ResetPeriodCommand { get; }
    public IRelayCommand<string> ShowComingSoonCommand { get; }
    public IRelayCommand ToggleIncidentFilterCommand { get; }
    public IRelayCommand ClearIncidentFilterCommand { get; }
    public IAsyncRelayCommand<AuditShipmentItemViewModel> CopyShipmentCodeCommand { get; }

    public Task InitializeAsync() => RefreshAsync();

    public async Task RefreshAsync()
    {
        Status = "Actualizando los registros disponibles…";
        if (localAudit is null)
        {
            Status = "La auditoría local no está disponible en este equipo.";
            return;
        }

        LocalAuditQuery query = SelectedAuditQuery();
        if (SelectedCategory == AuditCategory.Operation)
        {
            IReadOnlyList<LocalCompletedShipmentAudit> shipments = await localAudit
                .ListCompletedShipmentsAsync(query).ConfigureAwait(true);
            Guid? selectedLineId = SelectedLine?.LineId;
            Guid? selectedShipmentId = SelectedShipment?.ShipmentId;
            Dictionary<Guid, string> accentsByLine = shipments
                .GroupBy(item => item.LineId)
                .ToDictionary(
                    group => group.Key,
                    group => AccentForDisplayOrder(group.First().DisplayOrder));
            allCompletedShipments = shipments
                .Select(item => ToViewModel(item, accentsByLine[item.LineId]))
                .ToArray();
            ApplyShipmentPeriodFilter(selectedLineId, selectedShipmentId);
            await RefreshSelectedMercuryAsync().ConfigureAwait(true);
        }
        else if (SelectedCategory == AuditCategory.Corrections)
        {
            allCajuelaCorrections = (await localAudit.ListCajuelaCorrectionsAsync(query)
                    .ConfigureAwait(true))
                .Select(ToViewModel)
                .ToArray();
            ApplyCorrectionFilter();
        }
        else if (SelectedCategory == AuditCategory.Attendance)
        {
            LoadAttendance(await localAudit.ListAttendanceAsync(query).ConfigureAwait(true));
        }
        else if (SelectedCategory == AuditCategory.Access)
        {
            allSecurityEvents = (await localAudit.ListSecurityEventsAsync(query)
                    .ConfigureAwait(true))
                .Select(ToViewModel)
                .ToArray();
            ApplySecurityFilter();
        }
        Status = StatusForSelectedCategory();
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
            .GroupBy(item => new
            {
                item.Source.LineId,
                item.LineName,
                item.AccentColor,
                item.Source.DisplayOrder,
            })
            .OrderBy(group => group.Key.DisplayOrder)
            .ThenBy(group => group.Key.LineId)
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

    private static string AccentForDisplayOrder(int displayOrder) =>
        LineAccents[(Math.Max(displayOrder, 1) - 1) % LineAccents.Length];

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
        RequestVisibleRefresh();
    }

    private void ResetPeriod()
    {
        selectedPeriodOption = PeriodOptions[0];
        selectedFilterDate = TodayInCostaRica();
        OnPropertyChanged(nameof(SelectedPeriodOption));
        OnPropertyChanged(nameof(SelectedFilterDate));
        NotifyPeriodChanged();
        ApplyShipmentPeriodFilter();
        RequestVisibleRefresh();
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

    private async Task SelectCategoryAsync(AuditCategory category)
    {
        if (category != AuditCategory.Operation && !CanViewSensitiveAudit)
        {
            Status = "Esta categoría contiene información protegida. Eleve el acceso para consultarla.";
            return;
        }

        SelectedCategory = category;
        await RefreshAsync().ConfigureAwait(true);
        Status = StatusForSelectedCategory();
    }

    private LocalAuditQuery SelectedAuditQuery()
    {
        (DateTime? start, DateTime? endExclusive) = SelectedPeriodRange();
        DateTimeOffset? startUtc = start is null
            ? null
            : new DateTimeOffset(start.Value, CostaRicaOffset).ToUniversalTime();
        DateTimeOffset? endUtc = endExclusive is null
            ? null
            : new DateTimeOffset(endExclusive.Value, CostaRicaOffset).ToUniversalTime();
        return new LocalAuditQuery(startUtc, endUtc, 200);
    }

    private string StatusForSelectedCategory() => SelectedCategory switch
    {
        AuditCategory.Operation =>
            $"{FilteredShipmentCountDescription} en {PeriodDescription.ToLowerInvariant()}.",
        AuditCategory.Corrections =>
            $"{CajuelaCorrections.Count} corrección(es) locales con trazabilidad.",
        AuditCategory.Attendance =>
            IsIncidentFilterActive
                ? $"Filtro de incidencias activo. {IncidentFilterDescription}."
                : $"{AttendanceItems.Count} jornada(s) y {AttendanceIncidentCount} incidencia(s) en el periodo.",
        AuditCategory.Access =>
            $"{SecurityEvents.Count} evento(s) de seguridad en el periodo.",
        _ => "Cambios administrativos estarán disponibles próximamente.",
    };

    private void RequestVisibleRefresh()
    {
        if (localAudit is null || RefreshCommand.IsRunning) return;
        RefreshCommand.Execute(null);
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

    private void ApplyCorrectionFilter()
    {
        CajuelaCorrections = SelectedCorrectionType.Code switch
        {
            "MANAGER" => allCajuelaCorrections.Where(item => item.RequiredPlantManager).ToArray(),
            "IMMEDIATE" => allCajuelaCorrections.Where(item => !item.RequiredPlantManager).ToArray(),
            _ => allCajuelaCorrections,
        };
    }

    private void LoadAttendance(IReadOnlyList<LocalAttendanceWorkerAudit> workers)
    {
        Guid? selectedWorkerId = SelectedAttendanceWorker?.WorkerId;
        AttendanceWorkers =
        [
            new AuditWorkerFilterOption(null, "Todo el personal"),
            .. workers.Select(worker => new AuditWorkerFilterOption(worker.WorkerId, worker.WorkerName)),
        ];
        SelectedAttendanceWorker = AttendanceWorkers.FirstOrDefault(item =>
            item.WorkerId == selectedWorkerId) ?? AttendanceWorkers[0];

        DateTimeOffset now = DateTimeOffset.UtcNow;
        var items = new List<AuditAttendanceItemViewModel>();
        var incidents = new List<AuditAttendanceIncidentViewModel>();
        foreach (LocalAttendanceWorkerAudit worker in workers)
        {
            if (worker.Events.Count == 0) continue;
            AttendanceProjection projection = AttendanceProjectionService.Project(worker.Events, now);
            incidents.AddRange(AuditAttendanceIncidents.Build(worker, now));
            string workerRole = worker.WorkerCategory == "JEFE_PLANTA"
                ? "Jefe de planta"
                : "Operario";
            var representedIncidentIds = new HashSet<Guid>();
            foreach (AttendanceShift shift in projection.Shifts.OrderByDescending(item => item.CheckIn.OccurredAt))
            {
                TimeSpan duration = shift.Duration ?? (now - shift.CheckIn.OccurredAt);
                if (duration < TimeSpan.Zero) duration = TimeSpan.Zero;
                Guid[] relatedIds = shift.CheckOut is null
                    ? [shift.CheckIn.ClientEventId]
                    : [shift.CheckIn.ClientEventId, shift.CheckOut.ClientEventId];
                AttendanceIncident[] shiftIncidents = projection.Incidents
                    .Where(incident => relatedIds.Contains(incident.EventId))
                    .ToArray();
                foreach (AttendanceIncident incident in shiftIncidents)
                {
                    representedIncidentIds.Add(incident.EventId);
                }
                string incidentDescription = string.Join(
                    " · ",
                    shiftIncidents.Select(incident => incident.Description).Distinct());
                string correctionDescription = string.Join(
                    " · ",
                    worker.Events
                        .Where(item => item.IsAdjustment &&
                            item.RelatedEventId is Guid relatedId && relatedIds.Contains(relatedId))
                        .Select(item => item.CorrectionReason)
                        .Where(item => !string.IsNullOrWhiteSpace(item))
                        .Distinct());
                items.Add(new AuditAttendanceItemViewModel(
                    worker.WorkerId,
                    worker.WorkerName,
                    workerRole,
                    FormatLocal(shift.CheckIn.OccurredAt),
                    shift.CheckOut is null ? "Jornada abierta" : FormatLocal(shift.CheckOut.OccurredAt),
                    FormatDuration(duration),
                    shift.Status == AttendanceShiftStatus.Open ? "EN PLANTA" : "JORNADA CERRADA",
                    string.IsNullOrWhiteSpace(correctionDescription)
                        ? "Sin correcciones"
                        : $"Corrección: {correctionDescription}",
                    incidentDescription,
                    shift.Status == AttendanceShiftStatus.Open,
                    shiftIncidents.Length > 0,
                    shift.CheckIn.OccurredAt,
                    shift.CheckOut?.OccurredAt));
            }

            foreach (AttendanceIncident incident in projection.Incidents
                         .Where(item => !representedIncidentIds.Contains(item.EventId)))
            {
                AttendanceEvent? sourceEvent = worker.Events.FirstOrDefault(item =>
                    item.ClientEventId == incident.EventId);
                items.Add(new AuditAttendanceItemViewModel(
                    worker.WorkerId,
                    worker.WorkerName,
                    workerRole,
                    sourceEvent is null ? "Marca no identificada" : FormatLocal(sourceEvent.OccurredAt),
                    "La marca no modificó la jornada",
                    "—",
                    "INCIDENCIA",
                    string.IsNullOrWhiteSpace(sourceEvent?.CorrectionReason)
                        ? "Sin correcciones"
                        : $"Corrección: {sourceEvent.CorrectionReason}",
                    incident.Description,
                    false,
                    true,
                    null,
                    null));
            }
        }

        allAttendanceItems = items
            .OrderByDescending(item => item.IsOpen)
            .ThenBy(item => item.WorkerName, StringComparer.CurrentCultureIgnoreCase)
            .ToArray();
        allAttendanceIncidents = incidents
            .OrderByDescending(item => item.IsOpen)
            .ThenByDescending(item => item.OccurredAt)
            .ThenBy(item => item.WorkerName, StringComparer.CurrentCultureIgnoreCase)
            .ToArray();
        OnPropertyChanged(nameof(PersonnelInPlantCount));
        OnPropertyChanged(nameof(TodayHoursDescription));
        ApplyAttendanceFilter();
    }

    private void ApplyAttendanceFilter()
    {
        AttendanceItems = SelectedAttendanceWorker?.WorkerId is Guid workerId
            ? allAttendanceItems.Where(item => item.WorkerId == workerId).ToArray()
            : allAttendanceItems;
        AttendanceIncidents = SelectedAttendanceWorker?.WorkerId is Guid incidentWorkerId
            ? allAttendanceIncidents.Where(item => item.WorkerId == incidentWorkerId).ToArray()
            : allAttendanceIncidents;
        if (SelectedCategory == AuditCategory.Attendance && IsIncidentFilterActive)
        {
            Status = StatusForSelectedCategory();
        }
    }

    private void ApplySecurityFilter()
    {
        SecurityEvents = SelectedSecurityType.Code switch
        {
            "SESSION" => allSecurityEvents
                .Where(item => item.Source.EventType.StartsWith("SESSION_", StringComparison.Ordinal))
                .ToArray(),
            "ELEVATION" => allSecurityEvents
                .Where(item => SecurityAudit.IsElevation(item.Source.EventType))
                .ToArray(),
            "REJECTED" => allSecurityEvents
                .Where(item => SecurityAudit.IsRejection(item.Source.EventType))
                .ToArray(),
            _ => allSecurityEvents,
        };
    }

    private static AuditSecurityItemViewModel ToViewModel(LocalSecurityAuditEvent item)
    {
        string type = SecurityAudit.Describe(item.EventType, item.Method);
        string tone = SecurityAudit.IsRejection(item.EventType) ||
            item.EventType == SecurityAudit.SessionExpired
            ? "#FFF8E9"
            : "#F7F9FA";
        return new AuditSecurityItemViewModel(item, type, FormatLocal(item.OccurredAt), tone);
    }

    private static string FormatDuration(TimeSpan duration) =>
        $"{Math.Floor(duration.TotalHours):0} h {duration.Minutes:00} min";

    private static string FormatLocal(DateTimeOffset value) =>
        value.ToOffset(TimeSpan.FromHours(-6)).ToString(
            "dd/MM/yyyy HH:mm",
            System.Globalization.CultureInfo.InvariantCulture);

    private async Task CopyShipmentCodeAsync(AuditShipmentItemViewModel? shipment)
    {
        if (shipment is null) return;
        int version = ++shipmentCodeCopyVersion;
        bool copied = ClipboardWriter.TrySetText(shipment.ShipmentCode);
        ShipmentCodeCopyStatus = copied
            ? "Código copiado"
            : $"No se pudo copiar. Seleccione el código {shipment.ShipmentCode} y cópielo a mano.";
        Status = copied
            ? $"Código copiado: {shipment.ShipmentCode}."
            : ShipmentCodeCopyStatus;
        if (!copied) return;
        await Task.Delay(CopyFeedbackDuration).ConfigureAwait(true);
        if (version == shipmentCodeCopyVersion) ShipmentCodeCopyStatus = string.Empty;
    }

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
