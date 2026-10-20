namespace IndustriasDoradas.Desktop.Domain.Attendance;

public sealed record WorkerPayPolicy
{
    public WorkerPayPolicy(
        Guid id,
        Guid workerId,
        decimal regularHourlyRate,
        decimal nightMultiplier,
        DateTimeOffset effectiveFrom)
    {
        if (id == Guid.Empty)
        {
            throw new ArgumentException("La versión de tarifa es obligatoria.", nameof(id));
        }

        if (workerId == Guid.Empty)
        {
            throw new ArgumentException("El trabajador es obligatorio.", nameof(workerId));
        }

        if (regularHourlyRate <= 0)
        {
            throw new ArgumentOutOfRangeException(
                nameof(regularHourlyRate),
                "La tarifa regular debe ser positiva.");
        }

        if (nightMultiplier <= 0)
        {
            throw new ArgumentOutOfRangeException(
                nameof(nightMultiplier),
                "El multiplicador nocturno debe ser positivo.");
        }

        Id = id;
        WorkerId = workerId;
        RegularHourlyRate = regularHourlyRate;
        NightMultiplier = nightMultiplier;
        EffectiveFrom = effectiveFrom.ToUniversalTime();
    }

    public Guid Id { get; }

    public Guid WorkerId { get; }

    public decimal RegularHourlyRate { get; }

    public decimal NightMultiplier { get; }

    public DateTimeOffset EffectiveFrom { get; }

    public decimal NightHourlyRate => RegularHourlyRate * NightMultiplier;
}

public sealed record AttendancePayProjection(
    decimal RegularMinutes,
    decimal NightMinutes,
    decimal EstimatedPay);

public static class AttendancePayProjectionService
{
    private static readonly TimeZoneInfo CostaRicaTimeZone = TimeZoneInfo.CreateCustomTimeZone(
        "America/Costa_Rica",
        TimeSpan.FromHours(-6),
        "Costa Rica",
        "Costa Rica");

    private static readonly TimeOnly RegularStartsAt = new(6, 0);
    private static readonly TimeOnly NightStartsAt = new(18, 0);

    public static AttendancePayProjection? Project(
        AttendanceShift shift,
        WorkerPayPolicy policy)
    {
        ArgumentNullException.ThrowIfNull(shift);
        ArgumentNullException.ThrowIfNull(policy);
        if (shift.CheckOut is null)
        {
            return null;
        }

        if (shift.WorkerId != policy.WorkerId)
        {
            throw new InvalidOperationException(
                "La tarifa debe pertenecer al trabajador de la jornada.");
        }

        DateTimeOffset start = shift.CheckIn.OccurredAt;
        DateTimeOffset end = shift.CheckOut.OccurredAt;
        if (end < start)
        {
            throw new InvalidOperationException("La salida no puede anteceder a la entrada.");
        }

        decimal regularMinutes = 0;
        decimal nightMinutes = 0;
        DateTimeOffset cursor = start;
        while (cursor < end)
        {
            DateTimeOffset localCursor = TimeZoneInfo.ConvertTime(cursor, CostaRicaTimeZone);
            bool isRegular = IsRegular(localCursor);
            DateTimeOffset nextBoundary = NextBoundary(localCursor, isRegular);
            DateTimeOffset segmentEnd = nextBoundary < end ? nextBoundary : end;
            decimal minutes = (segmentEnd - cursor).Ticks / (decimal)TimeSpan.TicksPerMinute;
            if (isRegular)
            {
                regularMinutes += minutes;
            }
            else
            {
                nightMinutes += minutes;
            }

            cursor = segmentEnd;
        }

        decimal estimatedPay =
            (regularMinutes / 60m * policy.RegularHourlyRate) +
            (nightMinutes / 60m * policy.NightHourlyRate);

        return new AttendancePayProjection(
            regularMinutes,
            nightMinutes,
            decimal.Round(estimatedPay, 2, MidpointRounding.AwayFromZero));
    }

    private static bool IsRegular(DateTimeOffset local)
    {
        TimeOnly time = TimeOnly.FromDateTime(local.DateTime);
        return time >= RegularStartsAt && time < NightStartsAt;
    }

    private static DateTimeOffset NextBoundary(DateTimeOffset local, bool isRegular)
    {
        DateOnly localDate = DateOnly.FromDateTime(local.DateTime);
        TimeOnly boundaryTime = isRegular ? NightStartsAt : RegularStartsAt;
        if (!isRegular && TimeOnly.FromDateTime(local.DateTime) >= NightStartsAt)
        {
            localDate = localDate.AddDays(1);
        }

        DateTime boundary = localDate.ToDateTime(boundaryTime, DateTimeKind.Unspecified);
        TimeSpan offset = CostaRicaTimeZone.GetUtcOffset(boundary);
        return new DateTimeOffset(boundary, offset).ToUniversalTime();
    }
}
