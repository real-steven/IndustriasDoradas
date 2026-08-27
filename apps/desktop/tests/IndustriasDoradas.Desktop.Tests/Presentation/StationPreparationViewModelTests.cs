using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Configuration;
using IndustriasDoradas.Desktop.Domain;
using IndustriasDoradas.Desktop.Infrastructure.Station;
using IndustriasDoradas.Desktop.Presentation.ViewModels;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Tests.Presentation;

[TestClass]
public sealed class StationPreparationViewModelTests
{
    private static readonly Guid OrganizationId = Guid.Parse("30000000-0000-4000-8000-000000000001");
    private static readonly Guid PlantId = Guid.Parse("31000000-0000-4000-8000-000000000001");
    private static readonly Guid StationId = Guid.Parse("34000000-0000-4000-8000-000000000001");
    private static readonly Guid SupplierId = Guid.Parse("42000000-0000-4000-8000-000000000001");
    private static readonly Guid LineId = Guid.Parse("43000000-0000-4000-8000-000000000001");
    private static readonly Guid WorkerId = Guid.Parse("45000000-0000-4000-8000-000000000001");
    private static readonly DateTimeOffset Now = new(2026, 8, 27, 12, 0, 0, TimeSpan.Zero);

    [TestMethod]
    public async Task PlantManagerPreparesSummaryThenConfirmsPilotLineAtomically()
    {
        var time = new FixedTimeProvider();
        ProtectedStationState state = State();
        var catalogs = new MemoryCatalogs();
        var api = new StubStationApi(state, Snapshot());
        var coordinator = new StationCoordinator(
            new StubAuth(), api, catalogs, new MemoryStationStore(state), new NoopEvidenceCapture(),
            Options.Create(new StationOptions { Id = StationId }), time);
        var sessions = new MemorySessions();
        var operationRepository = new RecordingOperationRepository(sessions);
        var operations = new LocalOperationService(catalogs, sessions, operationRepository, time);
        using var viewModel = new StationViewModel(
            coordinator,
            catalogs,
            operations,
            Options.Create(new StationOptions { Id = StationId, PrivilegedIdleSeconds = 120, OfflineHours = 24 }),
            time);
        DiagnosticsViewModel diagnostics = new(new StubHealthService(), new StubLocalDiagnostics());
        MainWindowViewModel shell = new(new HomeViewModel(), diagnostics, viewModel);

        await viewModel.InitializeAsync();
        Assert.IsFalse(shell.ShowDiagnosticsCommand.CanExecute(null));

        await viewModel.ElevateAsync("123456");
        Assert.IsTrue(shell.ShowDiagnosticsCommand.CanExecute(null));

        viewModel.SelectedSupplier = viewModel.Suppliers.Single();
        viewModel.SelectedWorker = viewModel.Workers.Single();

        Assert.IsTrue(viewModel.IsPlantManager);
        Assert.AreEqual("Línea 1", viewModel.PilotLineName);
        Assert.IsTrue(viewModel.PrepareLineCommand.CanExecute(null));
        await viewModel.PrepareLineCommand.ExecuteAsync(null);

        Assert.AreEqual(0, operationRepository.StartCalls);
        StringAssert.Contains(viewModel.PreparationSummary, "La Esperanza");
        StringAssert.Contains(viewModel.PreparationSummary, "Marta");
        Assert.IsTrue(viewModel.ConfirmLineCommand.CanExecute(null));

        await viewModel.ConfirmLineCommand.ExecuteAsync(null);

        Assert.AreEqual(1, operationRepository.StartCalls);
        Assert.AreEqual(SupplierId, operationRepository.LastStart!.SupplierId);
        Assert.AreEqual(WorkerId, operationRepository.LastStart.Session.ResponsibleWorkerId);
        Assert.AreEqual(StationMode.Operation, viewModel.Mode);
        Assert.IsFalse(shell.ShowDiagnosticsCommand.CanExecute(null));
        StringAssert.Contains(viewModel.Status, "Línea lista");
    }

    private static ProtectedStationState State() => new(
        new AuthTokens("access", "refresh", Now.AddHours(1)),
        new ApiSession(Guid.Parse("20000000-0000-4000-8000-000000000001"), OrganizationId, "JEFE_PLANTA", Now.AddHours(1)),
        new StationAuthorization(StationId, PlantId, OrganizationId, "Estación piloto", 1, "verifier", Now, Now.AddHours(24)),
        [],
        OfflinePinState.Empty);

    private static LocalOperationCatalogSnapshot Snapshot() => new(
        [new CachedSupplier(SupplierId, OrganizationId, "La Esperanza", true, Now)],
        [new CachedWorker(WorkerId, OrganizationId, "Marta", true, Now)],
        [new CachedProductionLine(LineId, OrganizationId, PlantId, "Línea 1", true, Now)]);

