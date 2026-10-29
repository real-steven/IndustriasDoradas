using System.Collections.ObjectModel;
using System.Globalization;
using System.IO;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain;
using IndustriasDoradas.Desktop.Domain.Attendance;
using Microsoft.Data.Sqlite;

namespace IndustriasDoradas.Desktop.Presentation.ViewModels;

public sealed record AttendanceWorkerStatus(
    CachedWorker Worker,
    bool IsPresent,
    string State,
    string LastMark,
    int IncidentCount,
    Guid? OpenCheckInId,
    DateTimeOffset? OpenCheckInAt)
{
    public Guid Id => Worker.Id;
    public string Name => Worker.Name;
    public string CategoryLabel => Worker.Category == "JEFE_PLANTA" ? "Jefe de planta" : "Operario";
    public string DisplayName => Worker.DisplayName;
    public string StateColor => IsPresent ? "#178449" : "#71808A";
}

public sealed class AttendancePreviewViewModel : ObservableObject
{
    private const int WorkerPageSize = 5;
    private static readonly TimeZoneInfo CostaRicaTimeZone = TimeZoneInfo.CreateCustomTimeZone(
        "America/Costa_Rica",
        TimeSpan.FromHours(-6),
        "Costa Rica",
        "Costa Rica");

    private readonly ILocalAttendanceRepository? attendance;
    private readonly ILocalCatalogRepository? catalogs;
    private readonly IProtectedStationStore? stationStore;
    private readonly TimeProvider timeProvider;
    private readonly IPlantManagerModeAccessor? managerMode;
    private readonly ILocalOperationDashboardRepository? operationDashboard;
    private ProtectedStationState? station;
    private AttendanceWorkerStatus? selectedWorker;
    private string status = "Cargando el registro local de asistencia…";
    private string correctionReason = string.Empty;
    private DateTime? correctionDate;
    private string correctionTime = string.Empty;
    private string workerSearchText = string.Empty;
    private bool isBusy;
    private bool isCorrectionPanelOpen;
    private int presentCount;
    private int openShiftCount;
    private int incidentCount;
    private int currentWorkerPage;
    private int filteredWorkerCount;
    private string responsibilityWarning = string.Empty;
    private string responsibilityWarningKey = string.Empty;

    public AttendancePreviewViewModel()
        : this(null, null, null, TimeProvider.System, null)
    {
        Status = "La asistencia estará disponible cuando la estación tenga su almacenamiento local.";
    }

    public AttendancePreviewViewModel(
        ILocalAttendanceRepository? attendance,
        ILocalCatalogRepository? catalogs,
        IProtectedStationStore? stationStore,
        TimeProvider timeProvider,
        IPlantManagerModeAccessor? managerMode,
        ILocalOperationDashboardRepository? operationDashboard = null)
    {
        this.attendance = attendance;
        this.catalogs = catalogs;
        this.stationStore = stationStore;
        this.timeProvider = timeProvider;
        this.managerMode = managerMode;
        this.operationDashboard = operationDashboard;
        CheckInCommand = new AsyncRelayCommand(CheckInAsync, CanCheckIn);
        CheckOutCommand = new AsyncRelayCommand(CheckOutAsync, CanCheckOut);
        CorrectOpenShiftCommand = new AsyncRelayCommand(CorrectOpenShiftAsync, CanCorrectOpenShift);
        ToggleCorrectionPanelCommand = new RelayCommand(
            ToggleCorrectionPanel,
            () => IsManagerMode && !IsBusy);
        CloseCorrectionPanelCommand = new RelayCommand(() => IsCorrectionPanelOpen = false);
        PreviousWorkerPageCommand = new RelayCommand(
            PreviousWorkerPage,
            () => currentWorkerPage > 0);
        NextWorkerPageCommand = new RelayCommand(
            NextWorkerPage,
            () => (currentWorkerPage + 1) * WorkerPageSize < filteredWorkerCount);
        RefreshCommand = new AsyncRelayCommand(RefreshAsync, () => !IsBusy);
    }

    public ObservableCollection<AttendanceWorkerStatus> Workers { get; } = [];
    public ObservableCollection<AttendanceWorkerStatus> VisibleWorkers { get; } = [];

