using IndustriasDoradas.Desktop.Domain.Production;

namespace IndustriasDoradas.Desktop.Tests.Domain;

[TestClass]
public sealed class ProductionSweepTests
{
    private static readonly Guid OrganizationId = Guid.Parse("30000000-0000-4000-8000-000000000001");
    private static readonly Guid PlantId = Guid.Parse("31000000-0000-4000-8000-000000000001");
    private static readonly Guid StationId = Guid.Parse("34000000-0000-4000-8000-000000000001");
    private static readonly Guid ShipmentId = Guid.Parse("41000000-0000-4000-8000-000000000001");
    private static readonly Guid LineId = Guid.Parse("43000000-0000-4000-8000-000000000001");
    private static readonly Guid CycleId = Guid.Parse("44000000-0000-4000-8000-000000000001");
    private static readonly Guid WorkerId = Guid.Parse("45000000-0000-4000-8000-000000000001");
    private static readonly Guid SecondWorkerId = Guid.Parse("45000000-0000-4000-8000-000000000002");
    private static readonly Guid PlantManagerProfileId = Guid.Parse("20000000-0000-4000-8000-000000000001");
    private static readonly DateTimeOffset StartedAt = new(2026, 10, 2, 12, 0, 0, TimeSpan.Zero);

    [TestMethod]
    [DataRow(30, true)]
    [DataRow(60, false)]
    [DataRow(130, false)]
    public void RealSweepRepresentsAnyPositiveQuantityWithoutAssumingFifty(
        int quantity,
        bool isFinal)
    {
        ProductionEvent[] events = Additions(quantity);

        ProductionSweep sweep = Record(events, isFinal);

        Assert.AreEqual(quantity, sweep.CajuelaQuantity);
        Assert.AreEqual(quantity, sweep.EventReferences.Count);
        Assert.AreEqual(1L, sweep.FirstClientSequence);
        Assert.AreEqual(quantity, sweep.LastClientSequence);
        Assert.AreEqual(LineId, sweep.LineId);
        Assert.AreEqual(ShipmentId, sweep.ShipmentId);
        Assert.AreEqual(CycleId, sweep.FeedCycleId);
        Assert.AreEqual(isFinal, sweep.IsFinal);
        Assert.AreEqual(SweepPhysicalStatus.Recorded, sweep.PhysicalStatus);
        Assert.AreEqual(SweepMercuryStatus.Pending, sweep.MercuryStatus);
    }

    [TestMethod]
    public void SweepStoresExactEventsAndDerivesNetQuantityAfterReversal()
    {
        ProductionEvent[] additions = Additions(31);
        ProductionEvent reversed = ProductionEvent.CajuelaReversed(
            EventId(32),
            Context(),
            32,
            StartedAt.AddSeconds(32),
            StartedAt.AddSeconds(32),
            additions[^1].ClientEventId);

        ProductionSweep sweep = Record([.. additions, reversed], isFinal: true);

        Assert.AreEqual(30, sweep.CajuelaQuantity);
        Assert.AreEqual(32, sweep.EventReferences.Count);
        Assert.AreEqual(EventId(32), sweep.EventReferences[^1].ClientEventId);
    }

    [TestMethod]
    public void SweepPreservesEveryResponsibleContainedInItsEvents()
    {
        ProductionEvent[] first = Additions(20);
        ProductionEvent[] second = Additions(
            10,
            firstSequence: 21,
            context: Context(workerId: SecondWorkerId));

        ProductionSweep sweep = Record([.. first, .. second], isFinal: false);

        CollectionAssert.AreEquivalent(
            new[] { WorkerId, SecondWorkerId },
            sweep.ResponsibleWorkerIds.ToArray());
    }

    [TestMethod]
    public void SweepRejectsMixedLineShipmentOrCycle()
    {
        ProductionEvent valid = Addition(1, Context());
        ProductionEvent otherLine = Addition(
            2,
            Context(lineId: Guid.Parse("43000000-0000-4000-8000-000000000002")));
        ProductionEvent otherShipment = Addition(
            2,
            Context(shipmentId: Guid.Parse("41000000-0000-4000-8000-000000000002")));
        ProductionEvent otherCycle = Addition(
            2,
            Context(cycleId: Guid.Parse("44000000-0000-4000-8000-000000000002")));

        Assert.ThrowsExactly<InvalidOperationException>(() => Record([valid, otherLine], false));
        Assert.ThrowsExactly<InvalidOperationException>(() => Record([valid, otherShipment], false));
        Assert.ThrowsExactly<InvalidOperationException>(() => Record([valid, otherCycle], false));
    }

    [TestMethod]
    public void SweepRejectsEmptyDuplicateOrNonPositiveEventSets()
    {
        ProductionEvent addition = Addition(1, Context());
        ProductionEvent reversal = ProductionEvent.CajuelaReversed(
            EventId(2),
            Context(),
            2,
            StartedAt.AddSeconds(2),
            StartedAt.AddSeconds(2),
            addition.ClientEventId);

        Assert.ThrowsExactly<ArgumentException>(() => Record([], false));
        Assert.ThrowsExactly<ArgumentException>(() => Record([addition, addition], false));
        Assert.ThrowsExactly<InvalidOperationException>(() => Record([addition, reversal], false));
    }

