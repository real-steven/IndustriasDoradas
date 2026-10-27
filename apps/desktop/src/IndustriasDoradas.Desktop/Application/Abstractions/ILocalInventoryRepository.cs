using IndustriasDoradas.Desktop.Domain.Inventory;

namespace IndustriasDoradas.Desktop.Application.Abstractions;

public sealed record LocalInventoryStock(
    InventoryItem Item,
    decimal LocalBalance,
    decimal CentralKnownBalance,
    int PendingMovementCount);

public sealed record LocalInventoryFreshness(
    DateTimeOffset? CentralAsOf,
    DateTimeOffset? ReceivedAt,
    string NetworkState,
    int PendingFactCount)
{
    public bool HasUnconfirmedFacts => PendingFactCount > 0;
}

public sealed record RecordLocalInventoryMovement(
    Guid ClientMovementId,
    Guid OrganizationId,
    Guid PlantId,
    Guid StationId,
    Guid ActorProfileId,
    Guid InventoryItemId,
    InventoryMovementType MovementType,
    decimal Quantity,
    DateTimeOffset OccurredAt,
    DateTimeOffset RecordedAt,
    Guid? ResponsibleWorkerId = null,
    string? Reason = null,
    string? Destination = null,
    string? Notes = null,
    Guid? RelatedMovementId = null,
    OutboxAuthorizationEvidence? Authorization = null,
    Guid? LinkedSweepId = null);

public sealed record LocalInventoryMovementRegistration(
    Guid ClientMovementId,
    long ClientSequence,
    decimal QuantityDelta,
    decimal LocalBalance,
    bool WasDuplicate);

public sealed record LocalInventoryMovementReference(
    Guid Id,
    Guid InventoryItemId,
    InventoryMovementType MovementType,
    decimal QuantityDelta,
    DateTimeOffset OccurredAt,
    string? Reason,
    string? Destination,
    Guid? RelatedMovementId,
    bool HasBeenReversed);

public sealed record RecordLocalInventoryReview(
    Guid ReviewId,
    Guid OrganizationId,
    Guid PlantId,
    Guid StationId,
    Guid ReviewedByProfileId,
    Guid InventoryItemId,
    decimal CountedQuantity,
    DateTimeOffset ReviewedAt,
    DateTimeOffset RecordedAt,
    string? Notes = null,
    OutboxAuthorizationEvidence? Authorization = null);

public sealed record LocalInventoryReviewRegistration(
    Guid ReviewId,
    long ClientSequence,
    InventoryReviewStatus Status,
    decimal ExpectedQuantity,
    decimal CountedQuantity,
    decimal Difference,
    bool WasDuplicate);

public interface ILocalInventoryRepository
{
    Task<IReadOnlyList<LocalInventoryStock>> ListStockAsync(
        Guid organizationId,
        Guid plantId,
        CancellationToken cancellationToken = default);

    Task<LocalInventoryFreshness> GetFreshnessAsync(
        Guid stationId,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<LocalInventoryMovementReference>> ListMovementsAsync(
        Guid organizationId,
        Guid plantId,
        CancellationToken cancellationToken = default);

    Task<LocalInventoryMovementRegistration> RecordMovementAsync(
        RecordLocalInventoryMovement mutation,
        CancellationToken cancellationToken = default);

    Task<LocalInventoryReviewRegistration> RecordReviewAsync(
        RecordLocalInventoryReview mutation,
        CancellationToken cancellationToken = default);
}
