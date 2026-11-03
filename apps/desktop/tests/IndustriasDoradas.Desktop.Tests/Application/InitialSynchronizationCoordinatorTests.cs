using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Configuration;
using IndustriasDoradas.Desktop.Domain;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Tests.Application;

[TestClass]
public sealed class InitialSynchronizationCoordinatorTests
{
    [TestMethod]
    public async Task LocalCopyAvailabilityDependsOnExistingPullCursor()
    {
        InitialSynchronizationCoordinator available = CreateCoordinator("cursor-existente");
        InitialSynchronizationCoordinator missing = CreateCoordinator(null);

        Assert.IsTrue(await available.HasUsableLocalCopyAsync());
        Assert.IsFalse(await missing.HasUsableLocalCopyAsync());
    }

    [TestMethod]
    public async Task ExistingLocalCopyCanOpenWhilePendingEventsRemainForReview()
    {
        var outbox = new EmptyOutbox();
        var station = new ClosedStationContext();
        var options = Options.Create(new SyncOptions());
        var push = new OutboxSyncProcessor(
            outbox, new UnusedPushApi(), station, TimeProvider.System, new ZeroJitter(), options);
        var changes = new CursorRepository("cursor-existente");
        using var pull = new IncrementalPullProcessor(
            changes,
            new UnusedPullApi(),
            station,
            new SyncStatusNotifier(),
            TimeProvider.System,
            options);
        var coordinator = new InitialSynchronizationCoordinator(
            push,
            pull,
            changes,
            new PendingReadiness(13),
            options);

        InitialSynchronizationResult result = await coordinator.SynchronizeAsync();

        Assert.IsTrue(result.CanContinue);
        Assert.IsFalse(result.IsCurrent);
        StringAssert.Contains(result.Message, "13 cambios locales");
        StringAssert.Contains(result.Message, "Estado");
    }

    private static InitialSynchronizationCoordinator CreateCoordinator(string? cursor)
    {
        var outbox = new EmptyOutbox();
        var station = new ClosedStationContext();
        var options = Options.Create(new SyncOptions());
        var changes = new CursorRepository(cursor);
        return new InitialSynchronizationCoordinator(
            new OutboxSyncProcessor(
                outbox, new UnusedPushApi(), station, TimeProvider.System, new ZeroJitter(), options),
            new IncrementalPullProcessor(
                changes,
                new UnusedPullApi(),
                station,
                new SyncStatusNotifier(),
                TimeProvider.System,
                options),
            changes,
            new PendingReadiness(0),
            options);
    }

    private sealed class PendingReadiness(int pending) : ILocalSynchronizationReadiness
    {
        public Task<LocalSynchronizationQueueState> ReadAsync(
            CancellationToken cancellationToken = default) =>
            Task.FromResult(new LocalSynchronizationQueueState(pending, 0, 0));
    }

    private sealed class CursorRepository(string? cursor) : ILocalSyncChangeRepository
    {
        public Task<string?> GetCursorAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult<string?>(cursor);

        public Task ApplyPageAsync(
            SyncPullPage page,
            CancellationToken cancellationToken = default) => Task.CompletedTask;

        public Task RecordPullFailureAsync(
            string errorCode,
            DateTimeOffset attemptedAt,
            CancellationToken cancellationToken = default) => Task.CompletedTask;
    }

    private sealed class ClosedStationContext : ISyncStationContext
    {
        public Task<ProtectedStationState?> GetActiveAsync(
            CancellationToken cancellationToken = default) =>
            Task.FromResult<ProtectedStationState?>(null);
    }

    private sealed class ZeroJitter : ISyncJitter
    {
        public double NextDouble() => 0;
    }

    private sealed class UnusedPushApi : ISyncApi
    {
        public Task<SyncPushResult> PushAsync(
            SyncPushBatch batch,
            string accessToken,
            CancellationToken cancellationToken = default) =>
            throw new AssertFailedException("La API push no debe invocarse sin una sesión activa.");
    }

    private sealed class UnusedPullApi : ISyncPullApi
    {
        public Task<SyncPullPage> PullAsync(
            Guid organizationId,
            Guid stationId,
            string? cursor,
            int limit,
            string accessToken,
            CancellationToken cancellationToken = default) =>
            throw new AssertFailedException("La API pull no debe invocarse sin una sesión activa.");

        public Task WaitForSignalAsync(
            Guid organizationId,
            Guid stationId,
            string? cursor,
            string accessToken,
            CancellationToken cancellationToken = default) =>
            throw new AssertFailedException("La espera remota no debe invocarse en esta prueba.");
    }

    private sealed class EmptyOutbox : ILocalOutboxRepository
    {
        public Task<IReadOnlyList<StoredOutboxMessage>> ListPendingAsync(
            int limit,
            CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<StoredOutboxMessage>>([]);

        public Task<IReadOnlyList<ClaimedOutboxMessage>> ClaimAsync(
            Guid stationId,
            Guid claimId,
            int limit,
            DateTimeOffset now,
            DateTimeOffset leaseUntil,
            OutboxAuthorizationEvidence authorization,
            CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<ClaimedOutboxMessage>>([]);

        public Task CompleteClaimAsync(
            Guid claimId,
            IReadOnlyList<OutboxItemDisposition> dispositions,
            DateTimeOffset now,
            Func<int, TimeSpan> retryDelay,
            CancellationToken cancellationToken = default) => Task.CompletedTask;

        public Task ReleaseClaimAsync(
            Guid claimId,
            string errorCode,
            int? httpStatus,
            DateTimeOffset now,
            Func<int, TimeSpan> retryDelay,
            bool permanent,
            CancellationToken cancellationToken = default) => Task.CompletedTask;
    }
}
