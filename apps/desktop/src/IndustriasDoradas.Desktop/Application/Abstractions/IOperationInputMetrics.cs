namespace IndustriasDoradas.Desktop.Application.Abstractions;

public enum OperationInputMetricOutcome
{
    Accepted,
    Suppressed,
    Unavailable,
    Failed,
}

public sealed record LocalOperationInputMetric(
    Guid Id,
    OperationInputAction Action,
    string SourceKind,
    OperationInputMetricOutcome Outcome,
    double LatencyMilliseconds,
    double? InputIntervalMilliseconds,
    bool WasRepeat,
    string? ErrorCode,
    DateTimeOffset OccurredAt,
    DateTimeOffset RecordedAt);

public interface IOperationInputMetrics
{
    void Record(LocalOperationInputMetric metric);
}

public interface ILocalOperationInputMetricStore
{
    Task AppendAsync(
        LocalOperationInputMetric metric,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<LocalOperationInputMetric>> ListRecentAsync(
        int limit,
        CancellationToken cancellationToken = default);
}
