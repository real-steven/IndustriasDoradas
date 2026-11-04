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
    DateTimeOffset? OpenCheckInAt,
    Guid? LatestEventId = null,
    AttendanceEventType? LatestEventType = null,
    DateTimeOffset? LatestEventAt = null)
{
    public Guid Id => Worker.Id;
    public string Name => Worker.Name;
    public string CategoryLabel => Worker.Category == "JEFE_PLANTA" ? "Jefe de planta" : "Operario";
    public string DisplayName => Worker.DisplayName;
    public string StateColor => IsPresent ? "#178449" : "#71808A";
}

public sealed record AttendanceCorrectionDayOption(string Name, DateTime Date);
public sealed record AttendanceTimeOption(int Value, string Label);

public enum AttendancePresenceFilter
{
    All,
    InPlant,
    OutOfPlant,
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
    private int? correctionHour;
    private int? correctionMinute;
    private string correctionMeridiem = "a. m.";
    private string workerSearchText = string.Empty;
    private AttendancePresenceFilter presenceFilter;
    private bool isBusy;
    private bool isCorrectionPanelOpen;
    private int presentCount;
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
        ToggleCorrectionMeridiemCommand = new RelayCommand(ToggleCorrectionMeridiem);
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
        ShowAllWorkersCommand = new RelayCommand(() => PresenceFilter = AttendancePresenceFilter.All);
        ShowWorkersInPlantCommand = new RelayCommand(() => PresenceFilter = AttendancePresenceFilter.InPlant);
        ShowWorkersOutOfPlantCommand = new RelayCommand(() => PresenceFilter = AttendancePresenceFilter.OutOfPlant);
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
            OnPropertyChanged(nameof(CorrectionActionLabel));
            OnPropertyChanged(nameof(CorrectionTitle));
            OnPropertyChanged(nameof(CorrectionDateLabel));
            OnPropertyChanged(nameof(CorrectionSubmitLabel));
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
            string normalized = new((value ?? string.Empty)
                .Where(character => char.IsAsciiDigit(character) || character == ':')
                .Take(5)
                .ToArray());
            if (!SetProperty(ref correctionTime, normalized)) return;
            NotifyCorrectionState();
        }
    }

    public IReadOnlyList<AttendanceTimeOption> CorrectionHourOptions { get; } =
        Enumerable.Range(1, 12).Select(value => new AttendanceTimeOption(
            value,
            value.ToString("00", CultureInfo.InvariantCulture))).ToArray();
    public IReadOnlyList<AttendanceTimeOption> CorrectionMinuteOptions { get; } =
        Enumerable.Range(0, 60).Select(value => new AttendanceTimeOption(
            value,
            value.ToString("00", CultureInfo.InvariantCulture))).ToArray();
    public int? CorrectionHour
    {
        get => correctionHour;
        set
        {
            if (!SetProperty(ref correctionHour, value)) return;
            UpdateCorrectionTimeFromSelectors();
        }
    }

    public int? CorrectionMinute
    {
        get => correctionMinute;
        set
        {
            if (!SetProperty(ref correctionMinute, value)) return;
            UpdateCorrectionTimeFromSelectors();
        }
    }

    public string CorrectionMeridiem
    {
        get => correctionMeridiem;
        set
        {
            string normalized = value == "p. m." ? "p. m." : "a. m.";
            if (!SetProperty(ref correctionMeridiem, normalized)) return;
            UpdateCorrectionTimeFromSelectors();
        }
    }

    public IReadOnlyList<AttendanceCorrectionDayOption> CorrectionDayOptions
    {
        get
        {
            DateTime today = TimeZoneInfo.ConvertTime(timeProvider.GetUtcNow(), CostaRicaTimeZone).Date;
            return [new("Hoy", today), new("Ayer", today.AddDays(-1))];
        }
    }

    public string CorrectionActionLabel => SelectedWorker?.IsPresent == true
        ? "⚙  CORREGIR SALIDA"
        : "⚙  CORREGIR ENTRADA";
    public string CorrectionTitle => SelectedWorker?.IsPresent == true
        ? "Corregir salida olvidada"
        : "Corregir entrada olvidada";
    public string CorrectionDateLabel => SelectedWorker?.IsPresent == true
        ? "DÍA REAL DE SALIDA"
        : "DÍA REAL DE ENTRADA";
    public string CorrectionSubmitLabel => SelectedWorker?.IsPresent == true
        ? "CERRAR JORNADA CON CORRECCIÓN"
        : "ABRIR JORNADA CON CORRECCIÓN";

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

    public AttendancePresenceFilter PresenceFilter
    {
        get => presenceFilter;
        set
        {
            if (!SetProperty(ref presenceFilter, value)) return;
            currentWorkerPage = 0;
            OnPropertyChanged(nameof(IsShowingAllWorkers));
            OnPropertyChanged(nameof(IsShowingWorkersInPlant));
            OnPropertyChanged(nameof(IsShowingWorkersOutOfPlant));
            ApplyWorkerFilter();
        }
    }
    public bool IsShowingAllWorkers => PresenceFilter == AttendancePresenceFilter.All;
    public bool IsShowingWorkersInPlant => PresenceFilter == AttendancePresenceFilter.InPlant;
    public bool IsShowingWorkersOutOfPlant => PresenceFilter == AttendancePresenceFilter.OutOfPlant;

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
    public IRelayCommand ToggleCorrectionMeridiemCommand { get; }
    public IRelayCommand ToggleCorrectionPanelCommand { get; }
    public IRelayCommand CloseCorrectionPanelCommand { get; }
    public IRelayCommand PreviousWorkerPageCommand { get; }
    public IRelayCommand NextWorkerPageCommand { get; }
    public IRelayCommand ShowAllWorkersCommand { get; }
    public IRelayCommand ShowWorkersInPlantCommand { get; }
    public IRelayCommand ShowWorkersOutOfPlantCommand { get; }
    public IAsyncRelayCommand RefreshCommand { get; }

    public Task InitializeAsync() => RefreshAsync();

    public async Task RefreshAfterSynchronizationAsync()
    {
        if (IsBusy) return;
        await RefreshAsync().ConfigureAwait(true);
        if (station is not null && !station.IsClosed && Workers.Count > 0)
        {
            Status = "Asistencia actualizada con los datos centrales.";
        }
    }

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
                    open?.CheckIn.OccurredAt,
                    latest?.ClientEventId,
                    latest?.Type,
                    latest?.OccurredAt));
            }

            Workers.Clear();
            foreach (AttendanceWorkerStatus worker in statuses) Workers.Add(worker);
            ApplyWorkerFilter();
            SelectedWorker = selectedId.HasValue
                ? Workers.FirstOrDefault(item => item.Id == selectedId.Value)
                : null;
            PresentCount = Workers.Count(item => item.IsPresent);
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
                now,
                Authorization: AuthorizationFrom(station, now))).ConfigureAwait(true);
            string message = $"{success} para {workerName}. Guardada en este equipo.";
            await RefreshCoreAsync(workerId).ConfigureAwait(true);
            Status = message;
        }).ConfigureAwait(true);
    }

    private async Task CorrectOpenShiftAsync()
    {
        if (attendance is null || station is null || SelectedWorker is null)
            return;
        Guid workerId = SelectedWorker.Id;
        string workerName = SelectedWorker.Name;
        bool isCorrectingExit = SelectedWorker.IsPresent;
        Guid? relatedId = isCorrectingExit
            ? SelectedWorker.OpenCheckInId
            : SelectedWorker.LatestEventId;
        if (relatedId is null) return;
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
                isCorrectingExit
                    ? AttendanceEventType.AdjustedCheckOut
                    : AttendanceEventType.AdjustedCheckIn,
                occurredAt,
                now,
                station.Session.ProfileId,
                reason,
                relatedId.Value,
                AuthorizationFrom(station, now))).ConfigureAwait(true);
            CorrectionReason = string.Empty;
            await RefreshCoreAsync(workerId).ConfigureAwait(true);
            IsCorrectionPanelOpen = false;
            DateTimeOffset localMoment = TimeZoneInfo.ConvertTime(occurredAt, CostaRicaTimeZone);
            Status = isCorrectingExit
                ? $"Jornada de {workerName} cerrada a las {localMoment:dd/MM/yyyy HH:mm} mediante corrección auditada."
                : $"Jornada de {workerName} abierta a las {localMoment:dd/MM/yyyy HH:mm} mediante corrección auditada.";
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
                    open?.CheckIn.OccurredAt,
                    latest?.ClientEventId,
                    latest?.Type,
                    latest?.OccurredAt));
        }

        Workers.Clear();
        foreach (AttendanceWorkerStatus worker in statuses) Workers.Add(worker);
        ApplyWorkerFilter();
        SelectedWorker = selectedId.HasValue
            ? Workers.FirstOrDefault(item => item.Id == selectedId.Value)
            : null;
        PresentCount = Workers.Count(item => item.IsPresent);
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
            .Where(worker => PresenceFilter switch
            {
                AttendancePresenceFilter.InPlant => worker.IsPresent,
                AttendancePresenceFilter.OutOfPlant => !worker.IsPresent,
                _ => true,
            })
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
        if (worker is null)
        {
            CorrectionDate = null;
            CorrectionHour = null;
            CorrectionMinute = null;
            return;
        }

        DateTimeOffset localNow = TimeZoneInfo.ConvertTime(timeProvider.GetUtcNow(), CostaRicaTimeZone);
        CorrectionDate = localNow.Date;
        CorrectionHour = localNow.Hour % 12 == 0 ? 12 : localNow.Hour % 12;
        CorrectionMinute = localNow.Minute;
        CorrectionMeridiem = localNow.Hour >= 12 ? "p. m." : "a. m.";
    }

    private void UpdateCorrectionTimeFromSelectors()
    {
        if (CorrectionHour is not int hour || CorrectionMinute is not int minute)
        {
            CorrectionTime = string.Empty;
            return;
        }

        int hour24 = hour % 12;
        if (CorrectionMeridiem == "p. m.") hour24 += 12;
        CorrectionTime = $"{hour24:00}:{minute:00}";
    }

    private void ToggleCorrectionMeridiem() =>
        CorrectionMeridiem = CorrectionMeridiem == "p. m." ? "a. m." : "p. m.";

    private bool TryGetCorrectionMoment(
        out DateTimeOffset occurredAt,
        out string validationMessage)
    {
        occurredAt = default;
        if (!IsManagerMode)
        {
            validationMessage = "Eleve temporalmente el Modo Jefe de Planta para registrar esta corrección.";
            return false;
        }

        if (SelectedWorker is null)
        {
            validationMessage = "Seleccione una persona para corregir su asistencia.";
            return false;
        }

        bool isCorrectingExit = SelectedWorker.IsPresent;
        if (isCorrectingExit &&
            (SelectedWorker.OpenCheckInId is null || SelectedWorker.OpenCheckInAt is null))
        {
            validationMessage = "No se encontró la entrada que debe cerrar esta salida.";
            return false;
        }
        if (!isCorrectingExit &&
            (SelectedWorker.LatestEventId is null ||
             SelectedWorker.LatestEventAt is null ||
             SelectedWorker.LatestEventType is not (AttendanceEventType.CheckOut or AttendanceEventType.AdjustedCheckOut)))
        {
            validationMessage = "No existe una salida anterior que permita relacionar la entrada olvidada. Registre una entrada normal.";
            return false;
        }

        if (CorrectionDate is null)
        {
            validationMessage = isCorrectingExit
                ? "Seleccione si la salida real fue hoy o ayer."
                : "Seleccione si la entrada real fue hoy o ayer.";
            return false;
        }

        DateTime today = TimeZoneInfo.ConvertTime(timeProvider.GetUtcNow(), CostaRicaTimeZone).Date;
        if (CorrectionDate.Value.Date != today && CorrectionDate.Value.Date != today.AddDays(-1))
        {
            validationMessage = "La corrección solo puede registrarse para hoy o ayer.";
            return false;
        }

        if (!TimeSpan.TryParseExact(
                CorrectionTime?.Trim(),
                "hh\\:mm",
                CultureInfo.InvariantCulture,
                out TimeSpan timeOfDay) ||
            timeOfDay < TimeSpan.Zero ||
            timeOfDay >= TimeSpan.FromDays(1))
        {
            validationMessage = "Indique una hora válida en formato HH:mm, por ejemplo 07:05 o 17:00.";
            return false;
        }

        DateTime localDateTime = DateTime.SpecifyKind(
            CorrectionDate.Value.Date.Add(timeOfDay),
            DateTimeKind.Unspecified);
        occurredAt = new DateTimeOffset(
            localDateTime,
            CostaRicaTimeZone.GetUtcOffset(localDateTime)).ToUniversalTime();
        DateTimeOffset relatedMoment = isCorrectingExit
            ? SelectedWorker.OpenCheckInAt!.Value
            : SelectedWorker.LatestEventAt!.Value;
        if (occurredAt <= relatedMoment)
        {
            validationMessage = isCorrectingExit
                ? "La salida real debe ser posterior a la entrada de la jornada."
                : "La entrada real debe ser posterior a la última salida registrada.";
            return false;
        }

        if (occurredAt > timeProvider.GetUtcNow())
        {
            validationMessage = "La salida real no puede estar en el futuro.";
            return false;
        }

        if (string.IsNullOrWhiteSpace(CorrectionReason))
        {
            validationMessage = isCorrectingExit
                ? "Explique por qué se registra manualmente esta salida."
                : "Explique por qué se registra manualmente esta entrada.";
            return false;
        }

        validationMessage = isCorrectingExit
            ? "La salida se agregará una sola vez y quedará disponible en la auditoría de gerencia."
            : "La entrada se agregará una sola vez y quedará disponible en la auditoría de gerencia.";
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

    private static OutboxAuthorizationEvidence AuthorizationFrom(
        ProtectedStationState state,
        DateTimeOffset recordedAt) => OutboxAuthorizationCapture.From(state, recordedAt);
}
