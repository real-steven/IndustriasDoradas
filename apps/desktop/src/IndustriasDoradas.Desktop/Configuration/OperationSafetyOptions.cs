namespace IndustriasDoradas.Desktop.Configuration;

public sealed class OperationSafetyOptions
{
    public const string SectionName = "OperationSafety";

    public int DebounceMilliseconds { get; init; } = 75;
    public bool VisualFeedbackEnabled { get; init; } = true;
    public bool SoundFeedbackEnabled { get; init; } = true;
    public bool MetricsEnabled { get; init; } = true;
    public int MetricsQueueCapacity { get; init; } = 1000;

    public bool IsValid() =>
        DebounceMilliseconds is >= 25 and <= 500 &&
        MetricsQueueCapacity is >= 100 and <= 10000;
}
