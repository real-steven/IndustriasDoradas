namespace IndustriasDoradas.Desktop.Configuration;

public sealed class SyncOptions
{
    public const string SectionName = "Sync";

    public int BatchSize { get; init; } = 100;
    public int PollIntervalSeconds { get; init; } = 5;
    public int LeaseSeconds { get; init; } = 60;
    public int BaseRetrySeconds { get; init; } = 2;
    public int MaximumRetrySeconds { get; init; } = 300;
    public double JitterRatio { get; init; } = 0.25;

    public bool IsValid() =>
        BatchSize is >= 1 and <= 500 &&
        PollIntervalSeconds is >= 1 and <= 60 &&
        LeaseSeconds is >= 15 and <= 600 &&
        BaseRetrySeconds is >= 1 and <= 60 &&
        MaximumRetrySeconds >= BaseRetrySeconds && MaximumRetrySeconds <= 3600 &&
        JitterRatio is >= 0 and <= 1;
}
