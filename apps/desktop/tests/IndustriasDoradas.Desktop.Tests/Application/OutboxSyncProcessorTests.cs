using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Configuration;
using IndustriasDoradas.Desktop.Domain;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Tests.Application;

[TestClass]
public sealed class OutboxSyncProcessorTests
{
    private static readonly DateTimeOffset Now = new(2026, 9, 19, 18, 0, 0, TimeSpan.Zero);
    private static readonly Guid OrganizationId = Guid.Parse("30000000-0000-4000-8000-000000000001");
    private static readonly Guid PlantId = Guid.Parse("31000000-0000-4000-8000-000000000001");
    private static readonly Guid StationId = Guid.Parse("34000000-0000-4000-8000-000000000001");
    private static readonly Guid ProfileId = Guid.Parse("a1000000-0000-4000-8000-000000000002");

    [TestMethod]
    public async Task SuccessfulBatchAppliesPerItemResultsAndPreservesOrder()
    {
        var outbox = new StubOutbox([Claimed(1), Claimed(2)]);
        Guid receipt = Guid.NewGuid();
        var api = new StubSyncApi(batch => new SyncPushResult(
            1,
            batch.BatchId,
            Now,
            Now,
            [
                new(batch.Items[0].OutboxMessageId, 1, "APPLIED", "APPLIED", receipt, Now),
                new(batch.Items[1].OutboxMessageId, 2, "RETRY_LATER", "DEPENDENCY_NOT_READY", null, Now),
            ]));
        OutboxSyncProcessor processor = Create(outbox, api);

        Assert.IsTrue(await processor.ProcessOnceAsync());

        Assert.AreEqual(1, api.CallCount);
        Assert.AreEqual(2, api.LastBatch!.Items.Count);
        Assert.AreEqual(ProfileId, api.LastBatch.Items[0].Authorization.ActorProfileId);
        Assert.AreEqual("APPLIED", outbox.Completed![0].Status);
        Assert.AreEqual("RETRY_LATER", outbox.Completed[1].Status);
        Assert.IsNull(outbox.Release);
    }

    [TestMethod]
    public async Task TransientTransportFailureReturnsWholeClaimToPendingWithBackoff()
    {
        var outbox = new StubOutbox([Claimed(1, attemptCount: 3)]);
        var api = new StubSyncApi(_ => throw new SyncTransportException(
            "SERVER_TEMPORARY_FAILURE", true, 503));
        OutboxSyncProcessor processor = Create(outbox, api, jitter: 0.5);

        await processor.ProcessOnceAsync();

        Assert.IsNotNull(outbox.Release);
        Assert.IsFalse(outbox.Release.Value.Permanent);
        Assert.AreEqual(503, outbox.Release.Value.HttpStatus);
        Assert.AreEqual(TimeSpan.FromSeconds(9), outbox.Release.Value.Delay);
    }

    [TestMethod]
    public async Task PermanentHttpRejectionMovesWholeClaimToReview()
    {
        var outbox = new StubOutbox([Claimed(1)]);
        var api = new StubSyncApi(_ => throw new SyncTransportException(
            "HTTP_CLIENT_REJECTION", false, 400));

        await Create(outbox, api).ProcessOnceAsync();

        Assert.IsTrue(outbox.Release!.Value.Permanent);
        Assert.AreEqual("HTTP_CLIENT_REJECTION", outbox.Release.Value.Code);
    }

    [TestMethod]
    public async Task ClosedOrMissingStationDoesNotClaimMessages()
    {
        var outbox = new StubOutbox([Claimed(1)]);
        var api = new StubSyncApi(_ => throw new AssertFailedException("The API must not be called."));
        var processor = new OutboxSyncProcessor(
            outbox,
            api,
            new StubStationContext(null),
            new FixedTimeProvider(),
            new FixedJitter(0),
            Options.Create(OptionsValue()));

        Assert.IsFalse(await processor.ProcessOnceAsync());
        Assert.AreEqual(0, outbox.ClaimCount);
    }

