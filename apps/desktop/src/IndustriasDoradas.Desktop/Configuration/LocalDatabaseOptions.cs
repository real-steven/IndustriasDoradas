namespace IndustriasDoradas.Desktop.Configuration;

public sealed class LocalDatabaseOptions
{
    public const string SectionName = "LocalDatabase";

    public string? BaseDirectory { get; init; }

    public int BusyTimeoutSeconds { get; init; } = 5;
}
