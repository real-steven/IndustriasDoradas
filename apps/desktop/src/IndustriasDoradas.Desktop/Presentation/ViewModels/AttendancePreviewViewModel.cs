using System.Collections.ObjectModel;
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
    Guid? OpenCheckInId)
{
    public Guid Id => Worker.Id;
    public string Name => Worker.Name;
    public string StateColor => IsPresent ? "#178449" : "#71808A";
}

public sealed class AttendancePreviewViewModel : ObservableObject
{
    private readonly ILocalAttendanceRepository? attendance;
    private readonly ILocalCatalogRepository? catalogs;
    private readonly IProtectedStationStore? stationStore;
    private readonly TimeProvider timeProvider;
    private readonly IPlantManagerModeAccessor? managerMode;
    private ProtectedStationState? station;
    private AttendanceWorkerStatus? selectedWorker;
    private string status = "Cargando el registro local de asistencia…";
    private string correctionReason = string.Empty;
    private bool isBusy;
    private int presentCount;
    private int openShiftCount;
    private int incidentCount;

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
        IPlantManagerModeAccessor? managerMode)
    {
        this.attendance = attendance;
        this.catalogs = catalogs;
        this.stationStore = stationStore;
        this.timeProvider = timeProvider;
        this.managerMode = managerMode;
        CheckInCommand = new AsyncRelayCommand(CheckInAsync, CanCheckIn);
        CheckOutCommand = new AsyncRelayCommand(CheckOutAsync, CanCheckOut);
        CorrectOpenShiftCommand = new AsyncRelayCommand(CorrectOpenShiftAsync, CanCorrectOpenShift);
        RefreshCommand = new AsyncRelayCommand(RefreshAsync, () => !IsBusy);
    }

    public ObservableCollection<AttendanceWorkerStatus> Workers { get; } = [];

    public AttendanceWorkerStatus? SelectedWorker
    {
        get => selectedWorker;
        set
        {
            if (!SetProperty(ref selectedWorker, value)) return;
            OnPropertyChanged(nameof(SelectedWorkerSummary));
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
            CorrectOpenShiftCommand.NotifyCanExecuteChanged();
        }
    }

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

    public string SelectedWorkerSummary => SelectedWorker is null
        ? "Seleccione su nombre antes de registrar una marca."
        : $"{SelectedWorker.Name} · {SelectedWorker.State} · {SelectedWorker.LastMark}";

    public bool IsManagerMode => managerMode?.IsActive == true;

    public IAsyncRelayCommand CheckInCommand { get; }
    public IAsyncRelayCommand CheckOutCommand { get; }
    public IAsyncRelayCommand CorrectOpenShiftCommand { get; }
    public IAsyncRelayCommand RefreshCommand { get; }

    public Task InitializeAsync() => RefreshAsync();

    public void RefreshManagerMode()
    {
        OnPropertyChanged(nameof(IsManagerMode));
        CorrectOpenShiftCommand.NotifyCanExecuteChanged();
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
                SelectedWorker = null;
                PresentCount = 0;
                OpenShiftCount = 0;
                IncidentCount = 0;
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
                    open?.CheckIn.ClientEventId));
            }

            Workers.Clear();
            foreach (AttendanceWorkerStatus worker in statuses) Workers.Add(worker);
            SelectedWorker = selectedId.HasValue
                ? Workers.FirstOrDefault(item => item.Id == selectedId.Value)
                : null;
            PresentCount = Workers.Count(item => item.IsPresent);
            OpenShiftCount = PresentCount;
            IncidentCount = totalIncidents;
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
                now,
                now,
                station.Session.ProfileId,
                reason,
                relatedId,
                AuthorizationFrom(station))).ConfigureAwait(true);
            CorrectionReason = string.Empty;
            await RefreshCoreAsync(workerId).ConfigureAwait(true);
            Status = $"Jornada de {workerName} cerrada mediante corrección auditada.";
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
                open?.CheckIn.ClientEventId));
        }

        Workers.Clear();
        foreach (AttendanceWorkerStatus worker in statuses) Workers.Add(worker);
        SelectedWorker = selectedId.HasValue
            ? Workers.FirstOrDefault(item => item.Id == selectedId.Value)
            : null;
        PresentCount = Workers.Count(item => item.IsPresent);
        OpenShiftCount = PresentCount;
        IncidentCount = totalIncidents;
        OnPropertyChanged(nameof(IsManagerMode));
    }

    private bool CanCheckIn() =>
        !IsBusy && station is not null && SelectedWorker is { IsPresent: false };

    private bool CanCheckOut() =>
        !IsBusy && station is not null && SelectedWorker is { IsPresent: true };

    private bool CanCorrectOpenShift() =>
        !IsBusy && IsManagerMode && SelectedWorker?.OpenCheckInId is not null &&
        !string.IsNullOrWhiteSpace(CorrectionReason);

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
