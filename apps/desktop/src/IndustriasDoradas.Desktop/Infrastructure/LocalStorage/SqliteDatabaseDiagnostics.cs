using System.Globalization;
using System.IO;
using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Configuration;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Infrastructure.LocalStorage;

public sealed class SqliteDatabaseDiagnostics : ILocalDatabaseDiagnostics
{
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

            int pending = checked((int)await ScalarLongAsync(
                connection,
                "SELECT COUNT(*) FROM outbox_messages WHERE state IN ('PENDING', 'FAILED');",
                cancellationToken).ConfigureAwait(false));
            DateTimeOffset? latest = await ReadLatestRecordedAtAsync(connection, cancellationToken)
                .ConfigureAwait(false);
            long freeBytes = ReadAvailableFreeBytes(connectionFactory.DatabasePath);
            if (latest > checkedAt.Add(LocalClockPolicy.AllowedRollback))
            {
                return new LocalDatabaseHealth(
                    LocalDatabaseHealthState.Unavailable,
                    LocalDatabaseHealthIssue.ClockRollback,
                    pending,
                    freeBytes,
                    latest,
                    checkedAt,
                    "El reloj del equipo está atrasado respecto de la última operación local.",
                    "Corrija fecha, hora y zona horaria antes de registrar nuevos eventos.");
            }

            long minimumBytes = options.MinimumFreeMegabytes * 1024L * 1024L;
            if (freeBytes >= 0 && freeBytes < minimumBytes)
            {
                return new LocalDatabaseHealth(
                    LocalDatabaseHealthState.Attention,
                    LocalDatabaseHealthIssue.LowDiskSpace,
                    pending,
                    freeBytes,
                    latest,
                    checkedAt,
                    "Queda poco espacio en el disco de operación.",
                    "Libere espacio antes de continuar una jornada prolongada.");
            }

            return new LocalDatabaseHealth(
                LocalDatabaseHealthState.Healthy,
                LocalDatabaseHealthIssue.None,
                pending,
                freeBytes,
                latest,
                checkedAt,
                "Guardado local disponible e íntegro.",
                pending == 0
                    ? "No hay acciones locales pendientes."
                    : "Los pendientes están conservados localmente; no se enviarán en este sprint.");
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
}