    public AttendanceWorkerStatus? SelectedWorker
    {
        get => selectedWorker;
        set
        {
            Guid? previousWorkerId = selectedWorker?.Id;
            if (!SetProperty(ref selectedWorker, value)) return;
            if (previousWorkerId != value?.Id)
            {
                CorrectionReason = string.Empty;
                PrepareCorrectionMoment(value);
            }
            OnPropertyChanged(nameof(SelectedWorkerSummary));
            OnPropertyChanged(nameof(CorrectionValidationMessage));
            NotifyCommands();
        }
    }

    public string Status
    {
        get => status;
        private set => SetProperty(ref status, value);
    }

    public string CorrectionReason
    {
        get => correctionReason;
        set
        {
            if (!SetProperty(ref correctionReason, value)) return;
            NotifyCorrectionState();
        }
    }

    public DateTime? CorrectionDate
    {
        get => correctionDate;
        set
        {
            if (!SetProperty(ref correctionDate, value)) return;
            NotifyCorrectionState();
        }
    }

    public string CorrectionTime
    {
        get => correctionTime;
        set
        {
            if (!SetProperty(ref correctionTime, value)) return;
            NotifyCorrectionState();
        }
    }

    public string CorrectionValidationMessage => CorrectionMessage();

    public string WorkerSearchText
    {
        get => workerSearchText;
        set
        {
            if (!SetProperty(ref workerSearchText, value ?? string.Empty)) return;
            currentWorkerPage = 0;
            ApplyWorkerFilter();
        }
    }

    public bool IsCorrectionPanelOpen
    {
        get => isCorrectionPanelOpen;
        set => SetProperty(ref isCorrectionPanelOpen, value);
    }

    public bool IsBusy
    {
        get => isBusy;
        private set
        {
            if (!SetProperty(ref isBusy, value)) return;
            RefreshCommand.NotifyCanExecuteChanged();
            ToggleCorrectionPanelCommand.NotifyCanExecuteChanged();
            NotifyCommands();
        }
    }

    public int PresentCount
    {
        get => presentCount;
        private set => SetProperty(ref presentCount, value);
    }

    public int OpenShiftCount
    {
        get => openShiftCount;
        private set => SetProperty(ref openShiftCount, value);
    }

    public int IncidentCount
    {
        get => incidentCount;
        private set => SetProperty(ref incidentCount, value);
    }

    public string ResponsibilityWarning
    {
        get => responsibilityWarning;
        private set
        {
            if (!SetProperty(ref responsibilityWarning, value)) return;
            OnPropertyChanged(nameof(HasResponsibilityWarning));
        }
    }

    public string ResponsibilityWarningKey
    {
        get => responsibilityWarningKey;
        private set => SetProperty(ref responsibilityWarningKey, value);
    }

    public bool HasResponsibilityWarning => !string.IsNullOrWhiteSpace(ResponsibilityWarning);

    public string SelectedWorkerSummary => SelectedWorker is null
        ? "Seleccione su nombre antes de registrar una marca."
        : $"{SelectedWorker.DisplayName} · {SelectedWorker.State} · {SelectedWorker.LastMark}";

    public string WorkerPageDescription => filteredWorkerCount == 0
        ? "Sin resultados"
        : $"{currentWorkerPage * WorkerPageSize + 1}–{Math.Min((currentWorkerPage + 1) * WorkerPageSize, filteredWorkerCount)} de {filteredWorkerCount}";

    public bool IsManagerMode => managerMode?.IsActive == true;

    public IAsyncRelayCommand CheckInCommand { get; }
    public IAsyncRelayCommand CheckOutCommand { get; }
    public IAsyncRelayCommand CorrectOpenShiftCommand { get; }
    public IRelayCommand ToggleCorrectionPanelCommand { get; }
    public IRelayCommand CloseCorrectionPanelCommand { get; }
    public IRelayCommand PreviousWorkerPageCommand { get; }
    public IRelayCommand NextWorkerPageCommand { get; }
    public IAsyncRelayCommand RefreshCommand { get; }

    public Task InitializeAsync() => RefreshAsync();

