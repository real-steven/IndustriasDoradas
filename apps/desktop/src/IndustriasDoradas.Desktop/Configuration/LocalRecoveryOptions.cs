namespace IndustriasDoradas.Desktop.Configuration;

public sealed class LocalRecoveryOptions
{
    public const string SectionName = "LocalRecovery";

    public int MinimumFreeMegabytes { get; init; } = 256;
    public bool IsValid() => MinimumFreeMegabytes is >= 64 and <= 10240;
}
