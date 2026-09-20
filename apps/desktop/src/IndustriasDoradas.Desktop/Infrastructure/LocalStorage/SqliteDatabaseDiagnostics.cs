using System.Globalization;
using System.IO;
using System.Text.Json;
using System.Text.RegularExpressions;
using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Configuration;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Infrastructure.LocalStorage;

public sealed class SqliteDatabaseDiagnostics : ILocalDatabaseDiagnostics
{
    private static readonly Regex SensitiveFieldPattern = new(
        "password|contrasena|contraseña|pin|token|secret|authorization|cookie|photo|foto|image|imagen|biometric|biometr",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    private readonly ILocalSqliteConnectionFactory connectionFactory;
    private readonly TimeProvider timeProvider;
    private readonly LocalRecoveryOptions options;

    public SqliteDatabaseDiagnostics(
        ILocalSqliteConnectionFactory connectionFactory,
        TimeProvider timeProvider,
        IOptions<LocalRecoveryOptions> options)
    {
        this.connectionFactory = connectionFactory;
        this.timeProvider = timeProvider;
        this.options = options.Value;
    }

    public SqliteDatabaseDiagnostics(ILocalSqliteConnectionFactory connectionFactory)
        : this(connectionFactory, TimeProvider.System, Options.Create(new LocalRecoveryOptions()))
    {
    }

    public async Task<LocalDatabaseHealth> InspectAsync(CancellationToken cancellationToken = default)
    {
        DateTimeOffset checkedAt = timeProvider.GetUtcNow().ToUniversalTime();
        try
        {
            await using SqliteConnection connection = await connectionFactory.OpenAsync(cancellationToken)
                .ConfigureAwait(false);
            string integrity = await ScalarTextAsync(connection, "PRAGMA integrity_check;", cancellationToken)
                .ConfigureAwait(false);
            if (!string.Equals(integrity, "ok", StringComparison.OrdinalIgnoreCase))
            {
                return Unavailable(
                    LocalDatabaseHealthIssue.Corrupt,
                    checkedAt,
                    "La base local no superó la comprobación de integridad.",
                    "Detenga la operación y restaure únicamente una copia validada.");
            }

            long foreignKeyFailures = await ScalarLongAsync(
                connection,
                "SELECT COUNT(*) FROM pragma_foreign_key_check;",
                cancellationToken).ConfigureAwait(false);
            if (foreignKeyFailures != 0)
            {
                return Unavailable(
                    LocalDatabaseHealthIssue.Corrupt,
                    checkedAt,
                    "La base local contiene referencias inválidas.",
                    "Detenga la operación y solicite diagnóstico; no edite las tablas manualmente.");
            }

            OutboxCounts outbox = await ReadOutboxCountsAsync(connection, cancellationToken)
                .ConfigureAwait(false);
            SyncDiagnosticState sync = await ReadSyncStateAsync(connection, cancellationToken)
                .ConfigureAwait(false);
            IReadOnlyList<SyncFailureDiagnostic> failures = await ReadFailuresAsync(connection, cancellationToken)
                .ConfigureAwait(false);
            IReadOnlyList<AdministrativeCorrectionDiagnostic> corrections =
                await ReadCorrectionsAsync(connection, cancellationToken).ConfigureAwait(false);
            int pullReviews = checked((int)await ScalarLongAsync(
                connection, "SELECT COUNT(*) FROM sync_pull_reviews;", cancellationToken).ConfigureAwait(false));
            DateTimeOffset? latest = await ReadLatestRecordedAtAsync(connection, cancellationToken)
                .ConfigureAwait(false);
            long freeBytes = ReadAvailableFreeBytes(connectionFactory.DatabasePath);
            if (latest > checkedAt.Add(LocalClockPolicy.AllowedRollback))
            {
                return new LocalDatabaseHealth(
                    LocalDatabaseHealthState.Unavailable,
                    LocalDatabaseHealthIssue.ClockRollback,
                    outbox.Pending,
                    freeBytes,
                    latest,
                    checkedAt,
                    "El reloj del equipo está atrasado respecto de la última operación local.",
                    "Corrija fecha, hora y zona horaria antes de registrar nuevos eventos.",
                    outbox.FailedReview,
                    outbox.Synced,
                    sync.LastSynchronizationAt,
                    sync.ClockDeviationSeconds,
                    failures,
                    corrections,
                    pullReviews);
            }

            long minimumBytes = options.MinimumFreeMegabytes * 1024L * 1024L;
            if (freeBytes >= 0 && freeBytes < minimumBytes)
            {
                return new LocalDatabaseHealth(
                    LocalDatabaseHealthState.Attention,
                    LocalDatabaseHealthIssue.LowDiskSpace,
                    outbox.Pending,
                    freeBytes,
                    latest,
                    checkedAt,
                    "Queda poco espacio en el disco de operación.",
                    "Libere espacio antes de continuar una jornada prolongada.",
                    outbox.FailedReview,
                    outbox.Synced,
                    sync.LastSynchronizationAt,
                    sync.ClockDeviationSeconds,
                    failures,
                    corrections,
                    pullReviews);
            }

            return new LocalDatabaseHealth(
                LocalDatabaseHealthState.Healthy,
                LocalDatabaseHealthIssue.None,
                outbox.Pending,
                freeBytes,
                latest,
                checkedAt,
                "Guardado local disponible e íntegro.",
                outbox.Pending == 0
                    ? "No hay acciones locales pendientes de envío."
                    : "Las acciones pendientes están conservadas y el worker seguirá intentando enviarlas.",
                outbox.FailedReview,
                outbox.Synced,
                sync.LastSynchronizationAt,
                sync.ClockDeviationSeconds,
                failures,
                corrections,
                pullReviews);
        }
        catch (Exception exception) when (exception is SqliteException or IOException or InvalidOperationException)
        {
            LocalStorageFailure failure = LocalStorageFailureClassifier.Classify(exception);
            return Unavailable(Map(failure.Kind), checkedAt, failure.UserMessage, failure.RecoveryInstruction);
        }
    }

    public async Task<string> CreateConsistentCopyAsync(
        string destinationDirectory,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(destinationDirectory);
        string resolvedDirectory = Path.GetFullPath(destinationDirectory);
        Directory.CreateDirectory(resolvedDirectory);
        string destinationPath = Path.Combine(
            resolvedDirectory,
            $"operation-diagnostic-{DateTimeOffset.UtcNow.ToString("yyyyMMdd-HHmmss", CultureInfo.InvariantCulture)}-{Guid.NewGuid():N}.sqlite3");

        try
        {
            cancellationToken.ThrowIfCancellationRequested();
            await using SqliteConnection source = await connectionFactory
                .OpenAsync(cancellationToken)
                .ConfigureAwait(false);
            var destination = new SqliteConnectionStringBuilder
            {
                DataSource = destinationPath,
                Mode = SqliteOpenMode.ReadWriteCreate,
                Pooling = false,
            };
            await using var target = new SqliteConnection(destination.ToString());
            await target.OpenAsync(cancellationToken).ConfigureAwait(false);
            source.BackupDatabase(target);
            string integrity = await ScalarTextAsync(target, "PRAGMA integrity_check;", cancellationToken)
                .ConfigureAwait(false);
            if (!string.Equals(integrity, "ok", StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("La copia SQLite no superó la comprobación de integridad.");
            }

            cancellationToken.ThrowIfCancellationRequested();
            return destinationPath;
        }
        catch
        {
            if (File.Exists(destinationPath)) File.Delete(destinationPath);
            throw;
        }
    }

    private static async Task<string> ScalarTextAsync(
        SqliteConnection connection,
        string sql,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = sql;
        return Convert.ToString(
            await command.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false),
            CultureInfo.InvariantCulture) ?? string.Empty;
    }

    private static async Task<long> ScalarLongAsync(
        SqliteConnection connection,
        string sql,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = sql;
        return Convert.ToInt64(
            await command.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false),
            CultureInfo.InvariantCulture);
    }

