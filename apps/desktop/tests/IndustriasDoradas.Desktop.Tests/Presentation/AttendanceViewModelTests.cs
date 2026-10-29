using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain;
using IndustriasDoradas.Desktop.Domain.Attendance;
using IndustriasDoradas.Desktop.Domain.Production;
using IndustriasDoradas.Desktop.Presentation.ViewModels;

namespace IndustriasDoradas.Desktop.Tests.Presentation;

[TestClass]
public sealed class AttendanceViewModelTests
{
    private static readonly Guid OrganizationId = Guid.Parse("30000000-0000-4000-8000-000000000001");
    private static readonly Guid PlantId = Guid.Parse("31000000-0000-4000-8000-000000000001");
    private static readonly Guid StationId = Guid.Parse("34000000-0000-4000-8000-000000000001");
    private static readonly Guid WorkerId = Guid.Parse("45000000-0000-4000-8000-000000000001");
    private static readonly Guid ProfileId = Guid.Parse("a1000000-0000-4000-8000-000000000002");
    private static readonly DateTimeOffset Now = new(2026, 10, 17, 12, 0, 0, TimeSpan.Zero);

    [TestMethod]
    public async Task WorkerCanCheckInRestartAndCheckOutWithoutNetwork()
    {
        var repository = new MemoryAttendanceRepository();
        var time = new MutableTimeProvider(Now);
        AttendancePreviewViewModel first = Create(repository, time);
        await first.InitializeAsync();
        first.SelectedWorker = first.Workers.Single();

        Assert.IsTrue(first.CheckInCommand.CanExecute(null));
        Assert.IsFalse(first.CheckOutCommand.CanExecute(null));
        await first.CheckInCommand.ExecuteAsync(null);

        Assert.AreEqual(1, first.PresentCount);
        Assert.IsFalse(first.CheckInCommand.CanExecute(null));
        Assert.IsTrue(first.CheckOutCommand.CanExecute(null));
        Assert.HasCount(1, repository.Events);

        time.SetUtcNow(Now.AddHours(8));
        AttendancePreviewViewModel restarted = Create(repository, time);
        await restarted.InitializeAsync();
        restarted.SelectedWorker = restarted.Workers.Single();

        Assert.AreEqual(1, restarted.PresentCount);
        Assert.IsTrue(restarted.CheckOutCommand.CanExecute(null));
        await restarted.CheckOutCommand.ExecuteAsync(null);

        Assert.AreEqual(0, restarted.PresentCount);
        Assert.HasCount(2, repository.Events);
        Assert.AreEqual(AttendanceEventType.CheckOut, repository.Events[1].Type);
        StringAssert.Contains(restarted.Status, "Guardada en este equipo");
    }

    [TestMethod]
    public async Task PlantManagerClosesForgottenExitWithMandatoryReason()
    {
        var repository = new MemoryAttendanceRepository();
        await repository.RecordAsync(Mutation(Guid.NewGuid(), AttendanceEventType.CheckIn, Now));
        var mode = new PlantManagerModeState();
        mode.SetActive(true);
        var viewModel = Create(repository, new MutableTimeProvider(Now.AddHours(9)), mode);
        await viewModel.InitializeAsync();
        viewModel.SelectedWorker = viewModel.Workers.Single();

        Assert.IsFalse(viewModel.CorrectOpenShiftCommand.CanExecute(null));
        viewModel.CorrectionDate = new DateTime(2026, 10, 17);
        viewModel.CorrectionTime = "14:00";
        viewModel.CorrectionReason = "Olvidó registrar la salida al terminar.";
        Assert.IsTrue(viewModel.CorrectOpenShiftCommand.CanExecute(null));

        await viewModel.CorrectOpenShiftCommand.ExecuteAsync(null);

        Assert.AreEqual(0, viewModel.PresentCount);
        Assert.HasCount(2, repository.Events);
        AttendanceEvent correction = repository.Events[1];
        Assert.AreEqual(AttendanceEventType.AdjustedCheckOut, correction.Type);
        Assert.AreEqual(ProfileId, correction.CorrectedByProfileId);
        Assert.AreEqual("Olvidó registrar la salida al terminar.", correction.CorrectionReason);
        Assert.AreEqual(Now.AddHours(8), correction.OccurredAt);
        Assert.AreEqual(Now.AddHours(9), correction.RecordedAt);
        Assert.IsFalse(viewModel.CorrectOpenShiftCommand.CanExecute(null));
        StringAssert.Contains(viewModel.Status, "corrección auditada");
    }

