using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain;
using IndustriasDoradas.Desktop.Domain.Production;

namespace IndustriasDoradas.Desktop.Tests.Application;

[TestClass]
[TestCategory("SyncChaos")]
public sealed class ContingencyAuthorizationTests
{
    private static readonly DateTimeOffset Now = new(2026, 9, 22, 18, 0, 0, TimeSpan.Zero);
    private static readonly Guid OrganizationId = Guid.Parse("30000000-0000-4000-8000-000000000001");
    private static readonly Guid PlantId = Guid.Parse("31000000-0000-4000-8000-000000000001");
    private static readonly Guid StationId = Guid.Parse("34000000-0000-4000-8000-000000000001");
    private static readonly Guid LineId = Guid.Parse("32000000-0000-4000-8000-000000000001");
    private static readonly Guid ShipmentId = Guid.Parse("41000000-0000-4000-8000-000000000001");
    private static readonly Guid CycleId = Guid.Parse("44000000-0000-4000-8000-000000000001");
    private static readonly Guid WorkerId = Guid.Parse("45000000-0000-4000-8000-000000000001");
    private static readonly Guid ProfileId = Guid.Parse("a1000000-0000-4000-8000-000000000002");

    [TestMethod]
    public async Task CajuelaAndImmediateReversalAfterTwentyFourHoursKeepExpiredEvidence()
    {
        var repository = new StubCajuelaRepository();
        var time = new FixedTimeProvider();
        var store = new MemoryStationStore(State());
        var register = new RegisterCajuelaHandler(repository, time, store);
        var reverse = new RevertLastCajuelaHandler(repository, time, store);

        await register.ExecuteAsync(register.CreateCommand(StationId));
        PreparedCajuelaReversal prepared = await reverse.PrepareAsync(StationId);
        await reverse.ConfirmAsync(prepared);

        Assert.AreEqual("EXPIRED_CONTINGENCY", repository.RegisterMutation!.Authorization!.StateAtCapture);
        Assert.AreEqual("EXPIRED_CONTINGENCY", repository.ReverseMutation!.Authorization!.StateAtCapture);
        Assert.AreEqual(ProfileId, repository.RegisterMutation.Authorization.ActorProfileId);
        Assert.AreEqual(7, repository.ReverseMutation.Authorization.PermissionVersion);
    }

    [TestMethod]
    public async Task ExpiredContingencyRejectsPrivilegedOperationChanges()
    {
        var service = new LocalOperationService(null!, null!, null!, new FixedTimeProvider());
        OperationAuthority authority = OperationAuthority.From(State());

        await Assert.ThrowsExactlyAsync<UnauthorizedAccessException>(() => service.PrepareStartAsync(
            LineId,
            Guid.NewGuid(),
            WorkerId,
            authority));
    }

    private static ProtectedStationState State() => new(
        new AuthTokens("access", "refresh", Now.AddHours(-1)),
        new ApiSession(ProfileId, OrganizationId, "JEFE_PLANTA", Now.AddHours(-1)),
        new StationAuthorization(
            StationId,
            PlantId,
            OrganizationId,
            "Estación",
            7,
            "verifier",
            Now.AddHours(-25),
            Now.AddHours(-1)),
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

    private sealed class StubCajuelaRepository : ILocalCajuelaRepository
    {
        private readonly ProductionEvent target = ProductionEvent.CajuelaAdded(
            Guid.Parse("50000000-0000-4000-8000-000000000001"),
            Context(),
            1,
            Now.AddMinutes(-2),
            Now.AddMinutes(-2));

        public RegisterCajuelaMutation? RegisterMutation { get; private set; }
        public ReverseCajuelaMutation? ReverseMutation { get; private set; }

        public Task<LocalCajuelaRegistration> RegisterAsync(
            RegisterCajuelaMutation mutation,
            CancellationToken cancellationToken = default)
        {
            RegisterMutation = mutation;
            ProductionEvent productionEvent = ProductionEvent.CajuelaAdded(
                mutation.ClientEventId,
                Context(),
                2,
                mutation.OccurredAt,
                mutation.RecordedAt);
            return Task.FromResult(new LocalCajuelaRegistration(productionEvent, 2, false));
        }

        public Task<int> GetTotalAsync(
            Guid lineId,
            Guid shipmentId,
            CancellationToken cancellationToken = default) => Task.FromResult(1);

        public Task<LocalCajuelaCorrectionTarget> FindCorrectionTargetAsync(
            Guid stationId,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(Target());

        public Task<LocalCajuelaCorrectionTarget> FindCorrectionTargetAsync(
            Guid stationId,
            Guid lineId,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(Target());

        public Task<LocalCajuelaReversal> ReverseAsync(
            ReverseCajuelaMutation mutation,
            CancellationToken cancellationToken = default)
        {
            ReverseMutation = mutation;
            ProductionEvent productionEvent = ProductionEvent.CajuelaReversed(
                mutation.ReversalEventId,
                Context(),
                3,
                mutation.ConfirmedAt,
                mutation.ConfirmedAt,
                mutation.TargetClientEventId);
            return Task.FromResult(new LocalCajuelaReversal(
                productionEvent,
                mutation.TargetClientEventId,
                mutation.ReasonCode,
                0,
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
                Now.AddMinutes(-2),
                LineFeedCycleStatus.Active),
            target,
            1);
    }
}
