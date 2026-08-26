using IndustriasDoradas.Desktop.Domain.Production;

namespace IndustriasDoradas.Desktop.Tests.Domain;

[TestClass]
public sealed class ProductionEventTests
{
    private static readonly Guid OrganizationId = Guid.Parse("30000000-0000-4000-8000-000000000001");
    private static readonly Guid PlantId = Guid.Parse("31000000-0000-4000-8000-000000000001");
    private static readonly Guid StationId = Guid.Parse("34000000-0000-4000-8000-000000000001");
    private static readonly Guid LineId = Guid.Parse("43000000-0000-4000-8000-000000000001");
    private static readonly Guid CycleId = Guid.Parse("44000000-0000-4000-8000-000000000001");
    private static readonly Guid ShipmentId = Guid.Parse("41000000-0000-4000-8000-000000000001");
    private static readonly Guid WorkerId = Guid.Parse("45000000-0000-4000-8000-000000000001");
    private static readonly DateTimeOffset OccurredAt = new(2026, 8, 25, 18, 0, 0, TimeSpan.FromHours(-6));
    private static readonly DateTimeOffset RecordedAt = OccurredAt.AddMilliseconds(25);

    [TestMethod]
    public void AddedEventCapturesImmutableContextAndDerivedWorkPeriod()
    {
        Guid eventId = EventId(1);
        ProductionEvent productionEvent = Added(eventId, sequence: 1);

        Assert.AreEqual(eventId, productionEvent.ClientEventId);
        Assert.AreEqual(Context(), productionEvent.Context);
        Assert.AreEqual(ProductionEventType.CajuelaAdded, productionEvent.Type);
        Assert.AreEqual(1L, productionEvent.ClientSequence);
        Assert.AreEqual(OccurredAt.ToUniversalTime(), productionEvent.OccurredAt);
        Assert.AreEqual(RecordedAt.ToUniversalTime(), productionEvent.RecordedAt);
        Assert.AreEqual(WorkPeriod.Night, productionEvent.WorkPeriod);
        Assert.AreEqual(1, productionEvent.QuantityDelta);
        Assert.IsNull(productionEvent.ReversesClientEventId);
    }

    [TestMethod]
    public void ReversedEventReferencesOriginalWithoutChangingItsContext()
    {
        ProductionEvent addition = Added(EventId(1), sequence: 1);
        ProductionEvent reversal = Reversed(EventId(2), sequence: 2, addition.ClientEventId);

        Assert.AreEqual(ProductionEventType.CajuelaReversed, reversal.Type);
        Assert.AreEqual(-1, reversal.QuantityDelta);
        Assert.AreEqual(addition.ClientEventId, reversal.ReversesClientEventId);
        Assert.AreEqual(addition.Context, reversal.Context);
        Assert.AreEqual(1, addition.QuantityDelta);
        Assert.IsNull(addition.ReversesClientEventId);
    }

    [TestMethod]
    public void WorkPeriodComesFromOccurrenceAndNotRecordingInstant()
    {
        DateTimeOffset beforeBoundary = new(2026, 8, 25, 17, 59, 59, TimeSpan.FromHours(-6));
        DateTimeOffset afterBoundary = beforeBoundary.AddSeconds(2);

        ProductionEvent productionEvent = ProductionEvent.CajuelaAdded(
            EventId(1),
            Context(),
            1,
            beforeBoundary,
            afterBoundary);

        Assert.AreEqual(WorkPeriod.Day, productionEvent.WorkPeriod);
        Assert.AreEqual(afterBoundary.ToUniversalTime(), productionEvent.RecordedAt);
    }

    [TestMethod]
    public void ContextRejectsEveryEmptyIdentifier()
    {
        Assert.ThrowsExactly<ArgumentException>(() => Context(organizationId: Guid.Empty));
        Assert.ThrowsExactly<ArgumentException>(() => Context(plantId: Guid.Empty));
        Assert.ThrowsExactly<ArgumentException>(() => Context(stationId: Guid.Empty));
        Assert.ThrowsExactly<ArgumentException>(() => Context(lineId: Guid.Empty));
        Assert.ThrowsExactly<ArgumentException>(() => Context(cycleId: Guid.Empty));
        Assert.ThrowsExactly<ArgumentException>(() => Context(shipmentId: Guid.Empty));
        Assert.ThrowsExactly<ArgumentException>(() => Context(workerId: Guid.Empty));
    }

    [TestMethod]
    public void EventRejectsEmptyUuidInvalidSequenceAndInvalidReversalTarget()
    {
        Assert.ThrowsExactly<ArgumentException>(() => Added(Guid.Empty, sequence: 1));
        Assert.ThrowsExactly<ArgumentOutOfRangeException>(() => Added(EventId(1), sequence: 0));
        Assert.ThrowsExactly<ArgumentOutOfRangeException>(() => Added(EventId(1), sequence: -1));
        Assert.ThrowsExactly<ArgumentException>(
            () => Reversed(EventId(2), sequence: 2, Guid.Empty));
        Assert.ThrowsExactly<ArgumentException>(
            () => Reversed(EventId(2), sequence: 2, EventId(2)));
    }

    [TestMethod]
    public void CounterIsDerivedFromUniqueEventsForLineAndShipment()
    {
        ProductionEvent[] events =
        [
            Added(EventId(1), sequence: 1),
            Added(EventId(2), sequence: 2),
            Added(EventId(3), sequence: 3),
        ];

        int total = ProductionEventCounter.ForLineAndShipment(events, LineId, ShipmentId);

        Assert.AreEqual(3, total);
    }

