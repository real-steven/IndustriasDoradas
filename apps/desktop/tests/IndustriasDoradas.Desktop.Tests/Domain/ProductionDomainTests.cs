using IndustriasDoradas.Desktop.Domain.Production;

namespace IndustriasDoradas.Desktop.Tests.Domain;

[TestClass]
public sealed class ProductionDomainTests
{
    private static readonly Guid ShipmentId = Guid.Parse("41000000-0000-4000-8000-000000000001");
    private static readonly Guid SupplierId = Guid.Parse("42000000-0000-4000-8000-000000000001");
    private static readonly Guid LineId = Guid.Parse("43000000-0000-4000-8000-000000000001");
    private static readonly Guid CycleId = Guid.Parse("44000000-0000-4000-8000-000000000001");
    private static readonly Guid FirstWorkerId = Guid.Parse("45000000-0000-4000-8000-000000000001");
    private static readonly Guid SecondWorkerId = Guid.Parse("45000000-0000-4000-8000-000000000002");
    private static readonly DateTimeOffset StartedAt = new(2026, 8, 25, 17, 42, 0, TimeSpan.FromHours(-6));

    [TestMethod]
    public void WorkPeriodUsesCostaRicaBoundariesForAnyInputOffset()
    {
        Assert.AreEqual(WorkPeriod.Night, WorkPeriodSchedule.At(Utc(2026, 8, 25, 11, 59, 59)));
        Assert.AreEqual(WorkPeriod.Day, WorkPeriodSchedule.At(Utc(2026, 8, 25, 12, 0, 0)));
        Assert.AreEqual(WorkPeriod.Day, WorkPeriodSchedule.At(Utc(2026, 8, 25, 23, 59, 59)));
        Assert.AreEqual(WorkPeriod.Night, WorkPeriodSchedule.At(Utc(2026, 8, 26, 0, 0, 0)));
    }

    [TestMethod]
    public void ShipmentStartsOneActiveCycleOnExactlyOneLineWithOneResponsible()
    {
        Shipment shipment = Fixture();

        Assert.AreEqual(ShipmentId, shipment.Id);
        Assert.AreEqual(SupplierId, shipment.SupplierId);
        Assert.AreEqual(StartedAt.ToUniversalTime(), shipment.StartedAt);
        Assert.AreEqual(CycleId, shipment.FeedCycle.Id);
        Assert.AreEqual(LineId, shipment.FeedCycle.LineId);
        Assert.AreEqual(LineFeedCycleStatus.Active, shipment.FeedCycle.Status);
        Assert.AreEqual(1, shipment.FeedCycle.Responsibilities.Count);
        Assert.AreEqual(FirstWorkerId, shipment.FeedCycle.CurrentResponsibility.WorkerId);
        Assert.IsTrue(shipment.FeedCycle.CurrentResponsibility.IsCurrent);
    }

    [TestMethod]
    public void ReliefKeepsHistoryAndDoesNotCompleteShipment()
    {
        Shipment shipment = Fixture();
        DateTimeOffset relievedAt = StartedAt.AddMinutes(35);

        shipment.RelieveResponsible(SecondWorkerId, relievedAt);

        Assert.AreEqual(LineFeedCycleStatus.Active, shipment.FeedCycle.Status);
        Assert.IsNull(shipment.FeedCycle.CompletedAt);
        Assert.AreEqual(2, shipment.FeedCycle.Responsibilities.Count);
        Assert.AreEqual(relievedAt.ToUniversalTime(), shipment.FeedCycle.Responsibilities[0].EndedAt);
        Assert.IsFalse(shipment.FeedCycle.Responsibilities[0].IsCurrent);
        Assert.AreEqual(SecondWorkerId, shipment.FeedCycle.CurrentResponsibility.WorkerId);
        Assert.AreEqual(relievedAt.ToUniversalTime(), shipment.FeedCycle.CurrentResponsibility.StartedAt);
    }

    [TestMethod]
    public void CompletingFeedingClosesCurrentResponsibilityAndPreservesHistory()
    {
        Shipment shipment = Fixture();
        DateTimeOffset relievedAt = StartedAt.AddMinutes(35);
        DateTimeOffset completedAt = relievedAt.AddHours(2);
        shipment.RelieveResponsible(SecondWorkerId, relievedAt);

        shipment.CompleteFeeding(completedAt);

        Assert.AreEqual(LineFeedCycleStatus.Completed, shipment.FeedCycle.Status);
        Assert.AreEqual(completedAt.ToUniversalTime(), shipment.FeedCycle.CompletedAt);
        Assert.AreEqual(2, shipment.FeedCycle.Responsibilities.Count);
        Assert.AreEqual(completedAt.ToUniversalTime(), shipment.FeedCycle.Responsibilities[1].EndedAt);
        Assert.IsFalse(shipment.FeedCycle.Responsibilities[1].IsCurrent);
        Assert.ThrowsExactly<InvalidOperationException>(() => _ = shipment.FeedCycle.CurrentResponsibility);
    }

