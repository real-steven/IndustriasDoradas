using System.Text.Json;
using IndustriasDoradas.Desktop.Domain;

namespace IndustriasDoradas.Desktop.Application.Abstractions;

public sealed record SyncPushItem(
    Guid OutboxMessageId,
    long StationSequence,
    string OperationType,
    string AggregateType,
    Guid AggregateId,
    int PayloadSchemaVersion,
    DateTimeOffset CreatedAtUtc,
    OutboxAuthorizationEvidence Authorization,
    JsonElement Payload);

public sealed record SyncPushBatch(
    Guid BatchId,
    Guid OrganizationId,
    Guid PlantId,
    Guid StationId,
    DateTimeOffset SentAtUtc,
    IReadOnlyList<SyncPushItem> Items);

public sealed record SyncPushItemResult(
    Guid OutboxMessageId,
    long StationSequence,
    string Status,
    string Code,
    Guid? ReceiptId,
    DateTimeOffset ProcessedAtUtc);

public sealed record SyncPushResult(
    int ContractVersion,
    Guid BatchId,
    DateTimeOffset ServerReceivedAtUtc,
    DateTimeOffset ServerCompletedAtUtc,
    IReadOnlyList<SyncPushItemResult> Results);

public interface ISyncApi
{
    Task<SyncPushResult> PushAsync(
        SyncPushBatch batch,
        string accessToken,
        CancellationToken cancellationToken = default);
}

public sealed record SyncChange(
    Guid ChangeId,
    long ServerSequence,
    string EntityType,
    Guid EntityId,
    long EntityVersion,
    string Action,
    DateTimeOffset ChangedAtUtc,
    int PayloadSchemaVersion,
    JsonElement Payload);

public sealed record SyncPullPage(
    int ContractVersion,
    string? RequestedCursor,
    string NextCursor,
    bool HasMore,
    DateTimeOffset ServerTimeUtc,
    IReadOnlyList<SyncChange> Changes);

public interface ISyncPullApi
{
    Task<SyncPullPage> PullAsync(
        Guid organizationId,
        Guid stationId,
        string? cursor,
        int limit,
        string accessToken,
        CancellationToken cancellationToken = default);
    Task WaitForSignalAsync(
        Guid organizationId,
        Guid stationId,
        string? cursor,
        string accessToken,
        CancellationToken cancellationToken = default);
}

public sealed class SyncTransportException(
    string code,
    bool isTransient,
    int? httpStatus = null,
    Exception? innerException = null)
    : Exception("No se pudo completar el transporte de sincronización.", innerException)
{
    public string Code { get; } = code;
    public bool IsTransient { get; } = isTransient;
    public int? HttpStatus { get; } = httpStatus;
}

public interface ISyncJitter
{
    double NextDouble();
}

public interface ISyncStationContext
{
    Task<ProtectedStationState?> GetActiveAsync(CancellationToken cancellationToken = default);
}

public sealed record SyncStatusNotification(bool HasAdministrativeCorrection);

public interface ISyncStatusNotifier
{
    event EventHandler<SyncStatusNotification>? Changed;

    void Notify(SyncStatusNotification notification);
}
