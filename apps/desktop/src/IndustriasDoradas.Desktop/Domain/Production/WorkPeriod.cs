namespace IndustriasDoradas.Desktop.Domain.Production;

public enum WorkPeriod
{
    Day,
    Night,
}

public static class WorkPeriodSchedule
{
    public const string TimeZoneId = "America/Costa_Rica";

    private static readonly TimeOnly DayStartsAt = new(6, 0);
    private static readonly TimeOnly NightStartsAt = new(18, 0);
    private static readonly TimeZoneInfo CostaRicaTimeZone = TimeZoneInfo.CreateCustomTimeZone(
        TimeZoneId,
        TimeSpan.FromHours(-6),
        "Costa Rica",
        "Costa Rica");

    public static WorkPeriod At(DateTimeOffset instant)
    {
        DateTimeOffset local = TimeZoneInfo.ConvertTime(instant, CostaRicaTimeZone);
        TimeOnly localTime = TimeOnly.FromDateTime(local.DateTime);

        return localTime >= DayStartsAt && localTime < NightStartsAt
            ? WorkPeriod.Day
            : WorkPeriod.Night;
    }
}