    public void RefreshManagerMode()
    {
        if (!IsManagerMode) IsCorrectionPanelOpen = false;
        OnPropertyChanged(nameof(IsManagerMode));
        ToggleCorrectionPanelCommand.NotifyCanExecuteChanged();
        NotifyCorrectionState();
    }

    private async Task RefreshAsync()
    {
        if (attendance is null || catalogs is null || stationStore is null)
        {
            Status = "El registro local de asistencia no está configurado.";
            return;
        }

        await RunAsync(async () =>
        {
            station = await stationStore.LoadAsync().ConfigureAwait(true);
            if (station is null || station.IsClosed)
            {
                Workers.Clear();
                VisibleWorkers.Clear();
                SelectedWorker = null;
                PresentCount = 0;
                OpenShiftCount = 0;
                IncidentCount = 0;
                ClearResponsibilityWarning();
                Status = "Abra la estación para consultar y registrar asistencia.";
                return;
            }

            Guid? selectedId = SelectedWorker?.Id;
            IReadOnlyList<CachedWorker> activeWorkers = await catalogs
                .ListActiveWorkersAsync(station.Session.OrganizationId)
                .ConfigureAwait(true);
            var statuses = new List<AttendanceWorkerStatus>(activeWorkers.Count);
            int totalIncidents = 0;
            foreach (CachedWorker worker in activeWorkers.OrderBy(item => item.Name))
            {
                IReadOnlyList<AttendanceEvent> events = await attendance
                    .ListForWorkerAsync(station.Session.OrganizationId, worker.Id)
                    .ConfigureAwait(true);
                AttendanceProjection projection = AttendanceProjectionService.Project(
                    events,
                    timeProvider.GetUtcNow());
                AttendanceShift? open = projection.Shifts.LastOrDefault(
                    shift => shift.Status == AttendanceShiftStatus.Open);
                AttendanceEvent? latest = events
                    .OrderByDescending(item => item.OccurredAt)
                    .ThenByDescending(item => item.ClientSequence)
                    .FirstOrDefault();
                totalIncidents += projection.Incidents.Count;
                statuses.Add(new AttendanceWorkerStatus(
                    worker,
                    open is not null,
                    open is null ? "Fuera de planta" : "En planta",
                    latest is null
                        ? "Sin marcas"
                        : $"Última marca {Describe(latest.Type)} · {latest.OccurredAt.ToLocalTime():dd/MM HH:mm}",
                    projection.Incidents.Count,
                    open?.CheckIn.ClientEventId,
                    open?.CheckIn.OccurredAt));
            }

            Workers.Clear();
            foreach (AttendanceWorkerStatus worker in statuses) Workers.Add(worker);
            ApplyWorkerFilter();
            SelectedWorker = selectedId.HasValue
                ? Workers.FirstOrDefault(item => item.Id == selectedId.Value)
                : null;
            PresentCount = Workers.Count(item => item.IsPresent);
            OpenShiftCount = PresentCount;
            IncidentCount = totalIncidents;
            await RefreshResponsibilityWarningAsync().ConfigureAwait(true);
            OnPropertyChanged(nameof(IsManagerMode));
            Status = Workers.Count == 0
                ? "No hay trabajadores activos disponibles en el catálogo local."
                : "Asistencia local disponible. Seleccione su nombre para registrar la marca.";
        }).ConfigureAwait(true);
    }

    private Task CheckInAsync() => RecordOrdinaryAsync(AttendanceEventType.CheckIn, "Entrada registrada");

    private Task CheckOutAsync() => RecordOrdinaryAsync(AttendanceEventType.CheckOut, "Salida registrada");

    private async Task RecordOrdinaryAsync(AttendanceEventType type, string success)
    {
        if (attendance is null || station is null || SelectedWorker is null) return;
        Guid workerId = SelectedWorker.Id;
        string workerName = SelectedWorker.Name;
        await RunAsync(async () =>
        {
            DateTimeOffset now = timeProvider.GetUtcNow();
            await attendance.RecordAsync(new RecordLocalAttendanceMutation(
                Guid.NewGuid(),
                station.Session.OrganizationId,
                station.Authorization.PlantId,
                station.Authorization.StationId,
                workerId,
                type,
                now,
                now)).ConfigureAwait(true);
            string message = $"{success} para {workerName}. Guardada en este equipo.";
            await RefreshCoreAsync(workerId).ConfigureAwait(true);
            Status = message;
        }).ConfigureAwait(true);
    }