    private static OutboxSyncProcessor Create(
        StubOutbox outbox,
        StubSyncApi api,
        double jitter = 0) =>
        new(
            outbox,
            api,
            new StubStationContext(State()),
            new FixedTimeProvider(),
            new FixedJitter(jitter),
            Options.Create(OptionsValue()));

    private static SyncOptions OptionsValue() => new()
    {
        BatchSize = 10,
        LeaseSeconds = 60,
        BaseRetrySeconds = 2,
        MaximumRetrySeconds = 300,
        JitterRatio = 0.25,
    };

    private static ProtectedStationState State() => new(
        new AuthTokens("access", "refresh", Now.AddHours(1)),
        new ApiSession(ProfileId, OrganizationId, "JEFE_PLANTA", Now.AddHours(1)),
        new StationAuthorization(
            StationId, PlantId, OrganizationId, "Estación", 4, "verifier",
            Now.AddHours(-1), Now.AddHours(24)),
        [],
        OfflinePinState.Empty);

    private static ClaimedOutboxMessage Claimed(long sequence, int attemptCount = 1)
    {
        Guid id = Guid.Parse($"50000000-0000-4000-8000-{sequence:D12}");
        return new ClaimedOutboxMessage(
            new PendingOutboxMessage(
                id,
                "PRODUCTION_EVENT_CREATED",
                "production_event",
                id,
                "{\"schemaVersion\":2}",
                Now),
            sequence,
            attemptCount,
            new OutboxAuthorizationEvidence(ProfileId, 4, Now.AddHours(-1), Now.AddHours(24), "VALID"));
    }

    private sealed class StubStationContext(ProtectedStationState? state) : ISyncStationContext
    {
        public Task<ProtectedStationState?> GetActiveAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(state);
    }

    private sealed class StubSyncApi(Func<SyncPushBatch, SyncPushResult> response) : ISyncApi
    {
        public int CallCount { get; private set; }
        public SyncPushBatch? LastBatch { get; private set; }

        public Task<SyncPushResult> PushAsync(
            SyncPushBatch batch,
            string accessToken,
            CancellationToken cancellationToken = default)
        {
            CallCount++;
            LastBatch = batch;
            return Task.FromResult(response(batch));
        }
    }

    private sealed class StubOutbox(IReadOnlyList<ClaimedOutboxMessage> claimed) : ILocalOutboxRepository
    {
        public int ClaimCount { get; private set; }
        public IReadOnlyList<OutboxItemDisposition>? Completed { get; private set; }
        public (string Code, int? HttpStatus, bool Permanent, TimeSpan Delay)? Release { get; private set; }

        public Task<IReadOnlyList<StoredOutboxMessage>> ListPendingAsync(
            int limit, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<StoredOutboxMessage>>([]);

        public Task<IReadOnlyList<ClaimedOutboxMessage>> ClaimAsync(
            Guid stationId, Guid claimId, int limit, DateTimeOffset now, DateTimeOffset leaseUntil,
            OutboxAuthorizationEvidence authorization, CancellationToken cancellationToken = default)
        {
            ClaimCount++;
            return Task.FromResult(claimed);
        }

        public Task CompleteClaimAsync(
            Guid claimId, IReadOnlyList<OutboxItemDisposition> dispositions, DateTimeOffset now,
            Func<int, TimeSpan> retryDelay, CancellationToken cancellationToken = default)
        {
            Completed = dispositions;
            return Task.CompletedTask;
        }

        public Task ReleaseClaimAsync(
            Guid claimId, string errorCode, int? httpStatus, DateTimeOffset now,
            Func<int, TimeSpan> retryDelay, bool permanent, CancellationToken cancellationToken = default)
        {
            Release = (errorCode, httpStatus, permanent, retryDelay(claimed[0].AttemptCount));
            return Task.CompletedTask;
        }
    }

    private sealed class FixedTimeProvider : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => Now;
    }

    private sealed class FixedJitter(double value) : ISyncJitter
    {
        public double NextDouble() => value;
    }
}
