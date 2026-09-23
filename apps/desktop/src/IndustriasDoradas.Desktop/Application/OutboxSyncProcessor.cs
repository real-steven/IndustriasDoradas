using System.Text.Json;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Configuration;
using IndustriasDoradas.Desktop.Domain;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Application;

public sealed class OutboxSyncProcessor(
    ILocalOutboxRepository outbox,
    ISyncApi api,
    ISyncStationContext stationContext,
    TimeProvider timeProvider,
    ISyncJitter jitter,
    IOptions<SyncOptions> syncOptions)
{
    private readonly SyncOptions options = syncOptions.Value;

    public async Task<bool> ProcessOnceAsync(CancellationToken cancellationToken = default)
    {
        ProtectedStationState? state = await stationContext.GetActiveAsync(cancellationToken).ConfigureAwait(false);
        if (state is null || string.IsNullOrWhiteSpace(state.Tokens.AccessToken)) return false;

        DateTimeOffset now = timeProvider.GetUtcNow();
        Guid claimId = Guid.NewGuid();
        var evidence = new OutboxAuthorizationEvidence(
            state.Session.ProfileId,
            state.Authorization.PermissionVersion,
            state.Authorization.ValidatedAt,
            state.Authorization.OfflineValidUntil,
            "LEGACY_UNAVAILABLE");
        IReadOnlyList<ClaimedOutboxMessage> claimed = await outbox.ClaimAsync(
            state.Authorization.StationId,
            claimId,
            options.BatchSize,
            now,
            now.AddSeconds(options.LeaseSeconds),
            evidence,
            cancellationToken).ConfigureAwait(false);
        if (claimed.Count == 0) return false;

        var validItems = new List<SyncPushItem>();
        var localFailures = new List<OutboxItemDisposition>();
        foreach (ClaimedOutboxMessage message in claimed)
        {
            try
            {
                using JsonDocument document = JsonDocument.Parse(message.Message.PayloadJson);
                JsonElement payload = document.RootElement;
                if (payload.ValueKind != JsonValueKind.Object ||
                    !payload.TryGetProperty("schemaVersion", out JsonElement schema) ||
                    !schema.TryGetInt32(out int schemaVersion) || schemaVersion < 1)
                    throw new JsonException("Payload schema version missing.");
                validItems.Add(new SyncPushItem(
                    message.Message.Id,
                    message.StationSequence,
                    message.Message.OperationType,
                    message.Message.AggregateType,
                    message.Message.AggregateId,
                    schemaVersion,
                    message.Message.CreatedAt,
                    message.Authorization,
                    payload.Clone()));
            }
            catch (JsonException)
            {
                localFailures.Add(new OutboxItemDisposition(
                    message.Message.Id, "FAILED_REVIEW", "INVALID_LOCAL_PAYLOAD", null));
            }
        }

        if (validItems.Count == 0)
        {
            await outbox.CompleteClaimAsync(claimId, localFailures, now, RetryDelay, cancellationToken)
                .ConfigureAwait(false);
            return true;
        }

        var batch = new SyncPushBatch(
            Guid.NewGuid(),
            state.Authorization.OrganizationId,
            state.Authorization.PlantId,
            state.Authorization.StationId,
            now,
            validItems);
        try
        {
            SyncPushResult response = await api.PushAsync(batch, state.Tokens.AccessToken, cancellationToken)
                .ConfigureAwait(false);
            Dictionary<Guid, SyncPushItem> expected = validItems.ToDictionary(item => item.OutboxMessageId);
            OutboxItemDisposition[] remote = response.Results
                .Where(result => expected.TryGetValue(result.OutboxMessageId, out SyncPushItem? item) &&
                    item.StationSequence == result.StationSequence)
                .GroupBy(result => result.OutboxMessageId)
                .Where(group => group.Count() == 1)
                .Select(group => group.Single())
                .Select(result => new OutboxItemDisposition(
                    result.OutboxMessageId,
                    result.Status,
                    result.Code,
                    result.ReceiptId))
                .ToArray();
            await outbox.CompleteClaimAsync(
                claimId, [.. localFailures, .. remote], timeProvider.GetUtcNow(), RetryDelay, cancellationToken)
                .ConfigureAwait(false);
        }
        catch (SyncTransportException exception)
        {
            await outbox.ReleaseClaimAsync(
                claimId,
                exception.Code,
                exception.HttpStatus,
                timeProvider.GetUtcNow(),
                RetryDelay,
                permanent: !exception.IsTransient,
                cancellationToken).ConfigureAwait(false);
        }
        return true;
    }

    internal TimeSpan RetryDelay(int attemptCount)
    {
        int exponent = Math.Clamp(attemptCount - 1, 0, 20);
        double uncapped = options.BaseRetrySeconds * Math.Pow(2, exponent);
        double baseSeconds = Math.Min(options.MaximumRetrySeconds, uncapped);
        double jitterSeconds = baseSeconds * options.JitterRatio * jitter.NextDouble();
        return TimeSpan.FromSeconds(Math.Min(options.MaximumRetrySeconds, baseSeconds + jitterSeconds));
    }
}