    private async Task CorrectOpenShiftAsync()
    {
        if (attendance is null || station is null || SelectedWorker?.OpenCheckInId is not Guid relatedId)
            return;
        Guid workerId = SelectedWorker.Id;
        string workerName = SelectedWorker.Name;
        string reason = CorrectionReason.Trim();
        if (!TryGetCorrectionMoment(out DateTimeOffset occurredAt, out string validationMessage))
        {
            Status = validationMessage;
            return;
        }

        await RunAsync(async () =>
        {
            DateTimeOffset now = timeProvider.GetUtcNow();
            await attendance.RecordAsync(new RecordLocalAttendanceMutation(
                Guid.NewGuid(),
                station.Session.OrganizationId,
                station.Authorization.PlantId,
                station.Authorization.StationId,
                workerId,
                AttendanceEventType.AdjustedCheckOut,
                occurredAt,
                now,
                station.Session.ProfileId,
                reason,
                relatedId,
                AuthorizationFrom(station))).ConfigureAwait(true);
            CorrectionReason = string.Empty;
            await RefreshCoreAsync(workerId).ConfigureAwait(true);
            IsCorrectionPanelOpen = false;
            DateTimeOffset localExit = TimeZoneInfo.ConvertTime(occurredAt, CostaRicaTimeZone);
            Status = $"Jornada de {workerName} cerrada a las {localExit:dd/MM/yyyy HH:mm} mediante corrección auditada.";
        }).ConfigureAwait(true);
    }

    private async Task RefreshCoreAsync(Guid? selectedId)
    {
        if (attendance is null || catalogs is null || stationStore is null) return;
        station = await stationStore.LoadAsync().ConfigureAwait(true);
        if (station is null || station.IsClosed) return;
        IReadOnlyList<CachedWorker> activeWorkers = await catalogs
            .ListActiveWorkersAsync(station.Session.OrganizationId)
            .ConfigureAwait(true);
        var statuses = new List<AttendanceWorkerStatus>(activeWorkers.Count);
        int totalIncidents = 0;
        foreach (CachedWorker worker in activeWorkers.OrderBy(item => item.Name))
        {
            IReadOnlyList<AttendanceEvent> events = await attendance
                .ListForWorkerAsync(station.Session.OrganizationId, worker.Id)
                .ConfigureAwait(true);
            AttendanceProjection projection = AttendanceProjectionService.Project(events, timeProvider.GetUtcNow());
            AttendanceShift? open = projection.Shifts.LastOrDefault(
                shift => shift.Status == AttendanceShiftStatus.Open);
            AttendanceEvent? latest = events
                .OrderByDescending(item => item.OccurredAt)
                .ThenByDescending(item => item.ClientSequence)
                .FirstOrDefault();
            totalIncidents += projection.Incidents.Count;
            statuses.Add(new AttendanceWorkerStatus(
                worker,
                open is not null,
                open is null ? "Fuera de planta" : "En planta",
                latest is null
                    ? "Sin marcas"
                    : $"Última marca {Describe(latest.Type)} · {latest.OccurredAt.ToLocalTime():dd/MM HH:mm}",
                projection.Incidents.Count,
                open?.CheckIn.ClientEventId,
                open?.CheckIn.OccurredAt));
        }

        Workers.Clear();
        foreach (AttendanceWorkerStatus worker in statuses) Workers.Add(worker);
        ApplyWorkerFilter();
        SelectedWorker = selectedId.HasValue
            ? Workers.FirstOrDefault(item => item.Id == selectedId.Value)
            : null;
        PresentCount = Workers.Count(item => item.IsPresent);
        OpenShiftCount = PresentCount;
        IncidentCount = totalIncidents;
        await RefreshResponsibilityWarningAsync().ConfigureAwait(true);
        OnPropertyChanged(nameof(IsManagerMode));
    }

