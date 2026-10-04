using IndustriasDoradas.Desktop.Domain.Production;

namespace IndustriasDoradas.Desktop.Tests.Domain;

[TestClass]
public sealed class ProductionMilestoneServiceTests
{
    private readonly ProductionMilestoneService service = new();

    [TestMethod]
    [DataRow(49L, false, -1L, -1L, 50L)]
    [DataRow(50L, true, 50L, 55L, 100L)]
    [DataRow(55L, true, 50L, 55L, 100L)]
    [DataRow(56L, false, -1L, -1L, 100L)]
    [DataRow(99L, false, -1L, -1L, 100L)]
    [DataRow(100L, true, 100L, 105L, 150L)]
    [DataRow(105L, true, 100L, 105L, 150L)]
    [DataRow(106L, false, -1L, -1L, 150L)]
    public void ReviewAlertUsesInclusiveConfigurableWindows(
        long total,
        bool expectedActive,
        long expectedActiveReference,
        long expectedActiveThrough,
        long expectedNextReference)
    {
        ProductionReviewAlertState result = service.CalculateReviewAlert(total);

        Assert.AreEqual(total, result.TotalCajuelas);
        Assert.AreEqual(expectedActive, result.IsActive);
        Assert.AreEqual(
            expectedActiveReference < 0 ? null : expectedActiveReference,
            result.ActiveReference);
        Assert.AreEqual(
            expectedActiveThrough < 0 ? null : expectedActiveThrough,
            result.ActiveThrough);
        Assert.AreEqual(expectedNextReference, result.NextReference);
    }

    [TestMethod]
    public void ReversalLeavingAndReenteringWindowReactivatesCurrentSignal()
    {
        ProductionReviewAlertState reached = service.CalculateReviewAlert(50);
        ProductionReviewAlertState reversed = service.CalculateReviewAlert(49);
        ProductionReviewAlertState reachedAgain = service.CalculateReviewAlert(50);

        Assert.IsTrue(reached.IsActive);
        Assert.IsFalse(reversed.IsActive);
        Assert.IsTrue(reachedAgain.IsActive);
        Assert.AreEqual(50L, reachedAgain.ActiveReference);
    }

    [TestMethod]
    [DataRow(0L, false, 250L, 0L, 250L, 0L)]
    [DataRow(249L, false, 250L, 0L, 250L, 249L)]
    [DataRow(250L, true, 250L, 250L, 500L, 0L)]
    [DataRow(251L, true, 250L, 250L, 500L, 1L)]
    [DataRow(500L, true, 250L, 500L, 750L, 0L)]
    [DataRow(760L, true, 250L, 750L, 1000L, 10L)]
    public void ProgressKeepsFirstPendingSweepWhileDisplayAdvancesBySegments(
        long total,
        bool expectedPending,
        long expectedNextSweep,
        long expectedSegmentStart,
        long expectedDisplayReference,
        long expectedSegmentProgress)
    {
        ProductionSweepProgressState result = service.CalculateSweepProgress(total);

        Assert.AreEqual(total, result.TotalCajuelas);
        Assert.IsNull(result.LastSweepCumulativeTotal);
        Assert.AreEqual(expectedPending, result.IsSweepPending);
        Assert.AreEqual(expectedNextSweep, result.NextSweepReference);
        Assert.AreEqual(expectedSegmentStart, result.DisplaySegmentStart);
        Assert.AreEqual(expectedDisplayReference, result.DisplayReference);
        Assert.AreEqual(expectedSegmentProgress, result.CajuelasInDisplaySegment);
    }

    [TestMethod]
    [DataRow(260L, false, 510L, 260L, 510L, 0L)]
    [DataRow(509L, false, 510L, 260L, 510L, 249L)]
    [DataRow(510L, true, 510L, 510L, 760L, 0L)]
    [DataRow(761L, true, 510L, 760L, 1010L, 1L)]
    public void RealSweepAtArbitraryTotalSetsNextReferenceFromThatTotal(
        long total,
        bool expectedPending,
        long expectedNextSweep,
        long expectedSegmentStart,
        long expectedDisplayReference,
        long expectedSegmentProgress)
    {
        ProductionSweepProgressState result = service.CalculateSweepProgress(
            total,
            lastSweepCumulativeTotal: 260);

        Assert.AreEqual(260L, result.LastSweepCumulativeTotal);
        Assert.AreEqual(expectedPending, result.IsSweepPending);
        Assert.AreEqual(expectedNextSweep, result.NextSweepReference);
        Assert.AreEqual(expectedSegmentStart, result.DisplaySegmentStart);
        Assert.AreEqual(expectedDisplayReference, result.DisplayReference);
        Assert.AreEqual(expectedSegmentProgress, result.CajuelasInDisplaySegment);
    }

    [TestMethod]
    public void EarlySweepDoesNotResetAccumulatedTotal()
    {
        ProductionSweepProgressState result = service.CalculateSweepProgress(
            totalCajuelas: 60,
            lastSweepCumulativeTotal: 30);

        Assert.AreEqual(60L, result.TotalCajuelas);
        Assert.AreEqual(30L, result.LastSweepCumulativeTotal);
        Assert.AreEqual(280L, result.NextSweepReference);
        Assert.AreEqual(30L, result.DisplaySegmentStart);
        Assert.AreEqual(280L, result.DisplayReference);
        Assert.AreEqual(30L, result.CajuelasInDisplaySegment);
        Assert.IsFalse(result.IsSweepPending);
    }

    [TestMethod]
    public void IntervalsAreConfigurableWithoutCouplingAlertAndSweepRules()
    {
        var customService = new ProductionMilestoneService(
            new ProductionMilestoneConfiguration(
                reviewInterval: 25,
                reviewWindowExtension: 2,
                sweepInterval: 100));

        ProductionReviewAlertState alert = customService.CalculateReviewAlert(27);
        ProductionSweepProgressState progress = customService.CalculateSweepProgress(100);

        Assert.IsTrue(alert.IsActive);
        Assert.AreEqual(25L, alert.ActiveReference);
        Assert.AreEqual(27L, alert.ActiveThrough);
        Assert.IsTrue(progress.IsSweepPending);
        Assert.AreEqual(100L, progress.NextSweepReference);
        Assert.AreEqual(200L, progress.DisplayReference);
    }

    [TestMethod]
    public void InvalidConfigurationOrCountersAreRejected()
    {
        Assert.ThrowsExactly<ArgumentOutOfRangeException>(() =>
            new ProductionMilestoneConfiguration(reviewInterval: 0));
        Assert.ThrowsExactly<ArgumentOutOfRangeException>(() =>
            new ProductionMilestoneConfiguration(reviewWindowExtension: -1));
        Assert.ThrowsExactly<ArgumentOutOfRangeException>(() =>
            new ProductionMilestoneConfiguration(reviewInterval: 5, reviewWindowExtension: 5));
        Assert.ThrowsExactly<ArgumentOutOfRangeException>(() =>
            new ProductionMilestoneConfiguration(sweepInterval: 0));
        Assert.ThrowsExactly<ArgumentOutOfRangeException>(() =>
            service.CalculateReviewAlert(-1));
        Assert.ThrowsExactly<ArgumentOutOfRangeException>(() =>
            service.CalculateSweepProgress(-1));
        Assert.ThrowsExactly<ArgumentOutOfRangeException>(() =>
            service.CalculateSweepProgress(10, -1));
        Assert.ThrowsExactly<ArgumentOutOfRangeException>(() =>
            service.CalculateSweepProgress(10, 11));
    }
}