    [TestMethod]
    public void RequiredIdentifiersCannotBeEmpty()
    {
        Assert.ThrowsExactly<ArgumentException>(() => Fixture(id: Guid.Empty));
        Assert.ThrowsExactly<ArgumentException>(() => Fixture(supplierId: Guid.Empty));
        Assert.ThrowsExactly<ArgumentException>(() => Fixture(lineId: Guid.Empty));
        Assert.ThrowsExactly<ArgumentException>(() => Fixture(cycleId: Guid.Empty));
        Assert.ThrowsExactly<ArgumentException>(() => Fixture(workerId: Guid.Empty));

        Shipment shipment = Fixture();
        Assert.ThrowsExactly<ArgumentException>(
            () => shipment.RelieveResponsible(Guid.Empty, StartedAt.AddMinutes(1)));
        Assert.AreEqual(1, shipment.FeedCycle.Responsibilities.Count);
    }

    [TestMethod]
    public void ReliefRequiresDifferentWorkerAndStrictlyLaterInstant()
    {
        Shipment shipment = Fixture();

        Assert.ThrowsExactly<InvalidOperationException>(
            () => shipment.RelieveResponsible(FirstWorkerId, StartedAt.AddMinutes(1)));
        Assert.ThrowsExactly<ArgumentOutOfRangeException>(
            () => shipment.RelieveResponsible(SecondWorkerId, StartedAt));
        Assert.ThrowsExactly<ArgumentOutOfRangeException>(
            () => shipment.RelieveResponsible(SecondWorkerId, StartedAt.AddTicks(-1)));

        Assert.AreEqual(1, shipment.FeedCycle.Responsibilities.Count);
        Assert.AreEqual(FirstWorkerId, shipment.FeedCycle.CurrentResponsibility.WorkerId);
    }

    [TestMethod]
    public void CompletedCycleRejectsFurtherMutations()
    {
        Shipment shipment = Fixture();
        shipment.CompleteFeeding(StartedAt.AddHours(1));

        Assert.ThrowsExactly<InvalidOperationException>(
            () => shipment.RelieveResponsible(SecondWorkerId, StartedAt.AddHours(2)));
        Assert.ThrowsExactly<InvalidOperationException>(
            () => shipment.CompleteFeeding(StartedAt.AddHours(2)));
    }

    [TestMethod]
    public void CompletionCannotPrecedeCurrentResponsibility()
    {
        Shipment shipment = Fixture();
        shipment.RelieveResponsible(SecondWorkerId, StartedAt.AddHours(1));

        Assert.ThrowsExactly<ArgumentOutOfRangeException>(
            () => shipment.CompleteFeeding(StartedAt.AddMinutes(59)));

        Assert.AreEqual(LineFeedCycleStatus.Active, shipment.FeedCycle.Status);
        Assert.AreEqual(SecondWorkerId, shipment.FeedCycle.CurrentResponsibility.WorkerId);
    }

    [TestMethod]
    public void CompletionAtCurrentResponsibilityStartIsAllowed()
    {
        Shipment shipment = Fixture();

        shipment.CompleteFeeding(StartedAt);

        Assert.AreEqual(LineFeedCycleStatus.Completed, shipment.FeedCycle.Status);
        Assert.AreEqual(StartedAt.ToUniversalTime(), shipment.FeedCycle.CompletedAt);
        Assert.AreEqual(StartedAt.ToUniversalTime(), shipment.FeedCycle.Responsibilities[0].EndedAt);
    }

    [TestMethod]
    public void SameWorkerCanBeResponsibleForIndependentShipments()
    {
        Shipment first = Fixture();
        Shipment second = Fixture(
            id: Guid.Parse("41000000-0000-4000-8000-000000000002"),
            lineId: Guid.Parse("43000000-0000-4000-8000-000000000002"),
            cycleId: Guid.Parse("44000000-0000-4000-8000-000000000002"));

        Assert.AreEqual(FirstWorkerId, first.FeedCycle.CurrentResponsibility.WorkerId);
        Assert.AreEqual(FirstWorkerId, second.FeedCycle.CurrentResponsibility.WorkerId);
    }

    [TestMethod]
    public void AutomaticWorkPeriodChangeDoesNotMutateOrCompleteCycle()
    {
        Shipment shipment = Fixture();

        WorkPeriod beforeBoundary = WorkPeriodSchedule.At(Utc(2026, 8, 25, 23, 59, 59));
        WorkPeriod afterBoundary = WorkPeriodSchedule.At(Utc(2026, 8, 26, 0, 0, 0));

        Assert.AreEqual(WorkPeriod.Day, beforeBoundary);
        Assert.AreEqual(WorkPeriod.Night, afterBoundary);
        Assert.AreEqual(LineFeedCycleStatus.Active, shipment.FeedCycle.Status);
        Assert.AreEqual(FirstWorkerId, shipment.FeedCycle.CurrentResponsibility.WorkerId);
        Assert.AreEqual(1, shipment.FeedCycle.Responsibilities.Count);
    }

    private static Shipment Fixture(
        Guid? id = null,
        Guid? supplierId = null,
        Guid? lineId = null,
        Guid? cycleId = null,
        Guid? workerId = null) =>
        Shipment.Start(
            id ?? ShipmentId,
            supplierId ?? SupplierId,
            lineId ?? LineId,
            cycleId ?? CycleId,
            workerId ?? FirstWorkerId,
            StartedAt);

    private static DateTimeOffset Utc(int year, int month, int day, int hour, int minute, int second) =>
        new(year, month, day, hour, minute, second, TimeSpan.Zero);
}
