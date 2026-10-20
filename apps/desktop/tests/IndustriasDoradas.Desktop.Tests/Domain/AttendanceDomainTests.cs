using IndustriasDoradas.Desktop.Domain.Attendance;

namespace IndustriasDoradas.Desktop.Tests.Domain;

[TestClass]
public sealed class AttendanceDomainTests
{
    private static readonly Guid OrganizationId = Guid.Parse("30000000-0000-4000-8000-000000000001");
    private static readonly Guid PlantId = Guid.Parse("31000000-0000-4000-8000-000000000001");
    private static readonly Guid StationId = Guid.Parse("34000000-0000-4000-8000-000000000001");
    private static readonly Guid WorkerId = Guid.Parse("45000000-0000-4000-8000-000000000001");
    private static readonly Guid PlantManagerId = Guid.Parse("52000000-0000-4000-8000-000000000001");

    [TestMethod]
    public void CompletedShiftKeepsStartDateWhenItCrossesMidnight()
    {
        AttendanceEvent checkIn = CheckIn(1, At(2026, 10, 12, 22, 0));
        AttendanceEvent checkOut = CheckOut(2, At(2026, 10, 13, 6, 0));

        AttendanceProjection projection = AttendanceProjectionService.Project(
            [checkOut, checkIn],
            At(2026, 10, 13, 6, 0));

        Assert.HasCount(1, projection.Shifts);
        AttendanceShift shift = projection.Shifts[0];
        Assert.AreEqual(AttendanceShiftStatus.Completed, shift.Status);
        Assert.AreEqual(new DateOnly(2026, 10, 12), shift.StartedOn);
        Assert.AreEqual(TimeSpan.FromHours(8), shift.Duration);
        Assert.IsEmpty(projection.Incidents);
    }

    [TestMethod]
    public void OpenShiftHasNoDurationOrPayAndAlertsAfterEightHours()
    {
        AttendanceEvent checkIn = CheckIn(1, At(2026, 10, 12, 6, 0));

        AttendanceProjection projection = AttendanceProjectionService.Project(
            [checkIn],
            At(2026, 10, 12, 14, 1));

        Assert.HasCount(1, projection.Shifts);
        AttendanceShift shift = projection.Shifts[0];
        Assert.AreEqual(AttendanceShiftStatus.Open, shift.Status);
        Assert.IsNull(shift.Duration);
        Assert.HasCount(1, projection.Incidents);
        AttendanceIncident incident = projection.Incidents[0];
        Assert.AreEqual(AttendanceIncidentType.OpenShiftExceeded, incident.Type);

        WorkerPayPolicy policy = Policy(regularHourlyRate: 1500m);
        Assert.IsNull(AttendancePayProjectionService.Project(shift, policy));
    }

    [TestMethod]
    public void DuplicateCheckInCreatesIncidentWithoutReplacingOriginalEntry()
    {
        AttendanceEvent first = CheckIn(1, At(2026, 10, 12, 6, 0));
        AttendanceEvent duplicate = CheckIn(2, At(2026, 10, 12, 6, 5));
        AttendanceEvent checkOut = CheckOut(3, At(2026, 10, 12, 14, 0));

        AttendanceProjection projection = AttendanceProjectionService.Project(
            [first, duplicate, checkOut],
            At(2026, 10, 12, 14, 0));

        Assert.HasCount(1, projection.Shifts);
        AttendanceShift shift = projection.Shifts[0];
        Assert.AreEqual(first.ClientEventId, shift.CheckIn.ClientEventId);
        Assert.HasCount(1, projection.Incidents);
        AttendanceIncident incident = projection.Incidents[0];
        Assert.AreEqual(AttendanceIncidentType.DuplicateCheckIn, incident.Type);
    }

    [TestMethod]
    public void CheckOutWithoutCheckInRemainsAnIncidentInsteadOfZeroHours()
    {
        AttendanceEvent checkOut = CheckOut(1, At(2026, 10, 12, 14, 0));

        AttendanceProjection projection = AttendanceProjectionService.Project(
            [checkOut],
            At(2026, 10, 12, 14, 0));

        Assert.IsEmpty(projection.Shifts);
        Assert.HasCount(1, projection.Incidents);
        AttendanceIncident incident = projection.Incidents[0];
        Assert.AreEqual(AttendanceIncidentType.CheckOutWithoutCheckIn, incident.Type);
    }

