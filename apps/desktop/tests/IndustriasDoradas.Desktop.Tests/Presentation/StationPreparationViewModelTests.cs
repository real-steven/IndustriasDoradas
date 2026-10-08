using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Configuration;
using IndustriasDoradas.Desktop.Domain;
using IndustriasDoradas.Desktop.Domain.Production;
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
    private static readonly Guid SecondLineId = Guid.Parse("43000000-0000-4000-8000-000000000002");
    private static readonly Guid ThirdLineId = Guid.Parse("43000000-0000-4000-8000-000000000003");
    private static readonly Guid FourthLineId = Guid.Parse("43000000-0000-4000-8000-000000000004");
    private static readonly Guid WorkerId = Guid.Parse("45000000-0000-4000-8000-000000000001");
    private static readonly Guid SecondWorkerId = Guid.Parse("45000000-0000-4000-8000-000000000002");
    private static readonly DateTimeOffset Now = new(2026, 8, 27, 12, 0, 0, TimeSpan.Zero);

    [TestMethod]
    public async Task CloseStationCommandReturnsToSignedOutLoginState()
    {
        var time = new FixedTimeProvider();
        ProtectedStationState state = State();
        var catalogs = new MemoryCatalogs();
        var stationStore = new MemoryStationStore(state);
        var coordinator = new StationCoordinator(
            new StubAuth(),
            new StubStationApi(state, Snapshot()),
            catalogs,
            new MemoryStationSequences(),
            stationStore,
            new NoopEvidenceCapture(),
            Options.Create(new StationOptions { Id = StationId }),
            time);
        var sessions = new MemorySessions();
        using var viewModel = new StationViewModel(
            coordinator,
            catalogs,
            new LocalOperationService(catalogs, sessions, new RecordingOperationRepository(sessions), time),
            Options.Create(new StationOptions { Id = StationId }),
            time);

        await viewModel.InitializeAsync();
        Assert.IsTrue(viewModel.IsStationOpen);
        Assert.IsTrue(viewModel.WasSessionRestored);
        Assert.IsFalse(viewModel.IsApplicationUnlocked);
        Assert.IsTrue(viewModel.HasRestorableSession);
        Assert.IsTrue(viewModel.NeedsCredentials);
        Assert.AreEqual(LoginSessionState.Available, viewModel.LoginSessionState);
        StringAssert.Contains(viewModel.LoginSessionTitle, "lista para continuar");

        viewModel.EnterRestoredSession();

        Assert.IsTrue(viewModel.IsApplicationUnlocked);
        Assert.AreEqual(StationMode.Operation, viewModel.Mode);

        await viewModel.CloseStationCommand.ExecuteAsync(null);

        Assert.IsFalse(viewModel.IsStationOpen);
        Assert.IsFalse(viewModel.IsApplicationUnlocked);
        Assert.IsFalse(viewModel.WasSessionRestored);
        Assert.AreEqual(LoginSessionState.Closed, viewModel.LoginSessionState);
        Assert.AreEqual(StationMode.SignedOut, viewModel.Mode);
        StringAssert.Contains(viewModel.StationSessionStatus, "cerrada manualmente");
    }

    [TestMethod]
    public async Task PlantManagerPreparesSummaryThenConfirmsPilotLineAtomically()
    {
        var time = new FixedTimeProvider();
        ProtectedStationState state = State();
        var catalogs = new MemoryCatalogs();
        var api = new StubStationApi(state, Snapshot());
        var coordinator = new StationCoordinator(
            new StubAuth(), api, catalogs, new MemoryStationSequences(), new MemoryStationStore(state),
            new NoopEvidenceCapture(),
            Options.Create(new StationOptions { Id = StationId }), time);
        var sessions = new MemorySessions();
        var operationRepository = new RecordingOperationRepository(sessions);
        var operations = new LocalOperationService(catalogs, sessions, operationRepository, time);
        using var viewModel = new StationViewModel(
            coordinator,
            catalogs,
            operations,
            Options.Create(new StationOptions { Id = StationId }),
            time);
        DiagnosticsViewModel diagnostics = new(new StubHealthService(), new StubLocalDiagnostics());
        AuditViewModel audit = new(diagnostics, viewModel);
        SettingsViewModel settings = new();
        MainWindowViewModel shell = new(
            new HomeViewModel(), diagnostics, viewModel, null, audit, settings);

        await viewModel.InitializeAsync();
        Assert.IsTrue(shell.ShowDiagnosticsCommand.CanExecute(null));
        Assert.IsTrue(shell.ShowAuditCommand.CanExecute(null));
        Assert.IsFalse(shell.ShowSettingsCommand.CanExecute(null));
        audit.SelectCategoryCommand.Execute(AuditCategory.Corrections);
        Assert.IsTrue(audit.IsOperationCategory);

        await viewModel.ElevateAsync("123456");
        Assert.IsTrue(shell.ShowDiagnosticsCommand.CanExecute(null));
        Assert.IsTrue(shell.ShowAuditCommand.CanExecute(null));
        Assert.IsTrue(shell.ShowSettingsCommand.CanExecute(null));
        audit.SelectCategoryCommand.Execute(AuditCategory.Corrections);
        Assert.IsTrue(audit.IsCorrectionsCategory);

        Assert.IsNull(viewModel.SelectedLine);
        viewModel.SelectedLine = viewModel.Lines.Single(line => line.Id == LineId);
        viewModel.SelectedSupplier = viewModel.Suppliers.Single();
        viewModel.SelectedWorker = viewModel.Workers.Single(worker => worker.Id == WorkerId);

        Assert.IsTrue(viewModel.IsPlantManager);
        Assert.AreEqual(4, viewModel.Lines.Count);
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
        Assert.AreEqual(StationMode.PlantManager, viewModel.Mode);
        Assert.IsTrue(shell.ShowDiagnosticsCommand.CanExecute(null));
        Assert.IsTrue(shell.ShowAuditCommand.CanExecute(null));
        Assert.IsTrue(shell.ShowSettingsCommand.CanExecute(null));
        Assert.IsTrue(audit.IsCorrectionsCategory);
        StationLineStatus activeLine = viewModel.LineStatuses.Single(line => line.Id == LineId);
        Assert.IsTrue(activeLine.IsPrepared);
        Assert.IsTrue(activeLine.IsSelected);
        viewModel.SelectLineCommand.Execute(SecondLineId);
        Assert.AreEqual(SecondLineId, viewModel.SelectedLine?.Id);
        viewModel.SelectedSupplier = viewModel.Suppliers.Single();
        viewModel.SelectedWorker = viewModel.Workers.Single(worker => worker.Id == SecondWorkerId);
        Assert.IsTrue(viewModel.CanRequestStart);
        await viewModel.PrepareLineCommand.ExecuteAsync(null);
        await viewModel.ConfirmLineCommand.ExecuteAsync(null);
        Assert.AreEqual(2, operationRepository.StartCalls);
        Assert.HasCount(2, viewModel.LineStatuses.Where(line => line.IsPrepared).ToArray());
        Assert.IsTrue(viewModel.LineStatuses.Single(line => line.Id == LineId).IsPrepared);
        Assert.IsTrue(viewModel.LineStatuses.Single(line => line.Id == SecondLineId).IsPrepared);
        StringAssert.Contains(viewModel.Status, "Línea lista");
    }

    [TestMethod]
    public async Task PlantManagerRelievesResponsibleAndCompletesActiveShipmentWithConfirmation()
    {
        var time = new FixedTimeProvider();
        ProtectedStationState state = State();
        var catalogs = new MemoryCatalogs();
        var stationStore = new MemoryStationStore(state);
        var coordinator = new StationCoordinator(
            new StubAuth(),
            new StubStationApi(state, Snapshot()),
            catalogs,
            new MemoryStationSequences(),
            stationStore,
            new NoopEvidenceCapture(),
            Options.Create(new StationOptions { Id = StationId }),
            time);
        var sessions = new MemorySessions();
        var repository = new RecordingOperationRepository(sessions);
        var operations = new LocalOperationService(catalogs, sessions, repository, time);
        var sweeps = new MemorySweepRepository(sessions, quantity: 30);
        using var viewModel = new StationViewModel(
            coordinator,
            catalogs,
            operations,
            Options.Create(new StationOptions { Id = StationId }),
            time,
            dashboard: null,
            new RecordProductionSweepHandler(sweeps, stationStore, time));

        await viewModel.InitializeAsync();
        await viewModel.ElevateAsync("123456");
        viewModel.SelectedLine = viewModel.Lines.Single(line => line.Id == LineId);
        viewModel.SelectedSupplier = viewModel.Suppliers.Single();
        viewModel.SelectedWorker = viewModel.Workers.Single(worker => worker.Id == WorkerId);
        await viewModel.PrepareLineCommand.ExecuteAsync(null);
        await viewModel.ConfirmLineCommand.ExecuteAsync(null);

        Assert.IsTrue(viewModel.HasActiveOperation);
        Assert.IsTrue(viewModel.CanManageActiveOperation);

        viewModel.SelectedWorker = viewModel.Workers.Single(worker => worker.Id == SecondWorkerId);
        Assert.IsTrue(viewModel.CanManageActiveOperation);
        Assert.IsTrue(viewModel.PrepareReliefCommand.CanExecute(null));
        await viewModel.PrepareReliefCommand.ExecuteAsync(null);

        Assert.AreEqual(0, repository.ReliefCalls);
        StringAssert.Contains(viewModel.ManagementSummary, "Marta → Carlos");
        Assert.IsTrue(viewModel.ConfirmReliefCommand.CanExecute(null));
        await viewModel.ConfirmReliefCommand.ExecuteAsync(null);

        Assert.AreEqual(1, repository.ReliefCalls);
        Assert.AreEqual(SecondWorkerId, sessions.Current?.ResponsibleWorkerId);
        Assert.IsTrue(viewModel.HasActiveOperation);
        Assert.AreEqual(StationMode.PlantManager, viewModel.Mode);

        Assert.IsTrue(viewModel.PrepareCompletionCommand.CanExecute(null));
        await viewModel.PrepareCompletionCommand.ExecuteAsync(null);

        Assert.AreEqual(0, repository.CompletionCalls);
        StringAssert.Contains(viewModel.ManagementSummary, "barrida final de 30 cajuelas");
        Assert.IsTrue(viewModel.ConfirmCompletionCommand.CanExecute(null));
        await viewModel.ConfirmCompletionCommand.ExecuteAsync(null);

        Assert.AreEqual(1, sweeps.RecordCalls);
        Assert.IsNotNull(sweeps.LastSweep);
        Assert.IsTrue(sweeps.LastSweep.IsFinal);
        Assert.AreEqual(30, sweeps.LastSweep.CajuelaQuantity);
        Assert.AreEqual(SweepMercuryStatus.Pending, sweeps.LastSweep.MercuryStatus);
        Assert.AreEqual(1, repository.CompletionCalls);
        Assert.AreEqual(LineFeedCycleStatus.Completed, sessions.Current?.Status);
        Assert.IsFalse(viewModel.HasActiveOperation);
        Assert.AreEqual(StationMode.PlantManager, viewModel.Mode);
        Assert.IsTrue(viewModel.CanPrepareNewShipment);
    }

    [TestMethod]
    public async Task OnlineElevationRenewsExpiredAuthorizationBeforeCompletingShipment()
    {
        var time = new MutableTimeProvider(Now);
        ProtectedStationState state = State() with
        {
            Tokens = new AuthTokens("access", "refresh", Now.AddHours(48)),
            Session = State().Session with { ExpiresAt = Now.AddHours(48) },
        };
        var catalogs = new MemoryCatalogs();
        var api = new StubStationApi(
            state,
            Snapshot(),
            () => state.Authorization with
            {
                ValidatedAt = time.GetUtcNow(),
                OfflineValidUntil = time.GetUtcNow().AddHours(24),
            });
        var coordinator = new StationCoordinator(
            new StubAuth(),
            api,
            catalogs,
            new MemoryStationSequences(),
            new MemoryStationStore(state),
            new NoopEvidenceCapture(),
            Options.Create(new StationOptions { Id = StationId }),
            time);
        var sessions = new MemorySessions();
        var repository = new RecordingOperationRepository(sessions);
        using var viewModel = new StationViewModel(
            coordinator,
            catalogs,
            new LocalOperationService(catalogs, sessions, repository, time),
            Options.Create(new StationOptions { Id = StationId }),
            time);

        await viewModel.InitializeAsync();
        await viewModel.ElevateAsync("123456");
        viewModel.SelectedLine = viewModel.Lines.Single(line => line.Id == LineId);
        viewModel.SelectedSupplier = viewModel.Suppliers.Single();
        viewModel.SelectedWorker = viewModel.Workers.Single(worker => worker.Id == WorkerId);
        await viewModel.PrepareLineCommand.ExecuteAsync(null);
        await viewModel.ConfirmLineCommand.ExecuteAsync(null);
        time.Advance(TimeSpan.FromHours(25));

        await viewModel.ElevateAsync("123456");
        await viewModel.PrepareCompletionCommand.ExecuteAsync(null);
        await viewModel.ConfirmCompletionCommand.ExecuteAsync(null);

        Assert.AreEqual(1, repository.CompletionCalls);
        Assert.AreEqual(LineFeedCycleStatus.Completed, sessions.Current?.Status);
        Assert.IsFalse(viewModel.HasActiveOperation);
    }

    [TestMethod]
    public async Task CatalogRefreshNeverReplacesUnavailableSelectedLineImplicitly()
    {
        var time = new FixedTimeProvider();
        ProtectedStationState state = State();
        var catalogs = new MemoryCatalogs();
        var coordinator = new StationCoordinator(
            new StubAuth(),
            new StubStationApi(state, Snapshot()),
            catalogs,
            new MemoryStationSequences(),
            new MemoryStationStore(state),
            new NoopEvidenceCapture(),
            Options.Create(new StationOptions { Id = StationId }),
            time);
        var sessions = new MemorySessions();
        using var viewModel = new StationViewModel(
            coordinator,
            catalogs,
            new LocalOperationService(catalogs, sessions, new RecordingOperationRepository(sessions), time),
            Options.Create(new StationOptions { Id = StationId }),
            time);

        await viewModel.InitializeAsync();
        await viewModel.ElevateAsync("123456");

        Assert.AreEqual(4, viewModel.Lines.Count);
        Assert.AreEqual(4, viewModel.LineStatuses.Count);
        Assert.AreEqual("#8959DD", viewModel.LineStatuses[0].AccentColor);
        Assert.AreEqual("#35ADDD", viewModel.LineStatuses[1].AccentColor);
        Assert.AreEqual("#ED70A9", viewModel.LineStatuses[2].AccentColor);
        Assert.AreEqual("#F19B2C", viewModel.LineStatuses[3].AccentColor);
        Assert.IsNull(viewModel.SelectedLine);
        StringAssert.Contains(viewModel.Status, "Seleccione explícitamente");

        CachedProductionLine firstLine = viewModel.Lines.Single(line => line.Id == LineId);
        viewModel.SelectedLine = firstLine;
        await catalogs.UpsertLineAsync(firstLine with { IsActive = false, UpdatedAt = Now.AddMinutes(1) });
        await viewModel.ElevateAsync("123456");

        Assert.IsNull(viewModel.SelectedLine);
        Assert.IsTrue(viewModel.Lines.Any(line => line.Id == SecondLineId));
        StringAssert.Contains(viewModel.Status, "ya no está disponible");

        await catalogs.UpsertLineAsync(firstLine with { IsActive = true, UpdatedAt = Now.AddMinutes(2) });
        await viewModel.ElevateAsync("123456");

        Assert.IsNull(viewModel.SelectedLine);
        StringAssert.Contains(viewModel.Status, "Seleccione explícitamente");
    }

    [TestMethod]
    public async Task RestoredStationExplainsMissingResponsibleCatalogWithoutBlockingElevation()
    {
        var time = new FixedTimeProvider();
        ProtectedStationState state = State();
        var catalogs = new MemoryCatalogs();
        var snapshot = new LocalOperationCatalogSnapshot(
            [new CachedSupplier(SupplierId, OrganizationId, "La Esperanza", true, Now)],
            [],
            [new CachedProductionLine(LineId, OrganizationId, PlantId, "Línea 1", true, Now)]);
        var coordinator = new StationCoordinator(
            new StubAuth(),
            new StubStationApi(state, snapshot),
            catalogs,
            new MemoryStationSequences(),
            new MemoryStationStore(state),
            new NoopEvidenceCapture(),
            Options.Create(new StationOptions { Id = StationId }),
            time);
        var sessions = new MemorySessions();
        using var viewModel = new StationViewModel(
            coordinator,
            catalogs,
            new LocalOperationService(catalogs, sessions, new RecordingOperationRepository(sessions), time),
            Options.Create(new StationOptions { Id = StationId }),
            time);

        await viewModel.InitializeAsync();
        Assert.IsTrue(viewModel.IsStationOpen);
        StringAssert.Contains(viewModel.StationSessionStatus, "sesión protegida restaurada");

        Task elevation = viewModel.ElevateAsync("123456");
        Task completed = await Task.WhenAny(elevation, Task.Delay(TimeSpan.FromSeconds(1)));
        Assert.AreSame(elevation, completed, "La elevación no debe bloquear la interfaz con catálogo vacío.");
        await elevation;

        Assert.AreEqual(StationMode.PlantManager, viewModel.Mode);
        Assert.AreEqual(0, viewModel.Workers.Count);
        Assert.IsFalse(viewModel.PrepareLineCommand.CanExecute(null));
        StringAssert.Contains(viewModel.Status, "No hay responsables activos asignados a esta planta");
    }

    private static ProtectedStationState State() => new(
        new AuthTokens("access", "refresh", Now.AddHours(1)),
        new ApiSession(Guid.Parse("20000000-0000-4000-8000-000000000001"), OrganizationId, "JEFE_PLANTA", Now.AddHours(1)),
        new StationAuthorization(StationId, PlantId, OrganizationId, "Estación piloto", 1, "verifier", Now, Now.AddHours(24)),
        [],
        OfflinePinState.Empty);

    private static LocalOperationCatalogSnapshot Snapshot() => new(
        [new CachedSupplier(SupplierId, OrganizationId, "La Esperanza", true, Now)],
        [
            new CachedWorker(WorkerId, OrganizationId, "Marta", true, Now),
            new CachedWorker(SecondWorkerId, OrganizationId, "Carlos", true, Now),
        ],
        [
            new CachedProductionLine(LineId, OrganizationId, PlantId, "Línea 1", true, Now),
            new CachedProductionLine(SecondLineId, OrganizationId, PlantId, "Línea 2", true, Now),
            new CachedProductionLine(ThirdLineId, OrganizationId, PlantId, "Línea 3", true, Now),
            new CachedProductionLine(FourthLineId, OrganizationId, PlantId, "Línea 4", true, Now),
        ]);

    private sealed class FixedTimeProvider : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => Now;
    }

    private sealed class MutableTimeProvider(DateTimeOffset initial) : TimeProvider
    {
        private DateTimeOffset now = initial;

        public override DateTimeOffset GetUtcNow() => now;

        public void Advance(TimeSpan duration) => now += duration;
    }

    private sealed class StubAuth : ISupabaseAuthService
    {
        public Task<AuthTokens> SignInAsync(string email, string password, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<AuthTokens> RefreshSessionAsync(string refreshToken, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task RequestPasswordRecoveryAsync(string email, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }

    private sealed class StubStationApi(
        ProtectedStationState state,
        LocalOperationCatalogSnapshot snapshot,
        Func<StationAuthorization>? authorization = null) : IStationApi
    {
        public Task<ApiSession> GetSessionAsync(string accessToken, CancellationToken cancellationToken = default) => Task.FromResult(state.Session);
        public Task<StationAuthorization> GetAuthorizationAsync(Guid organizationId, Guid stationId, string accessToken, CancellationToken cancellationToken = default) =>
            Task.FromResult(authorization?.Invoke() ?? state.Authorization);
        public Task<PinAttemptResponse> ElevateAsync(Guid organizationId, Guid stationId, string pin, string accessToken, CancellationToken cancellationToken = default) => Task.FromResult(new PinAttemptResponse("ACCEPTED", null, null));
        public Task<LocalOperationCatalogSnapshot> GetOperationCatalogAsync(Guid organizationId, Guid plantId, string accessToken, CancellationToken cancellationToken = default) => Task.FromResult(snapshot);
    }

    private sealed class MemoryStationStore(ProtectedStationState state) : IProtectedStationStore
    {
        private ProtectedStationState? current = state;
        public Task SaveAsync(ProtectedStationState value, CancellationToken cancellationToken = default) { current = value; return Task.CompletedTask; }
        public Task<ProtectedStationState?> LoadAsync(CancellationToken cancellationToken = default) => Task.FromResult(current);
        public Task CloseSessionAsync(CancellationToken cancellationToken = default)
        {
            if (current is not null)
            {
                current = current with
                {
                    Tokens = new AuthTokens(string.Empty, string.Empty, DateTimeOffset.MinValue),
                    Authorization = current.Authorization with { OfflineValidUntil = DateTimeOffset.MinValue },
                    IsClosed = true,
                };
            }
            return Task.CompletedTask;
        }
    }

    private sealed class MemoryStationSequences : ILocalStationSequenceStore
    {
        public Task EnsureNextAsync(
            Guid stationId,
            long nextSequence,
            DateTimeOffset updatedAt,
            CancellationToken cancellationToken = default) => Task.CompletedTask;
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
        public Task<IReadOnlyList<CachedProductionLine>> ListActiveLinesAsync(Guid organizationId, Guid plantId, Guid stationId, CancellationToken cancellationToken = default) => Task.FromResult<IReadOnlyList<CachedProductionLine>>(lines.Where(item => item.OrganizationId == organizationId && item.PlantId == plantId && item.IsActive).ToArray());
        public Task<CachedSupplier?> FindSupplierAsync(Guid supplierId, CancellationToken cancellationToken = default) => Task.FromResult(suppliers.SingleOrDefault(item => item.Id == supplierId));
        public Task<CachedWorker?> FindWorkerAsync(Guid workerId, CancellationToken cancellationToken = default) => Task.FromResult(workers.SingleOrDefault(item => item.Id == workerId));
        public Task<CachedProductionLine?> FindLineAsync(Guid lineId, CancellationToken cancellationToken = default) => Task.FromResult(lines.SingleOrDefault(item => item.Id == lineId));
    }

    private sealed class MemorySessions : ILocalOperationalSessionRepository
    {
        private readonly Dictionary<(Guid StationId, Guid LineId), LocalOperationalSession> items = [];
        private LocalOperationalSession? current;

        public LocalOperationalSession? Current
        {
            get => current;
            set
            {
                current = value;
                if (value is not null) items[(value.StationId, value.LineId)] = value;
            }
        }

        public Task SaveAsync(LocalOperationalSession session, CancellationToken cancellationToken = default)
        {
            Current = session;
            return Task.CompletedTask;
        }

        public Task<LocalOperationalSession?> LoadAsync(Guid stationId, CancellationToken cancellationToken = default) =>
            Task.FromResult(items.Values.FirstOrDefault(item =>
                item.StationId == stationId && item.Status == LineFeedCycleStatus.Active));

        public Task<LocalOperationalSession?> LoadAsync(Guid stationId, Guid lineId, CancellationToken cancellationToken = default) =>
            Task.FromResult(items.GetValueOrDefault((stationId, lineId)));

        public Task<IReadOnlyList<LocalOperationalSession>> ListActiveAsync(Guid stationId, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<LocalOperationalSession>>(
                items.Values.Where(item =>
                    item.StationId == stationId && item.Status == LineFeedCycleStatus.Active).ToArray());
    }

    private sealed class RecordingOperationRepository(MemorySessions sessions) : ILocalOperationRepository
    {
        public int StartCalls { get; private set; }
        public int ReliefCalls { get; private set; }
        public int CompletionCalls { get; private set; }
        public StartLocalOperationMutation? LastStart { get; private set; }
        public Task StartAsync(StartLocalOperationMutation mutation, CancellationToken cancellationToken = default) { StartCalls++; LastStart = mutation; sessions.Current = mutation.Session; return Task.CompletedTask; }
        public Task RelieveAsync(RelieveLocalOperationMutation mutation, CancellationToken cancellationToken = default)
        {
            ReliefCalls++;
            sessions.Current = mutation.ExpectedSession with
            {
                ResponsibleWorkerId = mutation.NextResponsibleWorkerId,
                UpdatedAt = mutation.EffectiveAt,
            };
            return Task.CompletedTask;
        }
        public Task CompleteAsync(CompleteLocalOperationMutation mutation, CancellationToken cancellationToken = default)
        {
            CompletionCalls++;
            sessions.Current = mutation.ExpectedSession with
            {
                UpdatedAt = mutation.CompletedAt,
                Status = LineFeedCycleStatus.Completed,
            };
            return Task.CompletedTask;
        }
    }

    private sealed class MemorySweepRepository(
        MemorySessions sessions,
        int quantity) : ILocalProductionSweepRepository
    {
        public int RecordCalls { get; private set; }
        public ProductionSweep? LastSweep { get; private set; }

        public Task<LocalSweepPreparation> PrepareAsync(
            Guid stationId,
            Guid lineId,
            CancellationToken cancellationToken = default)
        {
            LocalOperationalSession session = sessions.Current
                ?? throw new InvalidOperationException("No hay sesión activa.");
            ProductionEventContext context = ProductionEventContext.Create(
                session.OrganizationId,
                session.PlantId,
                session.StationId,
                session.LineId,
                session.FeedCycleId,
                session.ShipmentId,
                session.ResponsibleWorkerId);
            ProductionEvent[] events = Enumerable.Range(1, quantity)
                .Select(index => ProductionEvent.CajuelaAdded(
                    Guid.NewGuid(),
                    context,
                    index,
                    Now.AddMinutes(-1),
                    Now.AddMinutes(-1)))
                .ToArray();
            return Task.FromResult(new LocalSweepPreparation(session, events, quantity, 0));
        }

        public Task<LocalSweepRegistration> RecordAsync(
            ProductionSweep sweep,
            CancellationToken cancellationToken = default)
        {
            RecordCalls++;
            LastSweep = sweep;
            return Task.FromResult(new LocalSweepRegistration(sweep, sweep.CajuelaQuantity, false));
        }
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