    private async Task RefreshResponsibilityWarningAsync()
    {
        if (operationDashboard is null || station is null)
        {
            ClearResponsibilityWarning();
            return;
        }

        try
        {
            HashSet<Guid> presentWorkerIds = Workers
                .Where(worker => worker.IsPresent)
                .Select(worker => worker.Id)
                .ToHashSet();
            LocalOperationDashboardSnapshot[] absentResponsibilities = (await operationDashboard
                    .ListAsync(station.Authorization.StationId)
                    .ConfigureAwait(true))
                .Where(snapshot => snapshot.IsReady &&
                    snapshot.Session is not null &&
                    !presentWorkerIds.Contains(snapshot.Session.ResponsibleWorkerId))
                .OrderBy(snapshot => snapshot.LineName)
                .ToArray();

            if (absentResponsibilities.Length == 0)
            {
                ClearResponsibilityWarning();
                return;
            }

            ResponsibilityWarningKey = string.Join(
                '|',
                absentResponsibilities.Select(snapshot =>
                    $"{snapshot.LineId:D}:{snapshot.Session!.ResponsibleWorkerId:D}"));
            ResponsibilityWarning = absentResponsibilities.Length == 1
                ? $"Atención: {absentResponsibilities[0].ResponsibleName ?? "El responsable"} " +
                  $"está fuera de planta y continúa asignado a {absentResponsibilities[0].LineName}."
                : $"Atención: {absentResponsibilities.Length} líneas activas tienen responsables fuera de planta.";
        }
        catch (Exception exception) when (exception is IOException or SqliteException or InvalidOperationException)
        {
            // Una lectura secundaria del tablero no debe impedir registrar la asistencia.
            ClearResponsibilityWarning();
        }
    }

    private void ClearResponsibilityWarning()
    {
        ResponsibilityWarningKey = string.Empty;
        ResponsibilityWarning = string.Empty;
    }

    private bool CanCheckIn() =>
        !IsBusy && station is not null && SelectedWorker is { IsPresent: false };

    private bool CanCheckOut() =>
        !IsBusy && station is not null && SelectedWorker is { IsPresent: true };

    private bool CanCorrectOpenShift() =>
        !IsBusy && TryGetCorrectionMoment(out _, out _);

    private async Task RunAsync(Func<Task> action)
    {
        if (IsBusy) return;
        IsBusy = true;
        try
        {
            await action().ConfigureAwait(true);
        }
        catch (Exception exception) when (
            exception is IOException or SqliteException or InvalidOperationException or ArgumentException)
        {
            Status = $"No se pudo registrar la asistencia: {exception.Message}";
        }
        finally
        {
            IsBusy = false;
        }
    }

    private void NotifyCommands()
    {
        CheckInCommand.NotifyCanExecuteChanged();
        CheckOutCommand.NotifyCanExecuteChanged();
        CorrectOpenShiftCommand.NotifyCanExecuteChanged();
    }

    private void NotifyCorrectionState()
    {
        OnPropertyChanged(nameof(CorrectionValidationMessage));
        CorrectOpenShiftCommand.NotifyCanExecuteChanged();
    }

    private void ToggleCorrectionPanel() => IsCorrectionPanelOpen = !IsCorrectionPanelOpen;

    private void PreviousWorkerPage()
    {
        if (currentWorkerPage == 0) return;
        currentWorkerPage--;
        ApplyWorkerFilter();
    }

    private void NextWorkerPage()
    {
        if ((currentWorkerPage + 1) * WorkerPageSize >= filteredWorkerCount) return;
        currentWorkerPage++;
        ApplyWorkerFilter();
    }

