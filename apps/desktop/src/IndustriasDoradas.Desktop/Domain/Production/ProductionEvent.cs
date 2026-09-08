namespace IndustriasDoradas.Desktop.Domain.Production;

public enum ProductionEventType
{
    CajuelaAdded,
    CajuelaReversed,
}

public sealed record ProductionEvent
{
    private ProductionEvent(
        Guid clientEventId,
        ProductionEventContext context,
        ProductionEventType type,
        long clientSequence,
        DateTimeOffset occurredAt,
        DateTimeOffset recordedAt,
        Guid? reversesClientEventId)
    {
        if (clientEventId == Guid.Empty)
        {
            throw new ArgumentException("El UUID cliente del evento es obligatorio.", nameof(clientEventId));
        }

        ArgumentNullException.ThrowIfNull(context);

        if (clientSequence <= 0)
        {
            throw new ArgumentOutOfRangeException(
                nameof(clientSequence),
                "La secuencia cliente debe ser mayor que cero.");
        }

        if (type == ProductionEventType.CajuelaAdded && reversesClientEventId is not null)
        {
            throw new ArgumentException(
                "Un evento agregado no puede referenciar una reversión.",
                nameof(reversesClientEventId));
        }

        if (type == ProductionEventType.CajuelaReversed &&
            (reversesClientEventId is null || reversesClientEventId == Guid.Empty))
        {
            throw new ArgumentException(
                "Una reversión debe indicar el UUID cliente que compensa.",
                nameof(reversesClientEventId));
        }

        if (reversesClientEventId == clientEventId)
        {
            throw new ArgumentException(
                "Un evento no puede revertirse a sí mismo.",
                nameof(reversesClientEventId));
        }

        DateTimeOffset normalizedOccurredAt = occurredAt.ToUniversalTime();
        ClientEventId = clientEventId;
        Context = context;
        Type = type;
        ClientSequence = clientSequence;
        OccurredAt = normalizedOccurredAt;
        RecordedAt = recordedAt.ToUniversalTime();
        WorkPeriod = WorkPeriodSchedule.At(normalizedOccurredAt);
        ReversesClientEventId = reversesClientEventId;
    }

    public Guid ClientEventId { get; }

    public ProductionEventContext Context { get; }

    public ProductionEventType Type { get; }

    public long ClientSequence { get; }

    public DateTimeOffset OccurredAt { get; }

    public DateTimeOffset RecordedAt { get; }

    public WorkPeriod WorkPeriod { get; }

    public Guid? ReversesClientEventId { get; }

    public int QuantityDelta => Type == ProductionEventType.CajuelaAdded ? 1 : -1;

    public static ProductionEvent CajuelaAdded(
        Guid clientEventId,
        ProductionEventContext context,
        long clientSequence,
        DateTimeOffset occurredAt,
        DateTimeOffset recordedAt) =>
        new(
            clientEventId,
            context,
            ProductionEventType.CajuelaAdded,
            clientSequence,
            occurredAt,
            recordedAt,
            null);

    public static ProductionEvent CajuelaReversed(
        Guid clientEventId,
        ProductionEventContext context,
        long clientSequence,
        DateTimeOffset occurredAt,
        DateTimeOffset recordedAt,
        Guid reversesClientEventId) =>
        new(
            clientEventId,
            context,
            ProductionEventType.CajuelaReversed,
            clientSequence,
            occurredAt,
            recordedAt,
            reversesClientEventId);
}