    [TestMethod]
    public async Task PlantManagerCannotCloseShiftBeforeEntryOrInTheFuture()
    {
        var repository = new MemoryAttendanceRepository();
        await repository.RecordAsync(Mutation(Guid.NewGuid(), AttendanceEventType.CheckIn, Now));
        var mode = new PlantManagerModeState();
        mode.SetActive(true);
        var viewModel = Create(repository, new MutableTimeProvider(Now.AddHours(9)), mode);
        await viewModel.InitializeAsync();
        viewModel.SelectedWorker = viewModel.Workers.Single();
        viewModel.CorrectionReason = "Olvidó marcar su salida.";

        viewModel.CorrectionDate = new DateTime(2026, 10, 17);
        viewModel.CorrectionTime = "05:59";
        Assert.IsFalse(viewModel.CorrectOpenShiftCommand.CanExecute(null));
        StringAssert.Contains(viewModel.CorrectionValidationMessage, "posterior a la entrada");

        viewModel.CorrectionTime = "15:01";
        Assert.IsFalse(viewModel.CorrectOpenShiftCommand.CanExecute(null));
        StringAssert.Contains(viewModel.CorrectionValidationMessage, "futuro");
        Assert.HasCount(1, repository.Events);
    }

    [TestMethod]
    public void PlantManagerWorkerKeepsAccessIdentitySeparateButShowsItsCategory()
    {
        var worker = new CachedWorker(
            WorkerId,
            OrganizationId,
            "Jefe de planta de prueba",
            true,
            Now,
            "JEFE_PLANTA");
        var status = new AttendanceWorkerStatus(
            worker,
            false,
            "Fuera de planta",
            "Sin marcas",
            0,
            null,
            null);

        Assert.AreEqual("Jefe de planta", status.CategoryLabel);
        Assert.AreEqual("Jefe de planta de prueba", status.DisplayName);
    }

    [TestMethod]
    public async Task PersonnelStatusShowsFiveWorkersPerPageAndSupportsSearch()
    {
        CachedWorker[] workers = Enumerable.Range(1, 12)
            .Select(index => new CachedWorker(
                Guid.NewGuid(),
                OrganizationId,
                $"Operario {index:00}",
                true,
                Now))
            .ToArray();
        var viewModel = new AttendancePreviewViewModel(
            new MemoryAttendanceRepository(),
            new MemoryCatalogRepository(workers),
            new MemoryStationStore(),
            new MutableTimeProvider(Now),
            new PlantManagerModeState());

        await viewModel.InitializeAsync();

        Assert.HasCount(5, viewModel.VisibleWorkers);
        Assert.AreEqual("1–5 de 12", viewModel.WorkerPageDescription);
        Assert.IsTrue(viewModel.NextWorkerPageCommand.CanExecute(null));
        viewModel.NextWorkerPageCommand.Execute(null);
        Assert.AreEqual("6–10 de 12", viewModel.WorkerPageDescription);

        viewModel.WorkerSearchText = "Operario 11";
        Assert.HasCount(1, viewModel.VisibleWorkers);
        Assert.AreEqual("Operario 11", viewModel.VisibleWorkers[0].DisplayName);
        Assert.AreEqual("1–1 de 1", viewModel.WorkerPageDescription);
    }

