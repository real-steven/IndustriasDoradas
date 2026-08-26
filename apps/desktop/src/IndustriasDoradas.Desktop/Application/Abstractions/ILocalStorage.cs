using IndustriasDoradas.Desktop.Domain.Production;

namespace IndustriasDoradas.Desktop.Application.Abstractions;

public sealed record CachedSupplier(
    Guid Id,
    Guid OrganizationId,
    string Name,
    bool IsActive,
    DateTimeOffset UpdatedAt);

public sealed record CachedWorker(
    Guid Id,
    Guid OrganizationId,
    string Name,
    bool IsActive,
    DateTimeOffset UpdatedAt);

public sealed record CachedProductionLine(
    Guid Id,
    Guid OrganizationId,
    Guid PlantId,
    string Name,
    bool IsActive,
    DateTimeOffset UpdatedAt);

public sealed record CachedShipment(
    Guid Id,
    Guid OrganizationId,
    Guid SupplierId,
    Guid LineId,
    Guid FeedCycleId,
    DateTimeOffset StartedAt,
    DateTimeOffset? CompletedAt,
    LineFeedCycleStatus Status);

public sealed record LocalOperationalSession(
    Guid StationId,
    Guid OrganizationId,
    Guid PlantId,
    Guid LineId,
    Guid ShipmentId,
    Guid FeedCycleId,
    Guid ResponsibleWorkerId,
    DateTimeOffset StartedAt,
    DateTimeOffset UpdatedAt,
    LineFeedCycleStatus Status);

public sealed record PendingOutboxMessage(
    Guid Id,
    string OperationType,
    string AggregateType,
    Guid AggregateId,
    string PayloadJson,
    DateTimeOffset CreatedAt);

public sealed record StoredOutboxMessage(
    PendingOutboxMessage Message,
    int AttemptCount,
    DateTimeOffset? NextAttemptAt);

public interface ILocalCatalogRepository
{
    Task UpsertSupplierAsync(CachedSupplier supplier, CancellationToken cancellationToken = default);
    Task UpsertWorkerAsync(CachedWorker worker, CancellationToken cancellationToken = default);
    Task UpsertLineAsync(CachedProductionLine line, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<CachedSupplier>> ListActiveSuppliersAsync(
        Guid organizationId,
        CancellationToken cancellationToken = default);
}

public interface ILocalShipmentRepository
{
    Task UpsertAsync(CachedShipment shipment, CancellationToken cancellationToken = default);
}

public interface ILocalOperationalSessionRepository
{
    Task SaveAsync(LocalOperationalSession session, CancellationToken cancellationToken = default);
    Task<LocalOperationalSession?> LoadAsync(Guid stationId, CancellationToken cancellationToken = default);
}

public interface ILocalProductionEventRepository
{
    Task AppendWithOutboxAsync(
        ProductionEvent productionEvent,
        PendingOutboxMessage outboxMessage,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<ProductionEvent>> ListAsync(
        Guid lineId,
        Guid shipmentId,
        CancellationToken cancellationToken = default);
}

public interface ILocalOutboxRepository
{
    Task<IReadOnlyList<StoredOutboxMessage>> ListPendingAsync(
        int limit,
        CancellationToken cancellationToken = default);
}

public interface ILocalDatabaseDiagnostics
{
    Task<string> CreateConsistentCopyAsync(
        string destinationDirectory,
        CancellationToken cancellationToken = default);
}
