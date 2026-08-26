using System.Globalization;
using Microsoft.Data.Sqlite;

namespace IndustriasDoradas.Desktop.Infrastructure.LocalStorage;

public sealed record LocalDatabaseMigrationResult(
    long CurrentVersion,
    int AppliedCount,
    string JournalMode);

public sealed class SqliteDatabaseMigrator(ILocalSqliteConnectionFactory connectionFactory)
{
    public Task<LocalDatabaseMigrationResult> MigrateAsync(
        CancellationToken cancellationToken = default) =>
        MigrateAsync(SqliteMigrationCatalog.All, cancellationToken);

    public async Task<LocalDatabaseMigrationResult> MigrateAsync(
        IReadOnlyList<SqliteMigration> migrations,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(migrations);
        EnsureCatalogIsValid(migrations);

        try
        {
            await using SqliteConnection connection = await connectionFactory
                .OpenAsync(cancellationToken)
                .ConfigureAwait(false);
            string journalMode = await ConfigureDurabilityAsync(connection, cancellationToken)
                .ConfigureAwait(false);
            await EnsureMigrationTableAsync(connection, cancellationToken).ConfigureAwait(false);
            Dictionary<long, string> applied = await ReadAppliedAsync(connection, cancellationToken)
                .ConfigureAwait(false);
            EnsureAppliedHistoryMatches(applied, migrations);

            int appliedCount = 0;
            foreach (SqliteMigration migration in migrations.Where(item => !applied.ContainsKey(item.Version)))
            {
                using SqliteTransaction transaction = connection.BeginTransaction();
                await using SqliteCommand migrationCommand = connection.CreateCommand();
                migrationCommand.Transaction = transaction;
                migrationCommand.CommandText = migration.Sql;
                await migrationCommand.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);

                await using SqliteCommand historyCommand = connection.CreateCommand();
                historyCommand.Transaction = transaction;
                historyCommand.CommandText = """
                    INSERT INTO local_schema_migrations(version, name, applied_at_utc)
                    VALUES ($version, $name, $appliedAtUtc);
                    """;
                historyCommand.Parameters.AddWithValue("$version", migration.Version);
                historyCommand.Parameters.AddWithValue("$name", migration.Name);
                historyCommand.Parameters.AddWithValue(
                    "$appliedAtUtc",
                    DateTimeOffset.UtcNow.ToString("O", CultureInfo.InvariantCulture));
                await historyCommand.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
                transaction.Commit();
                appliedCount++;
            }

            await EnsureForeignKeysAreValidAsync(connection, cancellationToken).ConfigureAwait(false);
            long currentVersion = migrations.Count == 0 ? 0 : migrations[^1].Version;
            return new LocalDatabaseMigrationResult(currentVersion, appliedCount, journalMode);
        }
        catch (SqliteException exception)
        {
            throw new InvalidOperationException(
                "No se pudo preparar la base SQLite local de la estación.",
                exception);
        }
    }

    private static void EnsureCatalogIsValid(IReadOnlyList<SqliteMigration> migrations)
    {
        long previous = 0;
        foreach (SqliteMigration migration in migrations)
        {
            if (migration.Version <= previous || string.IsNullOrWhiteSpace(migration.Name) ||
                string.IsNullOrWhiteSpace(migration.Sql))
            {
                throw new InvalidOperationException("El catálogo de migraciones SQLite es inválido.");
            }

            previous = migration.Version;
        }
    }

    private static async Task<string> ConfigureDurabilityAsync(
        SqliteConnection connection,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand journalCommand = connection.CreateCommand();
        journalCommand.CommandText = "PRAGMA journal_mode = WAL;";
        string journalMode = Convert.ToString(
            await journalCommand.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false),
            CultureInfo.InvariantCulture) ?? string.Empty;
        if (!string.Equals(journalMode, "wal", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("SQLite no pudo habilitar WAL en la ruta local configurada.");
        }

        await using SqliteCommand durabilityCommand = connection.CreateCommand();
        durabilityCommand.CommandText = "PRAGMA synchronous = FULL; PRAGMA wal_autocheckpoint = 1000;";
        await durabilityCommand.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        return journalMode;
    }

    private static async Task EnsureMigrationTableAsync(
        SqliteConnection connection,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            CREATE TABLE IF NOT EXISTS local_schema_migrations (
                version INTEGER PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                applied_at_utc TEXT NOT NULL
            );
            """;
        await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    private static async Task<Dictionary<long, string>> ReadAppliedAsync(
        SqliteConnection connection,
        CancellationToken cancellationToken)
    {
        var result = new Dictionary<long, string>();
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = "SELECT version, name FROM local_schema_migrations ORDER BY version;";
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            result.Add(reader.GetInt64(0), reader.GetString(1));
        }

        return result;
    }

    private static void EnsureAppliedHistoryMatches(
        IReadOnlyDictionary<long, string> applied,
        IReadOnlyList<SqliteMigration> migrations)
    {
        Dictionary<long, SqliteMigration> catalog = migrations.ToDictionary(item => item.Version);
        foreach ((long version, string name) in applied)
        {
            if (!catalog.TryGetValue(version, out SqliteMigration? migration) || migration.Name != name)
            {
                throw new InvalidOperationException(
                    "El historial SQLite no coincide con las migraciones conocidas; no se modificó la base.");
            }
        }
    }

    private static async Task EnsureForeignKeysAreValidAsync(
        SqliteConnection connection,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = "PRAGMA foreign_key_check;";
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        if (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            throw new InvalidOperationException("SQLite detectó referencias locales inválidas.");
        }
    }
}
