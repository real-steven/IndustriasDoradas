using System.Collections.ObjectModel;

namespace IndustriasDoradas.Desktop.Domain.Production;

public enum SweepPhysicalStatus
{
    Recorded,
}

public enum SweepMercuryStatus
{
    Pending,
    Recorded,
}

public sealed record SweepEventReference(
    Guid ClientEventId,
    long ClientSequence);

public sealed record SweepMercuryMeasurement
{
    internal SweepMercuryMeasurement(
        Guid id,
        decimal grams,
        Guid recordedByProfileId,
        DateTimeOffset recordedAt)
    {
        Id = id;
        Grams = grams;
        RecordedByProfileId = recordedByProfileId;
        RecordedAt = recordedAt;
    }

    public Guid Id { get; }

    public decimal Grams { get; }

    public Guid RecordedByProfileId { get; }

    public DateTimeOffset RecordedAt { get; }
}

public sealed class ProductionSweep
{
    private readonly List<SweepMercuryMeasurement> mercuryMeasurements = [];
    private readonly ReadOnlyCollection<SweepMercuryMeasurement> readOnlyMercuryMeasurements;

    private ProductionSweep(
        Guid id,
        ProductionEventContext scope,
        IReadOnlyList<ProductionEvent> events,
        Guid recordedByProfileId,
        DateTimeOffset performedAt,
        DateTimeOffset recordedAt,
        bool isFinal)
    {
        Id = id;
        OrganizationId = scope.OrganizationId;
        PlantId = scope.PlantId;
        StationId = scope.StationId;
        LineId = scope.LineId;
        FeedCycleId = scope.FeedCycleId;
        ShipmentId = scope.ShipmentId;
        EventReferences = Array.AsReadOnly(events
            .Select(item => new SweepEventReference(item.ClientEventId, item.ClientSequence))
            .ToArray());
        ResponsibleWorkerIds = Array.AsReadOnly(events
            .Select(item => item.Context.ResponsibleWorkerId)
            .Distinct()
            .ToArray());
        CajuelaQuantity = ProductionEventCounter.ForLineAndShipment(events, LineId, ShipmentId);
        FirstClientSequence = events[0].ClientSequence;
        LastClientSequence = events[^1].ClientSequence;
        RecordedByProfileId = recordedByProfileId;
        PerformedAt = performedAt;
        RecordedAt = recordedAt;
        WorkPeriod = WorkPeriodSchedule.At(performedAt);
        IsFinal = isFinal;
        PhysicalStatus = SweepPhysicalStatus.Recorded;
        readOnlyMercuryMeasurements = mercuryMeasurements.AsReadOnly();
    }

    public Guid Id { get; }

    public Guid OrganizationId { get; }

    public Guid PlantId { get; }

    public Guid StationId { get; }

    public Guid LineId { get; }

    public Guid FeedCycleId { get; }

    public Guid ShipmentId { get; }

    public IReadOnlyList<SweepEventReference> EventReferences { get; }

    public IReadOnlyList<Guid> ResponsibleWorkerIds { get; }

    public int CajuelaQuantity { get; }

    public long FirstClientSequence { get; }

    public long LastClientSequence { get; }

    public Guid RecordedByProfileId { get; }

    public DateTimeOffset PerformedAt { get; }

    public DateTimeOffset RecordedAt { get; }

    public WorkPeriod WorkPeriod { get; }

    public bool IsFinal { get; }

    public SweepPhysicalStatus PhysicalStatus { get; }

    public IReadOnlyList<SweepMercuryMeasurement> MercuryMeasurementHistory =>
        readOnlyMercuryMeasurements;

    public SweepMercuryMeasurement? CurrentMercuryMeasurement => mercuryMeasurements.LastOrDefault();

    public decimal? MercuryRecoveredGrams => CurrentMercuryMeasurement?.Grams;

    public SweepMercuryStatus MercuryStatus => CurrentMercuryMeasurement is null
        ? SweepMercuryStatus.Pending
        : SweepMercuryStatus.Recorded;