    [TestMethod]
    public void PhysicalAndRecordingTimesCannotPrecedeTheirSources()
    {
        ProductionEvent[] events = Additions(1);
        DateTimeOffset beforeEvent = events[0].OccurredAt.AddTicks(-1);
        DateTimeOffset performedAt = events[0].OccurredAt;

        Assert.ThrowsExactly<ArgumentOutOfRangeException>(() => ProductionSweep.Record(
            SweepId(), events, PlantManagerProfileId, beforeEvent, performedAt, false));
        Assert.ThrowsExactly<ArgumentOutOfRangeException>(() => ProductionSweep.Record(
            SweepId(), events, PlantManagerProfileId, performedAt, performedAt.AddTicks(-1), false));
    }

    [TestMethod]
    public void MercuryCanRemainPendingOrBeRecordedAsZero()
    {
        ProductionSweep sweep = Record(Additions(30), isFinal: true);

        Assert.IsNull(sweep.MercuryRecoveredGrams);
        Assert.AreEqual(SweepMercuryStatus.Pending, sweep.MercuryStatus);
        SweepMercuryMeasurement mercury = sweep.RecordMercuryRecovered(
            MeasurementId(1),
            0m,
            PlantManagerProfileId,
            sweep.RecordedAt.AddMinutes(1));

        Assert.AreEqual(0m, mercury.Grams);
        Assert.AreEqual(SweepMercuryStatus.Recorded, sweep.MercuryStatus);
        Assert.AreEqual(0m, sweep.MercuryRecoveredGrams);
        Assert.HasCount(1, sweep.MercuryMeasurementHistory);
    }

    [TestMethod]
    public void MercuryRejectsNegativeMoreThanTwoDecimalsAndDuplicateUuid()
    {
        ProductionSweep sweep = Record(Additions(30), isFinal: false);
        DateTimeOffset measuredAt = sweep.RecordedAt.AddMinutes(1);

        Assert.ThrowsExactly<ArgumentOutOfRangeException>(() => sweep.RecordMercuryRecovered(
            MeasurementId(1), -0.01m, PlantManagerProfileId, measuredAt));
        Assert.ThrowsExactly<ArgumentOutOfRangeException>(() => sweep.RecordMercuryRecovered(
            MeasurementId(2), 0.001m, PlantManagerProfileId, measuredAt));
        sweep.RecordMercuryRecovered(MeasurementId(3), 0.10m, PlantManagerProfileId, measuredAt);
        Assert.ThrowsExactly<InvalidOperationException>(() => sweep.RecordMercuryRecovered(
            MeasurementId(3), 1m, PlantManagerProfileId, measuredAt));
    }

    [TestMethod]
    public void MercuryCorrectionsAreAppendOnly()
    {
        ProductionSweep sweep = Record(Additions(60), isFinal: false);
        SweepMercuryMeasurement firstMeasurement = sweep.RecordMercuryRecovered(
            MeasurementId(1),
            295.20m,
            PlantManagerProfileId,
            sweep.RecordedAt.AddMinutes(1));
        SweepMercuryMeasurement correctedMeasurement = sweep.RecordMercuryRecovered(
            MeasurementId(2),
            295.25m,
            PlantManagerProfileId,
            sweep.RecordedAt.AddMinutes(2));

        Assert.AreEqual(295.25m, sweep.MercuryRecoveredGrams);
        Assert.AreEqual(firstMeasurement, sweep.MercuryMeasurementHistory[0]);
        Assert.AreEqual(correctedMeasurement, sweep.MercuryMeasurementHistory[1]);
        Assert.HasCount(2, sweep.MercuryMeasurementHistory);
    }

    private static ProductionSweep Record(
        IEnumerable<ProductionEvent> events,
        bool isFinal)
    {
        ProductionEvent[] materialized = events.ToArray();
        DateTimeOffset performedAt = materialized.Length == 0
            ? StartedAt.AddMinutes(1)
            : materialized.Max(item => item.OccurredAt).AddMinutes(1);
        return ProductionSweep.Record(
            SweepId(),
            materialized,
            PlantManagerProfileId,
            performedAt,
            performedAt.AddSeconds(1),
            isFinal);
    }

    private static ProductionEvent[] Additions(
        int quantity,
        int firstSequence = 1,
        ProductionEventContext? context = null) =>
        Enumerable.Range(firstSequence, quantity)
            .Select(sequence => Addition(sequence, context ?? Context()))
            .ToArray();

    private static ProductionEvent Addition(int sequence, ProductionEventContext context) =>
        ProductionEvent.CajuelaAdded(
            EventId(sequence),
            context,
            sequence,
            StartedAt.AddSeconds(sequence),
            StartedAt.AddSeconds(sequence).AddMilliseconds(20));

    private static ProductionEventContext Context(
        Guid? lineId = null,
        Guid? cycleId = null,
        Guid? shipmentId = null,
        Guid? workerId = null) =>
        ProductionEventContext.Create(
            OrganizationId,
            PlantId,
            StationId,
            lineId ?? LineId,
            cycleId ?? CycleId,
            shipmentId ?? ShipmentId,
            workerId ?? WorkerId);

    private static Guid SweepId() => Guid.Parse("60000000-0000-4000-8000-000000000001");

    private static Guid EventId(int suffix) =>
        Guid.Parse($"50000000-0000-4000-8000-{suffix:D12}");

    private static Guid MeasurementId(int suffix) =>
        Guid.Parse($"61000000-0000-4000-8000-{suffix:D12}");

}