    [TestMethod]
    public void ForgottenExitPanelRequiresElevatedPlantManagerMode()
    {
        var mode = new PlantManagerModeState();
        AttendancePreviewViewModel viewModel = Create(
            new MemoryAttendanceRepository(),
            new MutableTimeProvider(Now),
            mode);

        Assert.IsFalse(viewModel.ToggleCorrectionPanelCommand.CanExecute(null));
        mode.SetActive(true);
        viewModel.RefreshManagerMode();
        Assert.IsTrue(viewModel.ToggleCorrectionPanelCommand.CanExecute(null));

        viewModel.ToggleCorrectionPanelCommand.Execute(null);
        Assert.IsTrue(viewModel.IsCorrectionPanelOpen);

        mode.SetActive(false);
        viewModel.RefreshManagerMode();
        Assert.IsFalse(viewModel.IsCorrectionPanelOpen);
    }

    [TestMethod]
    public async Task CheckOutWarnsWhenWorkerStillOwnsAnActiveLine()
    {
        var repository = new MemoryAttendanceRepository();
        await repository.RecordAsync(Mutation(Guid.NewGuid(), AttendanceEventType.CheckIn, Now));
        var session = new LocalOperationalSession(
            StationId,
            OrganizationId,
            PlantId,
            Guid.Parse("43000000-0000-4000-8000-000000000001"),
            Guid.NewGuid(),
            Guid.NewGuid(),
            WorkerId,
            Now,
            Now,
            LineFeedCycleStatus.Active);
        var dashboard = new MemoryOperationDashboardRepository(new LocalOperationDashboardSnapshot(
            session,
            session.LineId,
            "Línea morada",
            "Proveedor",
            Now,
            "Operario de prueba",
            Now,
            null,
            null,
            10,
            0));
        var viewModel = new AttendancePreviewViewModel(
            repository,
            new MemoryCatalogRepository(),
            new MemoryStationStore(),
            new MutableTimeProvider(Now.AddHours(1)),
            new PlantManagerModeState(),
            dashboard);

        await viewModel.InitializeAsync();
        Assert.IsFalse(viewModel.HasResponsibilityWarning);
        viewModel.SelectedWorker = viewModel.Workers.Single();

        await viewModel.CheckOutCommand.ExecuteAsync(null);

        Assert.IsTrue(viewModel.HasResponsibilityWarning);
        StringAssert.Contains(viewModel.ResponsibilityWarning, "Línea morada");
        StringAssert.Contains(viewModel.ResponsibilityWarning, "fuera de planta");
    }

    private static AttendancePreviewViewModel Create(
        MemoryAttendanceRepository repository,
        TimeProvider time,
        PlantManagerModeState? mode = null) =>
        new(
            repository,
            new MemoryCatalogRepository(),
            new MemoryStationStore(),
            time,
            mode ?? new PlantManagerModeState());

    private static RecordLocalAttendanceMutation Mutation(
        Guid id,
        AttendanceEventType type,
        DateTimeOffset occurredAt) =>
        new(
            id,
            OrganizationId,
            PlantId,
            StationId,
            WorkerId,
            type,
            occurredAt,
            occurredAt);

    private sealed class MemoryAttendanceRepository : ILocalAttendanceRepository
    {
        public List<AttendanceEvent> Events { get; } = [];

        public Task<LocalAttendanceRegistration> RecordAsync(
            RecordLocalAttendanceMutation mutation,
            CancellationToken cancellationToken = default)
        {
            AttendanceEvent result = mutation.EventType switch
            {
                AttendanceEventType.CheckIn => AttendanceEvent.CheckIn(
                    mutation.ClientEventId,
                    mutation.OrganizationId,
                    mutation.PlantId,
                    mutation.StationId,
                    mutation.WorkerId,
                    Events.Count + 1,
                    mutation.OccurredAt,
                    mutation.RecordedAt),
                AttendanceEventType.CheckOut => AttendanceEvent.CheckOut(
                    mutation.ClientEventId,
                    mutation.OrganizationId,
                    mutation.PlantId,
                    mutation.StationId,
                    mutation.WorkerId,
                    Events.Count + 1,
                    mutation.OccurredAt,
                    mutation.RecordedAt),
                _ => AttendanceEvent.Adjustment(
                    mutation.ClientEventId,
                    mutation.OrganizationId,
                    mutation.PlantId,
                    mutation.StationId,
                    mutation.WorkerId,
                    mutation.EventType,
                    Events.Count + 1,
                    mutation.OccurredAt,
                    mutation.RecordedAt,
                    mutation.CorrectedByProfileId!.Value,
                    mutation.CorrectionReason!,
                    mutation.RelatedEventId!.Value),
            };
            Events.Add(result);
            return Task.FromResult(new LocalAttendanceRegistration(result, false));
        }