    [TestMethod]
    public void PlantManagerCanCloseOpenShiftWithLateAuditedAdjustment()
    {
        AttendanceEvent checkIn = CheckIn(1, At(2026, 10, 12, 6, 0));
        AttendanceEvent correctedCheckOut = AttendanceEvent.Adjustment(
            EventId(2),
            OrganizationId,
            PlantId,
            StationId,
            WorkerId,
            AttendanceEventType.AdjustedCheckOut,
            2,
            At(2026, 10, 12, 14, 0),
            At(2026, 10, 13, 8, 0),
            PlantManagerId,
            "El trabajador olvidó marcar su salida.",
            checkIn.ClientEventId);

        AttendanceProjection projection = AttendanceProjectionService.Project(
            [checkIn, correctedCheckOut],
            At(2026, 10, 13, 8, 0));

        Assert.HasCount(1, projection.Shifts);
        AttendanceShift shift = projection.Shifts[0];
        Assert.AreEqual(TimeSpan.FromHours(8), shift.Duration);
        Assert.IsTrue(correctedCheckOut.IsAdjustment);
        Assert.AreEqual(PlantManagerId, correctedCheckOut.CorrectedByProfileId);
        Assert.AreEqual("El trabajador olvidó marcar su salida.", correctedCheckOut.CorrectionReason);
        Assert.IsEmpty(projection.Incidents);
    }

    [TestMethod]
    public void AdjustmentRequiresManagerReasonAndRelatedEvent()
    {
        Assert.ThrowsExactly<ArgumentException>(() => AttendanceEvent.Adjustment(
            EventId(2),
            OrganizationId,
            PlantId,
            StationId,
            WorkerId,
            AttendanceEventType.AdjustedCheckOut,
            2,
            At(2026, 10, 12, 14, 0),
            At(2026, 10, 12, 14, 1),
            PlantManagerId,
            " ",
            EventId(1)));

        Assert.ThrowsExactly<ArgumentException>(() => AttendanceEvent.Adjustment(
            EventId(2),
            OrganizationId,
            PlantId,
            StationId,
            WorkerId,
            AttendanceEventType.AdjustedCheckOut,
            2,
            At(2026, 10, 12, 14, 0),
            At(2026, 10, 12, 14, 1),
            PlantManagerId,
            "Olvido de salida.",
            Guid.Empty));
    }

    [TestMethod]
    public void PayUsesWorkerRateAndSplitsRegularAndNightMinutesExactly()
    {
        AttendanceEvent checkIn = CheckIn(1, At(2026, 10, 12, 17, 0));
        AttendanceEvent checkOut = CheckOut(2, At(2026, 10, 12, 20, 0));
        IReadOnlyList<AttendanceShift> shifts = AttendanceProjectionService.Project(
            [checkIn, checkOut],
            At(2026, 10, 12, 20, 0)).Shifts;
        Assert.HasCount(1, shifts);
        AttendanceShift shift = shifts[0];

        WorkerPayPolicy policy = Policy(regularHourlyRate: 1500m, nightMultiplier: 1.5m);
        AttendancePayProjection pay = AttendancePayProjectionService.Project(shift, policy)!;

        Assert.AreEqual(60m, pay.RegularMinutes);
        Assert.AreEqual(120m, pay.NightMinutes);
        Assert.AreEqual(6000m, pay.EstimatedPay);
    }

    [TestMethod]
    public void DifferentWorkersCanHaveDifferentVersionedRates()
    {
        WorkerPayPolicy standard = Policy(regularHourlyRate: 1500m);
        WorkerPayPolicy higher = new(
            Guid.Parse("61000000-0000-4000-8000-000000000002"),
            Guid.Parse("45000000-0000-4000-8000-000000000002"),
            2000m,
            1.5m,
            At(2026, 10, 1, 0, 0));

        Assert.AreEqual(1500m, standard.RegularHourlyRate);
        Assert.AreEqual(2250m, standard.NightHourlyRate);
        Assert.AreEqual(2000m, higher.RegularHourlyRate);
        Assert.AreEqual(3000m, higher.NightHourlyRate);
        Assert.AreNotEqual(standard.WorkerId, higher.WorkerId);
    }