    [TestMethod]
    public void ReversalCompensatesExactlyOneAddition()
    {
        ProductionEvent first = Added(EventId(1), sequence: 1);
        ProductionEvent second = Added(EventId(2), sequence: 2);
        ProductionEvent reversal = Reversed(EventId(3), sequence: 3, second.ClientEventId);

        int total = ProductionEventCounter.ForLineAndShipment(
            [first, second, reversal],
            LineId,
            ShipmentId);

        Assert.AreEqual(1, total);
    }

    [TestMethod]
    public void RetryOfIdenticalClientUuidDoesNotIncreaseCounter()
    {
        ProductionEvent addition = Added(EventId(1), sequence: 1);

        int total = ProductionEventCounter.ForLineAndShipment(
            [addition, addition],
            LineId,
            ShipmentId);

        Assert.AreEqual(1, total);
    }

    [TestMethod]
    public void EventsFromOtherLineOrShipmentDoNotAffectCounter()
    {
        ProductionEvent current = Added(EventId(1), sequence: 1);
        ProductionEvent otherLine = Added(
            EventId(2),
            sequence: 2,
            Context(lineId: Guid.Parse("43000000-0000-4000-8000-000000000002")));
        ProductionEvent otherShipment = Added(
            EventId(3),
            sequence: 3,
            Context(shipmentId: Guid.Parse("41000000-0000-4000-8000-000000000002")));

        int total = ProductionEventCounter.ForLineAndShipment(
            [current, otherLine, otherShipment],
            LineId,
            ShipmentId);

        Assert.AreEqual(1, total);
    }

    [TestMethod]
    public void CounterRejectsSameUuidWithDifferentContent()
    {
        Guid duplicatedId = EventId(1);
        ProductionEvent first = Added(duplicatedId, sequence: 1);
        ProductionEvent conflicting = Added(duplicatedId, sequence: 2);

        Assert.ThrowsExactly<InvalidOperationException>(
            () => ProductionEventCounter.ForLineAndShipment(
                [first, conflicting],
                LineId,
                ShipmentId));
    }

    [TestMethod]
    public void CounterRejectsRepeatedStationSequenceForDifferentEvents()
    {
        ProductionEvent first = Added(EventId(1), sequence: 1);
        ProductionEvent conflicting = Added(EventId(2), sequence: 1);

        Assert.ThrowsExactly<InvalidOperationException>(
            () => ProductionEventCounter.ForLineAndShipment(
                [first, conflicting],
                LineId,
                ShipmentId));
    }

    [TestMethod]
    public void CounterRejectsMissingOrRepeatedReversalTarget()
    {
        ProductionEvent addition = Added(EventId(1), sequence: 1);
        ProductionEvent missingTarget = Reversed(EventId(2), sequence: 2, EventId(9));

        Assert.ThrowsExactly<InvalidOperationException>(
            () => ProductionEventCounter.ForLineAndShipment(
                [addition, missingTarget],
                LineId,
                ShipmentId));

        ProductionEvent firstReversal = Reversed(EventId(2), sequence: 2, addition.ClientEventId);
        ProductionEvent secondReversal = Reversed(EventId(3), sequence: 3, addition.ClientEventId);

        Assert.ThrowsExactly<InvalidOperationException>(
            () => ProductionEventCounter.ForLineAndShipment(
                [addition, firstReversal, secondReversal],
                LineId,
                ShipmentId));
    }

    [TestMethod]
    public void CounterRejectsReversalThatChangesProductionScope()
    {
        ProductionEvent addition = Added(EventId(1), sequence: 1);
        ProductionEvent reversal = Reversed(
            EventId(2),
            sequence: 2,
            addition.ClientEventId,
            Context(cycleId: Guid.Parse("44000000-0000-4000-8000-000000000002")));

        Assert.ThrowsExactly<InvalidOperationException>(
            () => ProductionEventCounter.ForLineAndShipment(
                [addition, reversal],
                LineId,
                ShipmentId));
    }

    private static ProductionEvent Added(
        Guid id,
        long sequence,
        ProductionEventContext? context = null) =>
        ProductionEvent.CajuelaAdded(
            id,
            context ?? Context(),
            sequence,
            OccurredAt,
            RecordedAt);

    private static ProductionEvent Reversed(
        Guid id,
        long sequence,
        Guid reversesId,
        ProductionEventContext? context = null) =>
        ProductionEvent.CajuelaReversed(
            id,
            context ?? Context(),
            sequence,
            OccurredAt.AddSeconds(sequence),
            RecordedAt.AddSeconds(sequence),
            reversesId);

    private static ProductionEventContext Context(
        Guid? organizationId = null,
        Guid? plantId = null,
        Guid? stationId = null,
        Guid? lineId = null,
        Guid? cycleId = null,
        Guid? shipmentId = null,
        Guid? workerId = null) =>
        ProductionEventContext.Create(
            organizationId ?? OrganizationId,
            plantId ?? PlantId,
            stationId ?? StationId,
            lineId ?? LineId,
            cycleId ?? CycleId,
            shipmentId ?? ShipmentId,
            workerId ?? WorkerId);

    private static Guid EventId(int suffix) =>
        Guid.Parse($"50000000-0000-4000-8000-{suffix:D12}");
}
