namespace IndustriasDoradas.Desktop.Configuration;

public sealed class StationOptions
{
    public const string SectionName = "Station";
    public Guid Id { get; init; }
    public int PrivilegedIdleSeconds { get; init; } = 120;
    public int OfflineHours { get; init; } = 24;
}
