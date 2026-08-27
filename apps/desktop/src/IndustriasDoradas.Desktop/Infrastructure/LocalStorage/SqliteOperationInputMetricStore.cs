using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Application.Abstractions;
using Microsoft.Data.Sqlite;

namespace IndustriasDoradas.Desktop.Infrastructure.LocalStorage;

public sealed class SqliteOperationInputMetricStore(ILocalSqliteConnectionFactory connectionFactory)
    : ILocalOperationInputMetricStore
{
    public async Task AppendAsync(LocalOperationInputMetric metric, CancellationToken cancellationToken = default)
    {
        Validate(metric);
        await using SqliteConnection connection = await connectionFactory.OpenAsync(cancellationToken).ConfigureAwait(false);
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO operation_input_metrics
                (id, action, source_kind, outcome, latency_ms, input_interval_ms,
                 was_repeat, error_code, occurred_at_utc, recorded_at_utc)
            VALUES
                ($id, $action, $source, $outcome, $latency, $interval,
                 $repeat, $error, $occurred, $recorded);
            """;
        command.Parameters.AddWithValue("$id", SqliteLocalStorageConverters.Id(metric.Id, nameof(metric.Id)));
        command.Parameters.AddWithValue("$action", Action(metric.Action));
        command.Parameters.AddWithValue("$source", SqliteLocalStorageConverters.Text(metric.SourceKind, nameof(metric.SourceKind)));
        command.Parameters.AddWithValue("$outcome", Outcome(metric.Outcome));
        command.Parameters.AddWithValue("$latency", metric.LatencyMilliseconds);
        command.Parameters.AddWithValue("$interval", (object?)metric.InputIntervalMilliseconds ?? DBNull.Value);
        command.Parameters.AddWithValue("$repeat", metric.WasRepeat ? 1 : 0);
        command.Parameters.AddWithValue("$error", (object?)metric.ErrorCode?.Trim() ?? DBNull.Value);
        command.Parameters.AddWithValue("$occurred", SqliteLocalStorageConverters.Timestamp(metric.OccurredAt));
        command.Parameters.AddWithValue("$recorded", SqliteLocalStorageConverters.Timestamp(metric.RecordedAt));
        await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    public async Task<IReadOnlyList<LocalOperationInputMetric>> ListRecentAsync(int limit, CancellationToken cancellationToken = default)
    {
        if (limit is < 1 or > 500)
        {
            throw new ArgumentOutOfRangeException(nameof(limit), "El límite debe estar entre 1 y 500.");
        }

        await using SqliteConnection connection = await connectionFactory.OpenAsync(cancellationToken).ConfigureAwait(false);
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            SELECT id, action, source_kind, outcome, latency_ms, input_interval_ms,
                   was_repeat, error_code, occurred_at_utc, recorded_at_utc
            FROM operation_input_metrics
            ORDER BY recorded_at_utc DESC, id DESC
            LIMIT $limit;
            """;
        command.Parameters.AddWithValue("$limit", limit);
        var metrics = new List<LocalOperationInputMetric>();
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);
        while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            metrics.Add(new LocalOperationInputMetric(
                Guid.Parse(reader.GetString(0)), ReadAction(reader.GetString(1)), reader.GetString(2),
                ReadOutcome(reader.GetString(3)), reader.GetDouble(4), reader.IsDBNull(5) ? null : reader.GetDouble(5),
                reader.GetInt32(6) == 1, reader.IsDBNull(7) ? null : reader.GetString(7),
                SqliteLocalStorageConverters.ReadTimestamp(reader.GetString(8)),
                SqliteLocalStorageConverters.ReadTimestamp(reader.GetString(9))));
        }

        return metrics;
    }

    private static void Validate(LocalOperationInputMetric metric)
    {
        ArgumentNullException.ThrowIfNull(metric);
        if (!double.IsFinite(metric.LatencyMilliseconds) || metric.LatencyMilliseconds is < 0 or > 60000)
            throw new ArgumentOutOfRangeException(nameof(metric));
        if (metric.InputIntervalMilliseconds is double interval && (!double.IsFinite(interval) || interval is < 0 or > 60000))
            throw new ArgumentOutOfRangeException(nameof(metric));
        if (metric.RecordedAt.ToUniversalTime() < metric.OccurredAt.ToUniversalTime())
            throw new ArgumentException("El registro no puede preceder a la entrada.", nameof(metric));
        if (metric.ErrorCode is not null) SqliteLocalStorageConverters.Text(metric.ErrorCode, nameof(metric.ErrorCode));
    }

    private static string Action(OperationInputAction value) => value.ToString().ToUpperInvariant();
    private static OperationInputAction ReadAction(string value) => Enum.Parse<OperationInputAction>(value, true);
    private static string Outcome(OperationInputMetricOutcome value) => value.ToString().ToUpperInvariant();
    private static OperationInputMetricOutcome ReadOutcome(string value) => Enum.Parse<OperationInputMetricOutcome>(value, true);
}