        public Task<IReadOnlyList<AttendanceEvent>> ListForWorkerAsync(
            Guid organizationId,
            Guid workerId,
            CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<AttendanceEvent>>(
                [.. Events.Where(item => item.OrganizationId == organizationId && item.WorkerId == workerId)]);
    }

    private sealed class MemoryCatalogRepository : ILocalCatalogRepository
    {
        private static readonly CachedWorker Worker =
            new(WorkerId, OrganizationId, "Operario de prueba", true, Now);
        private readonly IReadOnlyList<CachedWorker> workers;

        public MemoryCatalogRepository()
            : this([Worker])
        {
        }

        public MemoryCatalogRepository(IReadOnlyList<CachedWorker> workers)
        {
            this.workers = workers;
        }

        public Task<IReadOnlyList<CachedWorker>> ListActiveWorkersAsync(
            Guid organizationId,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(workers);

        public Task<CachedWorker?> FindWorkerAsync(
            Guid workerId,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(workers.FirstOrDefault(worker => worker.Id == workerId));

        public Task UpsertSupplierAsync(CachedSupplier supplier, CancellationToken cancellationToken = default) =>
            Task.CompletedTask;

        public Task UpsertWorkerAsync(CachedWorker worker, CancellationToken cancellationToken = default) =>
            Task.CompletedTask;

        public Task UpsertLineAsync(CachedProductionLine line, CancellationToken cancellationToken = default) =>
            Task.CompletedTask;

        public Task<IReadOnlyList<CachedSupplier>> ListActiveSuppliersAsync(
            Guid organizationId,
            CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<CachedSupplier>>([]);

        public Task<IReadOnlyList<CachedProductionLine>> ListActiveLinesAsync(
            Guid organizationId,
            Guid plantId,
            Guid stationId,
            CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<CachedProductionLine>>([]);

        public Task<CachedSupplier?> FindSupplierAsync(
            Guid supplierId,
            CancellationToken cancellationToken = default) =>
            Task.FromResult<CachedSupplier?>(null);

        public Task<CachedProductionLine?> FindLineAsync(
            Guid lineId,
            CancellationToken cancellationToken = default) =>
            Task.FromResult<CachedProductionLine?>(null);
    }

    private sealed class MemoryOperationDashboardRepository(
        LocalOperationDashboardSnapshot snapshot) : ILocalOperationDashboardRepository
    {
        public Task<LocalOperationDashboardSnapshot> GetAsync(
            Guid stationId,
            CancellationToken cancellationToken = default) => Task.FromResult(snapshot);

        public Task<IReadOnlyList<LocalOperationDashboardSnapshot>> ListAsync(
            Guid stationId,
            CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<LocalOperationDashboardSnapshot>>([snapshot]);
    }

    private sealed class MemoryStationStore : IProtectedStationStore
    {
        public Task<ProtectedStationState?> LoadAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult<ProtectedStationState?>(new ProtectedStationState(
                new AuthTokens("access", "refresh", Now.AddHours(1)),
                new ApiSession(ProfileId, OrganizationId, "JEFE_PLANTA", Now.AddHours(1)),
                new StationAuthorization(
                    StationId,
                    PlantId,
                    OrganizationId,
                    "Estación de prueba",
                    1,
                    "pin",
                    Now,
                    Now.AddDays(1)),
                [],
                OfflinePinState.Empty));

        public Task SaveAsync(ProtectedStationState state, CancellationToken cancellationToken = default) =>
            Task.CompletedTask;

        public Task CloseSessionAsync(CancellationToken cancellationToken = default) =>
            Task.CompletedTask;
    }

    private sealed class MutableTimeProvider(DateTimeOffset value) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => value;

        public void SetUtcNow(DateTimeOffset current) => value = current;
    }
}
