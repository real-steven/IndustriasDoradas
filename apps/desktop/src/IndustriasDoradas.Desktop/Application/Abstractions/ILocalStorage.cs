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

public sealed record CachedLineComponent(
    Guid Id,
    Guid OrganizationId,
    Guid LineId,
    string Code,
    string Name,
    int DisplayOrder,
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
    DateTimeOffset CreatedAt,
    OutboxAuthorizationEvidence? Authorization = null);

public sealed record StoredOutboxMessage(
    PendingOutboxMessage Message,
    int AttemptCount,
    DateTimeOffset? NextAttemptAt);

public sealed record OutboxAuthorizationEvidence(
    Guid ActorProfileId,
    int PermissionVersion,
    DateTimeOffset ValidatedAt,
    DateTimeOffset OfflineValidUntil,
    string StateAtCapture);

public sealed record ClaimedOutboxMessage(
    PendingOutboxMessage Message,
    long StationSequence,
    int AttemptCount,
    OutboxAuthorizationEvidence Authorization);

public sealed record OutboxItemDisposition(
    Guid OutboxMessageId,
    string Status,
    string Code,
    Guid? ReceiptId,
    int? HttpStatus = null);

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
    OperationInputOrigin InputOrigin,
    Guid? LineId = null,
    OutboxAuthorizationEvidence? Authorization = null);

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
    OperationInputOrigin InputOrigin,
    OutboxAuthorizationEvidence? Authorization = null,
    string CorrectionActorKind = "OPERARIO",
    Guid? CorrectionActorId = null,
    string? CorrectionActorDisplayName = null,
    string? CorrectionActorRoleCode = null,
    string? ReasonDetail = null,
    int? TotalBeforeCorrection = null,
    int? TotalAfterCorrection = null,
    bool RequiresPlantManager = false);

public sealed record LocalCajuelaReversal(
    ProductionEvent Event,
    Guid TargetClientEventId,
    string ReasonCode,
    int Total,
    bool WasDuplicate);

public sealed record LocalSweepPreparation(
    LocalOperationalSession Session,
    IReadOnlyList<ProductionEvent> UnsweptEvents,
    int TotalCajuelas,
    int LastSweepCumulativeTotal);

public sealed record LocalSweepRegistration(
    ProductionSweep Sweep,
    int CumulativeSweptTotal,
    bool WasDuplicate);

public enum MercuryMovementKind
{
    InitialLoad,
    Reload,
    Recovery,
    SweepInput,
    SweepRemainder,
}

public sealed record LocalMercurySweepTarget(
    Guid Id,
    Guid ShipmentId,
    int CajuelaCount,
    DateTimeOffset SweptAt,
    bool IsFinal);

public sealed record RecordLocalMercuryMovement(
    Guid Id,
    Guid StationId,
    Guid ShipmentId,
    Guid LineComponentId,
    Guid? SweepId,
    MercuryMovementKind Kind,
    decimal? AmountGrams,
    Guid RecordedByProfileId,
    DateTimeOffset OccurredAt,
    DateTimeOffset RecordedAt,
    bool ReplaceCurrent,
    string? Notes = null);

public sealed record LocalMercuryMovement(
    Guid Id,
    Guid ShipmentId,
    Guid LineId,
    Guid LineComponentId,
    Guid? SweepId,
    MercuryMovementKind Kind,
    decimal? AmountGrams,
    Guid RecordedByProfileId,
    DateTimeOffset OccurredAt,
    DateTimeOffset RecordedAt,
    Guid? SupersedesMovementId,
    string? Notes);

public sealed record LocalResponsibilityAudit(
    Guid WorkerId,
    string WorkerName,
    DateTimeOffset AssignedAt,
    DateTimeOffset? UnassignedAt);

public sealed record LocalCompletedShipmentAudit(
    Guid ShipmentId,
    Guid LineId,
    string LineName,
    string SupplierName,
    DateTimeOffset StartedAt,
    DateTimeOffset CompletedAt,
    int TotalCajuelas,
    int SweepCount,
    int SweptCajuelas,
    int CorrectionCount,
      int MercuryRecordedSweepCount,
    IReadOnlyList<LocalResponsibilityAudit> Responsibilities);

public sealed record LocalCajuelaCorrectionAudit(
    Guid ReversalEventId,
    Guid ShipmentId,
    string LineName,
    string ActorName,
    string ActorRole,
    string Reason,
    int? TotalBefore,
    int? TotalAfter,
    DateTimeOffset ConfirmedAt,
    bool RequiredPlantManager);