    [TestMethod]
    public void PayPreservesExactMinutesAcrossRateBoundary()
    {
        AttendanceEvent checkIn = CheckIn(1, At(2026, 10, 12, 17, 59));
        AttendanceEvent checkOut = CheckOut(2, At(2026, 10, 12, 18, 1));
        AttendanceProjection projection = AttendanceProjectionService.Project(
            [checkIn, checkOut],
            At(2026, 10, 12, 18, 1));

        AttendancePayProjection pay = AttendancePayProjectionService.Project(
            projection.Shifts[0],
            Policy(regularHourlyRate: 1500m, nightMultiplier: 1.5m))!;

        Assert.AreEqual(1m, pay.RegularMinutes);
        Assert.AreEqual(1m, pay.NightMinutes);
        Assert.AreEqual(62.50m, pay.EstimatedPay);
    }

    [TestMethod]
    public void SynchronizedEventRequiresAndKeepsConfirmationTime()
    {
        DateTimeOffset occurredAt = At(2026, 10, 12, 6, 0);
        DateTimeOffset confirmedAt = occurredAt.AddMinutes(2);
        AttendanceEvent restored = AttendanceEvent.Restore(
            EventId(1),
            OrganizationId,
            PlantId,
            StationId,
            WorkerId,
            AttendanceEventType.CheckIn,
            1,
            occurredAt,
            occurredAt.AddSeconds(1),
            confirmedAt,
            AttendanceSyncStatus.Synchronized);

        Assert.AreEqual(confirmedAt.ToUniversalTime(), restored.ConfirmedAt);
        Assert.AreEqual(AttendanceSyncStatus.Synchronized, restored.SyncStatus);

        Assert.ThrowsExactly<ArgumentException>(() => AttendanceEvent.Restore(
            EventId(2),
            OrganizationId,
            PlantId,
            StationId,
            WorkerId,
            AttendanceEventType.CheckOut,
            2,
            occurredAt.AddHours(8),
            occurredAt.AddHours(8).AddSeconds(1),
            null,
            AttendanceSyncStatus.Synchronized));
    }

    [TestMethod]
    public void IdenticalRetryIsIdempotentButConflictingUuidIsRejected()
    {
        AttendanceEvent checkIn = CheckIn(1, At(2026, 10, 12, 6, 0));
        AttendanceProjection projection = AttendanceProjectionService.Project(
            [checkIn, checkIn],
            At(2026, 10, 12, 7, 0));

        Assert.HasCount(1, projection.Shifts);

        AttendanceEvent conflicting = CheckIn(1, At(2026, 10, 12, 6, 1), sequence: 2);
        Assert.ThrowsExactly<InvalidOperationException>(() =>
            AttendanceProjectionService.Project(
                [checkIn, conflicting],
                At(2026, 10, 12, 7, 0)));
    }

    private static AttendanceEvent CheckIn(
        int suffix,
        DateTimeOffset occurredAt,
        long? sequence = null) =>
        AttendanceEvent.CheckIn(
            EventId(suffix),
            OrganizationId,
            PlantId,
            StationId,
            WorkerId,
            sequence ?? suffix,
            occurredAt,
            occurredAt.AddSeconds(1));

    private static AttendanceEvent CheckOut(int suffix, DateTimeOffset occurredAt) =>
        AttendanceEvent.CheckOut(
            EventId(suffix),
            OrganizationId,
            PlantId,
            StationId,
            WorkerId,
            suffix,
            occurredAt,
            occurredAt.AddSeconds(1));

    private static WorkerPayPolicy Policy(
        decimal regularHourlyRate,
        decimal nightMultiplier = 1.5m) =>
        new(
            Guid.Parse("61000000-0000-4000-8000-000000000001"),
            WorkerId,
            regularHourlyRate,
            nightMultiplier,
            At(2026, 10, 1, 0, 0));

    private static DateTimeOffset At(
        int year,
        int month,
        int day,
        int hour,
        int minute) =>
        new(year, month, day, hour, minute, 0, TimeSpan.FromHours(-6));

    private static Guid EventId(int suffix) =>
        Guid.Parse($"62000000-0000-4000-8000-{suffix:D12}");
}
