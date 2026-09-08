namespace IndustriasDoradas.Desktop.Domain.Production;

public sealed class Shipment
{
    private Shipment(
        Guid id,
        Guid supplierId,
        Guid lineId,
        Guid feedCycleId,
        Guid responsibleWorkerId,
        DateTimeOffset startedAt)
    {
        EnsureRequired(id, nameof(id), "El cargamento es obligatorio.");
        EnsureRequired(supplierId, nameof(supplierId), "El proveedor es obligatorio.");

        DateTimeOffset normalizedStartedAt = startedAt.ToUniversalTime();
        Id = id;
        SupplierId = supplierId;
        StartedAt = normalizedStartedAt;
        FeedCycle = new LineFeedCycle(feedCycleId, lineId, responsibleWorkerId, normalizedStartedAt);
    }

    public Guid Id { get; }

    public Guid SupplierId { get; }

    public DateTimeOffset StartedAt { get; }

    public LineFeedCycle FeedCycle { get; }

    public static Shipment Start(
        Guid id,
        Guid supplierId,
        Guid lineId,
        Guid feedCycleId,
        Guid responsibleWorkerId,
        DateTimeOffset startedAt) =>
        new(id, supplierId, lineId, feedCycleId, responsibleWorkerId, startedAt);

    public void RelieveResponsible(Guid nextWorkerId, DateTimeOffset effectiveAt) =>
        FeedCycle.Relieve(nextWorkerId, effectiveAt);

    public void CompleteFeeding(DateTimeOffset completedAt) =>
        FeedCycle.Complete(completedAt);

    private static void EnsureRequired(Guid value, string parameterName, string message)
    {
        if (value == Guid.Empty)
        {
            throw new ArgumentException(message, parameterName);
        }
    }
}