public sealed record LocalOperationDashboardSnapshot(
    LocalOperationalSession? Session,
    Guid LineId,
    string LineName,
    string? SupplierName,
    DateTimeOffset? ShipmentStartedAt,
    string? ResponsibleName,
    DateTimeOffset? ResponsibleSince,
    string? PreviousResponsibleName,
    DateTimeOffset? PreviousResponsibleUntil,
    int Total,
    int PendingOutboxCount,
    int FailedReviewOutboxCount = 0,
    int SyncedOutboxCount = 0,
    int LastSweepCumulativeTotal = 0,
    int SweepCount = 0)
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
        Guid stationId,
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
    Task<LocalOperationalSession?> LoadAsync(
        Guid stationId,
        Guid lineId,
        CancellationToken cancellationToken = default);
    Task<IReadOnlyList<LocalOperationalSession>> ListActiveAsync(
        Guid stationId,
        CancellationToken cancellationToken = default);
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

    Task<IReadOnlyList<ClaimedOutboxMessage>> ClaimAsync(
        Guid stationId,
        Guid claimId,
        int limit,
        DateTimeOffset now,
        DateTimeOffset leaseUntil,
        OutboxAuthorizationEvidence authorization,
        CancellationToken cancellationToken = default);

    Task CompleteClaimAsync(
        Guid claimId,
        IReadOnlyList<OutboxItemDisposition> dispositions,
        DateTimeOffset now,
        Func<int, TimeSpan> retryDelay,
        CancellationToken cancellationToken = default);

    Task ReleaseClaimAsync(
        Guid claimId,
        string errorCode,
        int? httpStatus,
        DateTimeOffset now,
        Func<int, TimeSpan> retryDelay,
        bool permanent,
        CancellationToken cancellationToken = default);
}

public interface ILocalStationSequenceStore
{
    Task EnsureNextAsync(
        Guid stationId,
        long nextSequence,
        DateTimeOffset updatedAt,
        CancellationToken cancellationToken = default);
}

public interface ILocalSyncChangeRepository
{
    Task<string?> GetCursorAsync(CancellationToken cancellationToken = default);
    Task ApplyPageAsync(SyncPullPage page, CancellationToken cancellationToken = default);
    Task RecordPullFailureAsync(
        string errorCode,
        DateTimeOffset attemptedAt,
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
    Task<LocalCajuelaCorrectionTarget> FindCorrectionTargetAsync(
        Guid stationId,
        Guid lineId,
        CancellationToken cancellationToken = default);

    Task<LocalCajuelaReversal> ReverseAsync(
        ReverseCajuelaMutation mutation,
        CancellationToken cancellationToken = default);
}

public interface ILocalAuditRepository
{
    Task<IReadOnlyList<LocalCompletedShipmentAudit>> ListCompletedShipmentsAsync(
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<LocalCajuelaCorrectionAudit>> ListCajuelaCorrectionsAsync(
        CancellationToken cancellationToken = default);
}

public interface ILocalProductionSweepRepository
{
    Task<LocalSweepPreparation> PrepareAsync(
        Guid stationId,
        Guid lineId,
        CancellationToken cancellationToken = default);

    Task<LocalSweepRegistration> RecordAsync(
        ProductionSweep sweep,
        CancellationToken cancellationToken = default);
}

public interface ILocalMercuryRepository
{
    Task<IReadOnlyList<CachedLineComponent>> ListRastrasAsync(
        Guid organizationId,
        Guid lineId,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<CachedLineComponent>> ListRastrasForShipmentAsync(
        Guid shipmentId,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<LocalMercurySweepTarget>> ListSweepsAsync(
        Guid shipmentId,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<LocalMercuryMovement>> ListCurrentAsync(
        Guid shipmentId,
        CancellationToken cancellationToken = default);

    Task<LocalMercuryMovement> RecordAsync(
        RecordLocalMercuryMovement movement,
        CancellationToken cancellationToken = default);
}

public interface ILocalOperationDashboardRepository
{
    Task<LocalOperationDashboardSnapshot> GetAsync(
        Guid stationId,
        CancellationToken cancellationToken = default);
    Task<IReadOnlyList<LocalOperationDashboardSnapshot>> ListAsync(
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
    string RecoveryInstruction,
    int FailedReviewOutboxCount = 0,
    int SyncedOutboxCount = 0,
    DateTimeOffset? LastSynchronizationAt = null,
    double? ClockDeviationSeconds = null,
    IReadOnlyList<SyncFailureDiagnostic>? Failures = null,
    IReadOnlyList<AdministrativeCorrectionDiagnostic>? Corrections = null,
    int PullReviewCount = 0,
    string SyncNetworkState = "UNKNOWN",
    string? LastSyncErrorCode = null);

public sealed record SyncFailureDiagnostic(
    string OperationType,
    string ErrorCode,
    string Cause,
    int AttemptCount,
    DateTimeOffset OccurredAt,
    DateTimeOffset LastAttemptAt)
{
    public string OperationDescription => OperationType switch
    {
        "OPERATION_STARTED" => "Inicio de cargamento",
        "OPERATION_COMPLETED" => "Finalización de cargamento",
        "RESPONSIBLE_RELIEVED" => "Cambio de responsable",
        "PRODUCTION_EVENT_CREATED" => "Registro o corrección de cajuela",
        _ => "Evento operativo",
    };

    public DateTimeOffset LocalOccurredAt => OccurredAt.ToLocalTime();
    public DateTimeOffset LocalLastAttemptAt => LastAttemptAt.ToLocalTime();
}

public sealed record AdministrativeCorrectionDiagnostic(
    string Administrator,
    string RoleCode,
    string Reason,
    string Action,
    string EntityType,
    DateTimeOffset OccurredAt,
    IReadOnlyList<string> Changes);
