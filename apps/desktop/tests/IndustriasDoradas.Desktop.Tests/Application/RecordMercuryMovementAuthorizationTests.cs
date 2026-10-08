using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain;

namespace IndustriasDoradas.Desktop.Tests.Application;

[TestClass]
public sealed class RecordMercuryMovementAuthorizationTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 6, 18, 0, 0, TimeSpan.Zero);
    private static readonly Guid OrganizationId = Guid.Parse("30000000-0000-4000-8000-000000000001");
    private static readonly Guid PlantId = Guid.Parse("31000000-0000-4000-8000-000000000001");
    private static readonly Guid StationId = Guid.Parse("34000000-0000-4000-8000-000000000001");
    private static readonly Guid ShipmentId = Guid.Parse("41000000-0000-4000-8000-000000000001");
    private static readonly Guid RastraId = Guid.Parse("46000000-0000-4000-8000-000000000001");
    private static readonly Guid ManagerId = Guid.Parse("20000000-0000-4000-8000-000000000001");

    [TestMethod]
    public async Task MovementWithoutPlantManagerModeIsRejected()
    {
        var repository = new StubRepository();
        var mode = new PlantManagerModeState();
        var handler = new RecordMercuryMovementHandler(
            repository, new MemoryStationStore(State()), mode, new FixedTimeProvider());

        await Assert.ThrowsExactlyAsync<UnauthorizedAccessException>(() => handler.RecordAsync(
            StationId, ShipmentId, RastraId, MercuryMovementKind.InitialLoad, 400.7m));

        Assert.IsNull(repository.Movement);
    }

    [TestMethod]
    public async Task ElevatedManagerCanRecordZeroAndPendingWithIdentity()
    {
        var repository = new StubRepository();
        var mode = new PlantManagerModeState();
        mode.SetActive(true);
        var handler = new RecordMercuryMovementHandler(
            repository, new MemoryStationStore(State()), mode, new FixedTimeProvider());

        await handler.RecordAsync(
            StationId, ShipmentId, RastraId, MercuryMovementKind.InitialLoad, 0m);

        RecordLocalMercuryMovement movement = repository.Movement ??
            throw new AssertFailedException("El movimiento no llegó al repositorio.");
        Assert.AreEqual(ManagerId, movement.RecordedByProfileId);
        Assert.AreEqual(0m, movement.AmountGrams);
        Assert.AreEqual(Now, movement.OccurredAt);
        Assert.IsTrue(movement.ReplaceCurrent);

        await handler.RecordAsync(
            StationId, ShipmentId, RastraId, MercuryMovementKind.InitialLoad, null);
        Assert.IsNull(repository.Movement!.AmountGrams);
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

    private sealed class StubRepository : ILocalMercuryRepository
    {
        public RecordLocalMercuryMovement? Movement { get; private set; }

        public Task<IReadOnlyList<CachedLineComponent>> ListRastrasAsync(
            Guid organizationId,
            Guid lineId,
            CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<CachedLineComponent>>([]);

        public Task<IReadOnlyList<CachedLineComponent>> ListRastrasForShipmentAsync(
            Guid shipmentId,
            CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<CachedLineComponent>>([]);

        public Task<IReadOnlyList<LocalMercurySweepTarget>> ListSweepsAsync(
            Guid shipmentId,
            CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<LocalMercurySweepTarget>>([]);

        public Task<IReadOnlyList<LocalMercuryMovement>> ListCurrentAsync(
            Guid shipmentId,
            CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<LocalMercuryMovement>>([]);

        public Task<LocalMercuryMovement> RecordAsync(
            RecordLocalMercuryMovement movement,
            CancellationToken cancellationToken = default)
        {
            Movement = movement;
            return Task.FromResult(new LocalMercuryMovement(
                movement.Id,
                movement.ShipmentId,
                Guid.NewGuid(),
                movement.LineComponentId,
                movement.SweepId,
                movement.Kind,
                movement.AmountGrams,
                movement.RecordedByProfileId,
                movement.OccurredAt,
                movement.RecordedAt,
                null,
                movement.Notes));
        }
    }
}
