using IndustriasDoradas.Desktop.Application;
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

public sealed record StartLocalOperationMutation(
    LocalOperationalSession Session,
    Guid SupplierId,
    Guid ResponsibilityAssignmentId,
    PendingOutboxMessage OutboxMessage);

public sealed record RelieveLocalOperationMutation(
    LocalOperationalSession ExpectedSession,
    Guid NextResponsibleWorkerId,
    Guid ResponsibilityAssignmentId,
    DateTimeOffset EffectiveAt,
    PendingOutboxMessage OutboxMessage);

public sealed record CompleteLocalOperationMutation(
    LocalOperationalSession ExpectedSession,
    DateTimeOffset CompletedAt,
    PendingOutboxMessage OutboxMessage);

public sealed record RegisterCajuelaMutation(
    Guid ClientEventId,
    Guid StationId,
    DateTimeOffset OccurredAt,
    DateTimeOffset RecordedAt,
    OperationInputOrigin InputOrigin);

public sealed record LocalCajuelaRegistration(
    ProductionEvent Event,
    int Total,
    bool WasDuplicate);

public sealed record LocalCajuelaCorrectionTarget(
    LocalOperationalSession Session,
    ProductionEvent TargetEvent,
    int Total);

public sealed record ReverseCajuelaMutation(
    Guid ReversalEventId,
    Guid ConfirmationId,
    LocalOperationalSession ExpectedSession,
    Guid TargetClientEventId,
    string ReasonCode,
    DateTimeOffset PreparedAt,
    DateTimeOffset ConfirmedAt,
    OperationInputOrigin InputOrigin);

public sealed record LocalCajuelaReversal(
    ProductionEvent Event,
    Guid TargetClientEventId,
    string ReasonCode,
    int Total,
    bool WasDuplicate);

public sealed record LocalOperationDashboardSnapshot(
    LocalOperationalSession? Session,
    string LineName,
    string? SupplierName,
    DateTimeOffset? ShipmentStartedAt,
    string? ResponsibleName,
    DateTimeOffset? ResponsibleSince,
    string? PreviousResponsibleName,
    DateTimeOffset? PreviousResponsibleUntil,
    int Total,
    int PendingOutboxCount)
{
    public bool IsReady => Session?.Status == LineFeedCycleStatus.Active;
}

public interface ILocalCatalogRepository
{
    Task UpsertSupplierAsync(CachedSupplier supplier, CancellationToken cancellationToken = default);
    Task UpsertWorkerAsync(CachedWorker worker, CancellationToken cancellationToken = default);
    Task UpsertLineAsync(CachedProductionLine line, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<CachedSupplier>> ListActiveSuppliersAsync(
        Guid organizationId,
        CancellationToken cancellationToken = default);
    Task<IReadOnlyList<CachedWorker>> ListActiveWorkersAsync(
        Guid organizationId,
        CancellationToken cancellationToken = default);
    Task<IReadOnlyList<CachedProductionLine>> ListActiveLinesAsync(
        Guid organizationId,
        Guid plantId,
        CancellationToken cancellationToken = default);

    Task<CachedSupplier?> FindSupplierAsync(Guid supplierId, CancellationToken cancellationToken = default);
    Task<CachedWorker?> FindWorkerAsync(Guid workerId, CancellationToken cancellationToken = default);
    Task<CachedProductionLine?> FindLineAsync(Guid lineId, CancellationToken cancellationToken = default);
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

public interface ILocalOperationRepository
{
    Task StartAsync(StartLocalOperationMutation mutation, CancellationToken cancellationToken = default);
    Task RelieveAsync(RelieveLocalOperationMutation mutation, CancellationToken cancellationToken = default);
    Task CompleteAsync(CompleteLocalOperationMutation mutation, CancellationToken cancellationToken = default);
}

public interface ILocalCajuelaRepository
{
    Task<LocalCajuelaRegistration> RegisterAsync(
        RegisterCajuelaMutation mutation,
        CancellationToken cancellationToken = default);

    Task<int> GetTotalAsync(
        Guid lineId,
        Guid shipmentId,
        CancellationToken cancellationToken = default);

    Task<LocalCajuelaCorrectionTarget> FindCorrectionTargetAsync(
        Guid stationId,
        CancellationToken cancellationToken = default);

    Task<LocalCajuelaReversal> ReverseAsync(
        ReverseCajuelaMutation mutation,
        CancellationToken cancellationToken = default);
}

public interface ILocalOperationDashboardRepository
{
    Task<LocalOperationDashboardSnapshot> GetAsync(
        Guid stationId,
        CancellationToken cancellationToken = default);
}

public interface ILocalDatabaseDiagnostics
{
    Task<LocalDatabaseHealth> InspectAsync(CancellationToken cancellationToken = default);

    Task<string> CreateConsistentCopyAsync(
        string destinationDirectory,
        CancellationToken cancellationToken = default);
}

public enum LocalDatabaseHealthState
{
    Healthy,
    Attention,
    Unavailable,
}

public enum LocalDatabaseHealthIssue
{
    None,
    LowDiskSpace,
    ClockRollback,
    Locked,
    DiskFull,
    Corrupt,
    Unavailable,
    Unknown,
}

public sealed record LocalDatabaseHealth(
    LocalDatabaseHealthState State,
    LocalDatabaseHealthIssue Issue,
    int PendingOutboxCount,
    long AvailableFreeBytes,
    DateTimeOffset? LatestRecordedAt,
    DateTimeOffset CheckedAt,
    string Summary,
    string RecoveryInstruction);
