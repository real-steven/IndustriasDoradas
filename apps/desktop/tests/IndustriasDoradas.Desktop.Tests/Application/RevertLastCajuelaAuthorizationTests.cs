using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain;
using IndustriasDoradas.Desktop.Domain.Production;

namespace IndustriasDoradas.Desktop.Tests.Application;

[TestClass]
public sealed class RevertLastCajuelaAuthorizationTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 5, 18, 0, 0, TimeSpan.Zero);
    private static readonly Guid OrganizationId = Guid.Parse("30000000-0000-4000-8000-000000000001");
    private static readonly Guid PlantId = Guid.Parse("31000000-0000-4000-8000-000000000001");
    private static readonly Guid StationId = Guid.Parse("34000000-0000-4000-8000-000000000001");
    private static readonly Guid LineId = Guid.Parse("32000000-0000-4000-8000-000000000001");
    private static readonly Guid ShipmentId = Guid.Parse("41000000-0000-4000-8000-000000000001");
    private static readonly Guid CycleId = Guid.Parse("44000000-0000-4000-8000-000000000001");
    private static readonly Guid WorkerId = Guid.Parse("45000000-0000-4000-8000-000000000001");
    private static readonly Guid ManagerId = Guid.Parse("20000000-0000-4000-8000-000000000001");

    [TestMethod]
    public async Task OperatorCanCorrectAtFiveMinuteBoundary()
    {
        var repository = new StubRepository(Now.AddMinutes(-5));
        var handler = new RevertLastCajuelaHandler(repository, new FixedTimeProvider());

        PreparedCajuelaReversal prepared = await handler.PrepareAsync(StationId, LineId);
        await handler.ConfirmAsync(prepared);

        ReverseCajuelaMutation mutation = repository.Mutation ??
            throw new AssertFailedException("La corrección no llegó al repositorio.");
        Assert.IsFalse(prepared.RequiresPlantManager);
        Assert.AreEqual("OPERARIO", mutation.CorrectionActorKind);
        Assert.AreEqual(WorkerId, mutation.CorrectionActorId);
        Assert.IsFalse(mutation.RequiresPlantManager);
        Assert.AreEqual(8, mutation.TotalBeforeCorrection);
        Assert.AreEqual(7, mutation.TotalAfterCorrection);
    }

    [TestMethod]
    public async Task OlderCorrectionWithoutPlantManagerModeIsRejected()
    {
        var repository = new StubRepository(Now.AddMinutes(-5).AddTicks(-1));
        var mode = new PlantManagerModeState();
        var handler = new RevertLastCajuelaHandler(
            repository,
            new FixedTimeProvider(),
            managerMode: mode);
        PreparedCajuelaReversal prepared = await handler.PrepareAsync(StationId, LineId);

        await Assert.ThrowsExactlyAsync<UnauthorizedAccessException>(
            () => handler.ConfirmAsync(prepared));

        Assert.IsTrue(prepared.RequiresPlantManager);
        Assert.IsNull(repository.Mutation);
    }

    [TestMethod]
    public async Task OlderCorrectionRequiresAReasonEvenWithPlantManagerMode()
    {
        var repository = new StubRepository(Now.AddMinutes(-6));
        var mode = new PlantManagerModeState();
        mode.SetActive(true);
        var handler = new RevertLastCajuelaHandler(
            repository,
            new FixedTimeProvider(),
            managerMode: mode);
        PreparedCajuelaReversal prepared = await handler.PrepareAsync(StationId, LineId);

        await Assert.ThrowsExactlyAsync<InvalidOperationException>(
            () => handler.ConfirmAsync(prepared, OperationInputOrigin.Application(), "  "));

        Assert.IsNull(repository.Mutation);
    }

    [TestMethod]
    public async Task OlderCorrectionStoresManagerIdentityReasonAndBeforeAfter()
    {
        var repository = new StubRepository(Now.AddMinutes(-6));
        var mode = new PlantManagerModeState();
        mode.SetActive(true);
        var handler = new RevertLastCajuelaHandler(
            repository,
            new FixedTimeProvider(),
            new MemoryStationStore(State()),
            mode);
        PreparedCajuelaReversal prepared = await handler.PrepareAsync(StationId, LineId);

        await handler.ConfirmAsync(
            prepared,
            OperationInputOrigin.Application(),
            "Ajuste confirmado contra conteo físico");

        ReverseCajuelaMutation mutation = repository.Mutation ??
            throw new AssertFailedException("La corrección no llegó al repositorio.");
        Assert.AreEqual("JEFE_PLANTA", mutation.CorrectionActorKind);
        Assert.AreEqual(ManagerId, mutation.CorrectionActorId);
        Assert.AreEqual("Jefe de Planta 1", mutation.CorrectionActorDisplayName);
        Assert.AreEqual("JEFE_PLANTA", mutation.CorrectionActorRoleCode);
        Assert.AreEqual("Ajuste confirmado contra conteo físico", mutation.ReasonDetail);
        Assert.AreEqual(8, mutation.TotalBeforeCorrection);
        Assert.AreEqual(7, mutation.TotalAfterCorrection);
        Assert.IsTrue(mutation.RequiresPlantManager);
    }

    private static ProtectedStationState State() => new(
        new AuthTokens("access", "refresh", Now.AddHours(1)),
        new ApiSession(ManagerId, OrganizationId, "JEFE_PLANTA", Now.AddHours(1), "Jefe de Planta 1"),
        new StationAuthorization(
            StationId,
            PlantId,
            OrganizationId,
            "Estación",
            4,
            "verifier",
            Now.AddHours(-1),
            Now.AddHours(8)),
        [],
        OfflinePinState.Empty);

    private static ProductionEventContext Context() => ProductionEventContext.Create(
        OrganizationId,
        PlantId,
        StationId,
        LineId,
        CycleId,
        ShipmentId,
        WorkerId);

    private sealed class FixedTimeProvider : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => Now;
    }

    private sealed class MemoryStationStore(ProtectedStationState state) : IProtectedStationStore
    {
        public Task SaveAsync(ProtectedStationState value, CancellationToken cancellationToken = default) =>
            Task.CompletedTask;

        public Task<ProtectedStationState?> LoadAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult<ProtectedStationState?>(state);

        public Task CloseSessionAsync(CancellationToken cancellationToken = default) => Task.CompletedTask;
    }

    private sealed class StubRepository(DateTimeOffset recordedAt) : ILocalCajuelaRepository
    {
        private readonly ProductionEvent target = ProductionEvent.CajuelaAdded(
            Guid.Parse("50000000-0000-4000-8000-000000000001"),
            Context(),
            8,
            recordedAt,
            recordedAt);

        public ReverseCajuelaMutation? Mutation { get; private set; }

        public Task<LocalCajuelaRegistration> RegisterAsync(
            RegisterCajuelaMutation mutation,
            CancellationToken cancellationToken = default) => throw new NotSupportedException();

        public Task<int> GetTotalAsync(
            Guid lineId,
            Guid shipmentId,
            CancellationToken cancellationToken = default) => Task.FromResult(8);

        public Task<LocalCajuelaCorrectionTarget> FindCorrectionTargetAsync(
            Guid stationId,
            CancellationToken cancellationToken = default) => Task.FromResult(Target());

        public Task<LocalCajuelaCorrectionTarget> FindCorrectionTargetAsync(
            Guid stationId,
            Guid lineId,
            CancellationToken cancellationToken = default) => Task.FromResult(Target());

        public Task<LocalCajuelaReversal> ReverseAsync(
            ReverseCajuelaMutation mutation,
            CancellationToken cancellationToken = default)
        {
            Mutation = mutation;
            ProductionEvent reversal = ProductionEvent.CajuelaReversed(
                mutation.ReversalEventId,
                Context(),
                9,
                mutation.ConfirmedAt,
                mutation.ConfirmedAt,
                mutation.TargetClientEventId);
            return Task.FromResult(new LocalCajuelaReversal(
                reversal,
                mutation.TargetClientEventId,
                mutation.ReasonCode,
                7,
                false));
        }

        private LocalCajuelaCorrectionTarget Target() => new(
            new LocalOperationalSession(
                StationId,
                OrganizationId,
                PlantId,
                LineId,
                ShipmentId,
                CycleId,
                WorkerId,
                Now.AddHours(-2),
                Now.AddHours(-1),
                LineFeedCycleStatus.Active),
            target,
            8);
    }
}