    private static async Task<OutboxCounts> ReadOutboxCountsAsync(
        SqliteConnection connection,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            SELECT
                COALESCE(SUM(CASE WHEN state IN ('PENDING', 'SYNCING') THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN state = 'FAILED_REVIEW' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN state = 'SYNCED' THEN 1 ELSE 0 END), 0)
            FROM outbox_messages;
            """;
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        await reader.ReadAsync(cancellationToken).ConfigureAwait(false);
        return new OutboxCounts(reader.GetInt32(0), reader.GetInt32(1), reader.GetInt32(2));
    }

    private static async Task<DateTimeOffset?> ReadLatestRecordedAtAsync(
        SqliteConnection connection,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            SELECT MAX(value) FROM (
                SELECT MAX(recorded_at_utc) AS value FROM production_events
                UNION ALL SELECT MAX(updated_at_utc) FROM operational_sessions
                UNION ALL SELECT MAX(created_at_utc) FROM outbox_messages
                UNION ALL SELECT MAX(recorded_at_utc) FROM operation_input_metrics
            );
            """;
        object? value = await command.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false);
        return value is null or DBNull
            ? null
            : SqliteLocalStorageConverters.ReadTimestamp(Convert.ToString(value, CultureInfo.InvariantCulture)!);
    }

    private static async Task<SyncDiagnosticState> ReadSyncStateAsync(
        SqliteConnection connection,
        CancellationToken cancellationToken)
    {
        DateTimeOffset? pullServerAt = null;
        DateTimeOffset? pullReceivedAt = null;
        await using (SqliteCommand command = connection.CreateCommand())
        {
            command.CommandText = "SELECT updated_at_utc, local_received_at_utc FROM sync_pull_state WHERE singleton_id = 1;";
            await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
                .ConfigureAwait(false);
            if (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
            {
                pullServerAt = reader.IsDBNull(0) ? null : ReadTimestamp(reader.GetString(0));
                pullReceivedAt = reader.IsDBNull(1) ? null : ReadTimestamp(reader.GetString(1));
            }
        }

        DateTimeOffset? pushAt = await ScalarTimestampAsync(
            connection,
            "SELECT MAX(synced_at_utc) FROM outbox_messages WHERE state = 'SYNCED';",
            cancellationToken).ConfigureAwait(false);
        DateTimeOffset? last = new[] { pushAt, pullReceivedAt }.Where(value => value is not null)
            .MaxBy(value => value);
        double? deviation = pullServerAt is not null && pullReceivedAt is not null
            ? (pullServerAt.Value - pullReceivedAt.Value).TotalSeconds
            : null;
        return new SyncDiagnosticState(last, deviation);
    }

    private static async Task<IReadOnlyList<SyncFailureDiagnostic>> ReadFailuresAsync(
        SqliteConnection connection,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            SELECT operation_type, COALESCE(last_error_code, 'UNKNOWN_FAILURE'), attempt_count,
                   created_at_utc, updated_at_utc
            FROM outbox_messages
            WHERE state = 'FAILED_REVIEW'
            ORDER BY updated_at_utc DESC
            LIMIT 20;
            """;
        var result = new List<SyncFailureDiagnostic>();
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            result.Add(new SyncFailureDiagnostic(
                reader.GetString(0), reader.GetString(1), DescribeFailure(reader.GetString(1)), reader.GetInt32(2),
                ReadTimestamp(reader.GetString(3)), ReadTimestamp(reader.GetString(4))));
        }
        return result;
    }

    private static string DescribeFailure(string code) => code switch
    {
        "STATION_REVOKED" => "La estación fue desactivada en la configuración central.",
        "LINE_REVOKED" => "La línea ya no está autorizada para esta estación.",
        "PERMISSION_VERSION_MISMATCH" => "La autorización cambió después de registrar el evento.",
        "CLOCK_SKEW_REVIEW" => "El reloj del equipo estaba adelantado fuera del margen permitido.",
        "LINE_OPERATION_CONFLICT" => "Otra estación ya tenía un cargamento activo en la misma línea.",
        "DATABASE_CONSTRAINT_VIOLATION" => "El evento contradice una regla de integridad central.",
        "INVALID_EVENT" or "INVALID_LOCAL_PAYLOAD" => "El contenido del evento no cumple el contrato de sincronización.",
        "AUTH_REFRESH_REQUIRED" => "La sesión debe renovarse con conexión.",
        _ => "Revisión técnica requerida; entregue este código al soporte.",
    };

    private static async Task<IReadOnlyList<AdministrativeCorrectionDiagnostic>> ReadCorrectionsAsync(
        SqliteConnection connection,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            SELECT payload_json, changed_at_utc
            FROM sync_entity_cache
            WHERE action = 'CORRECTION_APPENDED'
            ORDER BY changed_at_utc DESC
            LIMIT 20;
            """;
        var result = new List<AdministrativeCorrectionDiagnostic>();
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            try
            {
                using JsonDocument document = JsonDocument.Parse(reader.GetString(0));
                JsonElement payload = document.RootElement;
                DateTimeOffset fallback = ReadTimestamp(reader.GetString(1));
                result.Add(new AdministrativeCorrectionDiagnostic(
                    SafeText(payload, "administrator", "Administrador"),
                    SafeText(payload, "role_code", "ROL_NO_INDICADO"),
                    SafeText(payload, "reason_code", "CAMBIO_ADMINISTRATIVO"),
                    SafeText(payload, "event_action", "business.mutation"),
                    SafeText(payload, "target_entity_type", "registro"),
                    SafeTimestamp(payload, "occurred_at_utc", fallback),
                    ReadSafeChanges(payload)));
            }
            catch (JsonException)
            {
                // Un payload dañado permanece en la caché para revisión, pero no se expone en pantalla.
            }
        }
        return result;
    }

    private static List<string> ReadSafeChanges(JsonElement payload)
    {
        if (!payload.TryGetProperty("changes", out JsonElement changes) ||
            changes.ValueKind != JsonValueKind.Object)
            return ["Cambio registrado sin detalle visible."];
        var result = new List<string>();
        foreach (JsonProperty field in changes.EnumerateObject())
        {
            if (SensitiveFieldPattern.IsMatch(field.Name) || field.Value.ValueKind != JsonValueKind.Object)
                continue;
            string before = ScalarDisplay(field.Value, "before");
            string after = ScalarDisplay(field.Value, "after");
            result.Add($"{field.Name}: {before} → {after}");
        }
        return result.Count == 0 ? ["Cambio registrado sin detalle visible."] : result;
    }

    private static string ScalarDisplay(JsonElement value, string property)
    {
        if (!value.TryGetProperty(property, out JsonElement scalar)) return "—";
        return scalar.ValueKind switch
        {
            JsonValueKind.String => scalar.GetString() ?? "—",
            JsonValueKind.Number => scalar.GetRawText(),
            JsonValueKind.True => "sí",
            JsonValueKind.False => "no",
            _ => "—",
        };
    }

    private static string SafeText(JsonElement payload, string property, string fallback) =>
        payload.TryGetProperty(property, out JsonElement value) && value.ValueKind == JsonValueKind.String &&
        !string.IsNullOrWhiteSpace(value.GetString()) ? value.GetString()! : fallback;

    private static DateTimeOffset SafeTimestamp(JsonElement payload, string property, DateTimeOffset fallback) =>
        payload.TryGetProperty(property, out JsonElement value) && value.ValueKind == JsonValueKind.String &&
        DateTimeOffset.TryParse(value.GetString(), CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal, out DateTimeOffset parsed) ? parsed : fallback;

    private static async Task<DateTimeOffset?> ScalarTimestampAsync(
        SqliteConnection connection,
        string sql,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = sql;
        object? value = await command.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false);
        return value is null or DBNull ? null : ReadTimestamp(Convert.ToString(value, CultureInfo.InvariantCulture)!);
    }

    private static DateTimeOffset ReadTimestamp(string value) =>
        SqliteLocalStorageConverters.ReadTimestamp(value);

    private static long ReadAvailableFreeBytes(string databasePath)
    {
        string? root = Path.GetPathRoot(Path.GetFullPath(databasePath));
        if (string.IsNullOrWhiteSpace(root)) return -1;
        try { return new DriveInfo(root).AvailableFreeSpace; }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException) { return -1; }
    }

    private static LocalDatabaseHealth Unavailable(
        LocalDatabaseHealthIssue issue,
        DateTimeOffset checkedAt,
        string summary,
        string instruction) =>
        new(LocalDatabaseHealthState.Unavailable, issue, 0, -1, null, checkedAt, summary, instruction);

    private static LocalDatabaseHealthIssue Map(LocalStorageFailureKind kind) => kind switch
    {
        LocalStorageFailureKind.Locked => LocalDatabaseHealthIssue.Locked,
        LocalStorageFailureKind.DiskFull => LocalDatabaseHealthIssue.DiskFull,
        LocalStorageFailureKind.Corrupt => LocalDatabaseHealthIssue.Corrupt,
        LocalStorageFailureKind.Unavailable => LocalDatabaseHealthIssue.Unavailable,
        _ => LocalDatabaseHealthIssue.Unknown,
    };

    private sealed record OutboxCounts(int Pending, int FailedReview, int Synced);
    private sealed record SyncDiagnosticState(
        DateTimeOffset? LastSynchronizationAt,
        double? ClockDeviationSeconds);
}