    public static ProductionSweep Record(
        Guid id,
        IEnumerable<ProductionEvent> includedEvents,
        Guid recordedByProfileId,
        DateTimeOffset performedAt,
        DateTimeOffset recordedAt,
        bool isFinal)
    {
        EnsureRequired(id, nameof(id), "La barrida es obligatoria.");
        EnsureRequired(
            recordedByProfileId,
            nameof(recordedByProfileId),
            "El perfil que registra la barrida es obligatorio.");
        ArgumentNullException.ThrowIfNull(includedEvents);

        ProductionEvent[] events = includedEvents.OrderBy(item => item.ClientSequence).ToArray();
        if (events.Length == 0)
        {
            throw new ArgumentException(
                "Una barrida debe incluir al menos un evento de producción.",
                nameof(includedEvents));
        }

        EnsureUniqueEvents(events, nameof(includedEvents));
        ProductionEventContext scope = events[0].Context;
        if (events.Any(item => !HasSameProductionScope(item.Context, scope)))
        {
            throw new InvalidOperationException(
                "Una barrida no puede mezclar líneas, ciclos o cargamentos distintos.");
        }

        performedAt = performedAt.ToUniversalTime();
        recordedAt = recordedAt.ToUniversalTime();
        if (events.Any(item => item.OccurredAt > performedAt))
        {
            throw new ArgumentOutOfRangeException(
                nameof(performedAt),
                "La barrida física no puede ocurrir antes de los eventos incluidos.");
        }

        if (recordedAt < performedAt)
        {
            throw new ArgumentOutOfRangeException(
                nameof(recordedAt),
                "El registro no puede anteceder a la barrida física.");
        }

        var sweep = new ProductionSweep(
            id,
            scope,
            events,
            recordedByProfileId,
            performedAt,
            recordedAt,
            isFinal);
        if (sweep.CajuelaQuantity <= 0)
        {
            throw new InvalidOperationException(
                "Una barrida debe contener una cantidad neta positiva de cajuelas.");
        }

        return sweep;
    }

    public SweepMercuryMeasurement RecordMercuryRecovered(
        Guid measurementId,
        decimal grams,
        Guid recordedByProfileId,
        DateTimeOffset recordedAt)
    {
        EnsureRequired(measurementId, nameof(measurementId), "La medición es obligatoria.");
        EnsureRequired(
            recordedByProfileId,
            nameof(recordedByProfileId),
            "El perfil que registra la medición es obligatorio.");
        if (mercuryMeasurements.Any(item => item.Id == measurementId))
        {
            throw new InvalidOperationException("La medición ya fue registrada.");
        }

        ValidateGrams(grams);
        recordedAt = recordedAt.ToUniversalTime();
        if (recordedAt < RecordedAt)
        {
            throw new ArgumentOutOfRangeException(
                nameof(recordedAt),
                "La medición no puede anteceder al registro de la barrida.");
        }

        var measurement = new SweepMercuryMeasurement(
            measurementId,
            grams,
            recordedByProfileId,
            recordedAt);
        mercuryMeasurements.Add(measurement);
        return measurement;
    }

    private static void EnsureUniqueEvents(
        ProductionEvent[] events,
        string parameterName)
    {
        if (events.Select(item => item.ClientEventId).Distinct().Count() != events.Length)
        {
            throw new ArgumentException(
                "Una barrida no puede repetir un UUID de evento.",
                parameterName);
        }

        if (events.Select(item => item.ClientSequence).Distinct().Count() != events.Length)
        {
            throw new ArgumentException(
                "Una barrida no puede repetir una secuencia de estación.",
                parameterName);
        }
    }

    private static bool HasSameProductionScope(
        ProductionEventContext candidate,
        ProductionEventContext expected) =>
        candidate.OrganizationId == expected.OrganizationId &&
        candidate.PlantId == expected.PlantId &&
        candidate.StationId == expected.StationId &&
        candidate.LineId == expected.LineId &&
        candidate.FeedCycleId == expected.FeedCycleId &&
        candidate.ShipmentId == expected.ShipmentId;

    private static void ValidateGrams(decimal grams)
    {
        if (grams < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(grams), "La cantidad no puede ser negativa.");
        }

        if (decimal.Round(grams, 2) != grams)
        {
            throw new ArgumentOutOfRangeException(
                nameof(grams),
                "La cantidad admite como máximo dos decimales.");
        }
    }

    private static void EnsureRequired(Guid value, string parameterName, string message)
    {
        if (value == Guid.Empty)
        {
            throw new ArgumentException(message, parameterName);
        }
    }
}
