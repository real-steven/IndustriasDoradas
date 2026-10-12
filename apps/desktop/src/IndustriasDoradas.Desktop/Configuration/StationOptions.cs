namespace IndustriasDoradas.Desktop.Configuration;

public sealed class StationOptions
{
    public const string SectionName = "Station";
    public Guid Id { get; init; }
    public string Name { get; init; } = "Estación Avangares";
    public int SessionIdleSeconds { get; init; } = 3600;
    public int PrivilegedIdleSeconds { get; init; } = 300;
    public int OfflineHours { get; init; } = 24;
}