    private sealed class FixedTimeProvider : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => Now;
    }

    private sealed class StubAuth : ISupabaseAuthService
    {
        public Task<AuthTokens> SignInAsync(string email, string password, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task RequestPasswordRecoveryAsync(string email, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }

    private sealed class StubStationApi(ProtectedStationState state, LocalOperationCatalogSnapshot snapshot) : IStationApi
    {
        public Task<ApiSession> GetSessionAsync(string accessToken, CancellationToken cancellationToken = default) => Task.FromResult(state.Session);
        public Task<StationAuthorization> GetAuthorizationAsync(Guid organizationId, Guid stationId, string accessToken, CancellationToken cancellationToken = default) => Task.FromResult(state.Authorization);
        public Task<PinAttemptResponse> ElevateAsync(Guid organizationId, Guid stationId, string pin, string accessToken, CancellationToken cancellationToken = default) => Task.FromResult(new PinAttemptResponse("ACCEPTED", null, null));
        public Task<LocalOperationCatalogSnapshot> GetOperationCatalogAsync(Guid organizationId, Guid plantId, string accessToken, CancellationToken cancellationToken = default) => Task.FromResult(snapshot);
    }

    private sealed class MemoryStationStore(ProtectedStationState state) : IProtectedStationStore
    {
        private ProtectedStationState? current = state;
        public Task SaveAsync(ProtectedStationState value, CancellationToken cancellationToken = default) { current = value; return Task.CompletedTask; }
        public Task<ProtectedStationState?> LoadAsync(CancellationToken cancellationToken = default) => Task.FromResult(current);
        public Task ClearAuthorizationAsync(CancellationToken cancellationToken = default) { current = null; return Task.CompletedTask; }
    }

    private sealed class MemoryCatalogs : ILocalCatalogRepository
    {
        private readonly List<CachedSupplier> suppliers = [];
        private readonly List<CachedWorker> workers = [];
        private readonly List<CachedProductionLine> lines = [];
        public Task UpsertSupplierAsync(CachedSupplier supplier, CancellationToken cancellationToken = default) { suppliers.RemoveAll(item => item.Id == supplier.Id); suppliers.Add(supplier); return Task.CompletedTask; }
        public Task UpsertWorkerAsync(CachedWorker worker, CancellationToken cancellationToken = default) { workers.RemoveAll(item => item.Id == worker.Id); workers.Add(worker); return Task.CompletedTask; }
        public Task UpsertLineAsync(CachedProductionLine line, CancellationToken cancellationToken = default) { lines.RemoveAll(item => item.Id == line.Id); lines.Add(line); return Task.CompletedTask; }
        public Task<IReadOnlyList<CachedSupplier>> ListActiveSuppliersAsync(Guid organizationId, CancellationToken cancellationToken = default) => Task.FromResult<IReadOnlyList<CachedSupplier>>(suppliers.Where(item => item.OrganizationId == organizationId && item.IsActive).ToArray());
        public Task<IReadOnlyList<CachedWorker>> ListActiveWorkersAsync(Guid organizationId, CancellationToken cancellationToken = default) => Task.FromResult<IReadOnlyList<CachedWorker>>(workers.Where(item => item.OrganizationId == organizationId && item.IsActive).ToArray());
        public Task<IReadOnlyList<CachedProductionLine>> ListActiveLinesAsync(Guid organizationId, Guid plantId, CancellationToken cancellationToken = default) => Task.FromResult<IReadOnlyList<CachedProductionLine>>(lines.Where(item => item.OrganizationId == organizationId && item.PlantId == plantId && item.IsActive).ToArray());
        public Task<CachedSupplier?> FindSupplierAsync(Guid supplierId, CancellationToken cancellationToken = default) => Task.FromResult(suppliers.SingleOrDefault(item => item.Id == supplierId));
        public Task<CachedWorker?> FindWorkerAsync(Guid workerId, CancellationToken cancellationToken = default) => Task.FromResult(workers.SingleOrDefault(item => item.Id == workerId));
        public Task<CachedProductionLine?> FindLineAsync(Guid lineId, CancellationToken cancellationToken = default) => Task.FromResult(lines.SingleOrDefault(item => item.Id == lineId));
    }

    private sealed class MemorySessions : ILocalOperationalSessionRepository
    {
        public LocalOperationalSession? Current { get; set; }
        public Task SaveAsync(LocalOperationalSession session, CancellationToken cancellationToken = default) { Current = session; return Task.CompletedTask; }
        public Task<LocalOperationalSession?> LoadAsync(Guid stationId, CancellationToken cancellationToken = default) => Task.FromResult(Current);
    }

    private sealed class RecordingOperationRepository(MemorySessions sessions) : ILocalOperationRepository
    {
        public int StartCalls { get; private set; }
        public StartLocalOperationMutation? LastStart { get; private set; }
        public Task StartAsync(StartLocalOperationMutation mutation, CancellationToken cancellationToken = default) { StartCalls++; LastStart = mutation; sessions.Current = mutation.Session; return Task.CompletedTask; }
        public Task RelieveAsync(RelieveLocalOperationMutation mutation, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task CompleteAsync(CompleteLocalOperationMutation mutation, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    }

    private sealed class StubHealthService : IHealthService
    {
        public Task<SystemHealth> CheckAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(SystemHealth.Unavailable("Sin conexión."));
    }

    private sealed class StubLocalDiagnostics : ILocalDatabaseDiagnostics
    {
        public Task<LocalDatabaseHealth> InspectAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(new LocalDatabaseHealth(
                LocalDatabaseHealthState.Healthy,
                LocalDatabaseHealthIssue.None,
                0,
                1024,
                null,
                DateTimeOffset.UtcNow,
                "Correcto.",
                "Sin acción."));

        public Task<string> CreateConsistentCopyAsync(
            string destinationDirectory,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(string.Empty);
    }
}