    private void ApplyWorkerFilter()
    {
        string search = WorkerSearchText.Trim();
        AttendanceWorkerStatus[] filtered = Workers
            .Where(worker => string.IsNullOrEmpty(search) ||
                worker.DisplayName.Contains(search, StringComparison.CurrentCultureIgnoreCase) ||
                worker.CategoryLabel.Contains(search, StringComparison.CurrentCultureIgnoreCase) ||
                worker.State.Contains(search, StringComparison.CurrentCultureIgnoreCase))
            .ToArray();
        filteredWorkerCount = filtered.Length;
        int lastPage = filteredWorkerCount == 0
            ? 0
            : (filteredWorkerCount - 1) / WorkerPageSize;
        currentWorkerPage = Math.Min(currentWorkerPage, lastPage);

        VisibleWorkers.Clear();
        foreach (AttendanceWorkerStatus worker in filtered
                     .Skip(currentWorkerPage * WorkerPageSize)
                     .Take(WorkerPageSize))
        {
            VisibleWorkers.Add(worker);
        }

        OnPropertyChanged(nameof(WorkerPageDescription));
        PreviousWorkerPageCommand.NotifyCanExecuteChanged();
        NextWorkerPageCommand.NotifyCanExecuteChanged();
    }

    private void PrepareCorrectionMoment(AttendanceWorkerStatus? worker)
    {
        if (worker?.OpenCheckInId is null)
        {
            CorrectionDate = null;
            CorrectionTime = string.Empty;
            return;
        }

        DateTimeOffset localNow = TimeZoneInfo.ConvertTime(timeProvider.GetUtcNow(), CostaRicaTimeZone);
        CorrectionDate = localNow.Date;
        CorrectionTime = localNow.ToString("HH:mm", CultureInfo.InvariantCulture);
    }

    private bool TryGetCorrectionMoment(
        out DateTimeOffset occurredAt,
        out string validationMessage)
    {
        occurredAt = default;
        if (!IsManagerMode)
        {
            validationMessage = "Eleve temporalmente el Modo Jefe de Planta para completar una salida olvidada.";
            return false;
        }

        if (SelectedWorker?.OpenCheckInId is null || SelectedWorker.OpenCheckInAt is null)
        {
            validationMessage = "Seleccione una persona con una jornada abierta.";
            return false;
        }

        if (CorrectionDate is null)
        {
            validationMessage = "Indique la fecha real de salida.";
            return false;
        }

        if (!TimeSpan.TryParseExact(
                CorrectionTime?.Trim(),
                ["h\\:mm", "hh\\:mm"],
                CultureInfo.InvariantCulture,
                out TimeSpan timeOfDay) ||
            timeOfDay < TimeSpan.Zero ||
            timeOfDay >= TimeSpan.FromDays(1))
        {
            validationMessage = "Indique la hora real de salida en formato de 24 horas, por ejemplo 17:00.";
            return false;
        }

        DateTime localDateTime = DateTime.SpecifyKind(
            CorrectionDate.Value.Date.Add(timeOfDay),
            DateTimeKind.Unspecified);
        occurredAt = new DateTimeOffset(
            localDateTime,
            CostaRicaTimeZone.GetUtcOffset(localDateTime)).ToUniversalTime();
        if (occurredAt <= SelectedWorker.OpenCheckInAt.Value)
        {
            validationMessage = "La salida real debe ser posterior a la entrada de la jornada.";
            return false;
        }

        if (occurredAt > timeProvider.GetUtcNow())
        {
            validationMessage = "La salida real no puede estar en el futuro.";
            return false;
        }

        if (string.IsNullOrWhiteSpace(CorrectionReason))
        {
            validationMessage = "Explique por qué se registra manualmente esta salida.";
            return false;
        }

        validationMessage = "La salida se agregará una sola vez y quedará disponible en la auditoría de gerencia.";
        return true;
    }

    private string CorrectionMessage()
    {
        _ = TryGetCorrectionMoment(out _, out string message);
        return message;
    }

    private static string Describe(AttendanceEventType type) => type switch
    {
        AttendanceEventType.CheckIn => "entrada",
        AttendanceEventType.CheckOut => "salida",
        AttendanceEventType.AdjustedCheckIn => "entrada corregida",
        AttendanceEventType.AdjustedCheckOut => "salida corregida",
        _ => "registrada",
    };

    private static OutboxAuthorizationEvidence AuthorizationFrom(ProtectedStationState state) =>
        new(
            state.Session.ProfileId,
            state.Authorization.PermissionVersion,
            state.Authorization.ValidatedAt,
            state.Authorization.OfflineValidUntil,
            "VALID");
}
