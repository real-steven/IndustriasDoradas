using System.IO;
using IndustriasDoradas.Desktop.Configuration;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Infrastructure.LocalStorage;

public interface ILocalSqliteConnectionFactory
{
    string DatabasePath { get; }

    Task<SqliteConnection> OpenAsync(CancellationToken cancellationToken = default);
}

public sealed class SqliteConnectionFactory : ILocalSqliteConnectionFactory
{
    private readonly int busyTimeoutSeconds;

    public SqliteConnectionFactory(
        ILocalDatabasePathProvider pathProvider,
        IOptions<LocalDatabaseOptions> options)
    {
        DatabasePath = pathProvider.DatabasePath;
        busyTimeoutSeconds = options.Value.BusyTimeoutSeconds;
    }

    public string DatabasePath { get; }

    public async Task<SqliteConnection> OpenAsync(CancellationToken cancellationToken = default)
    {
        string directory = Path.GetDirectoryName(DatabasePath)
            ?? throw new InvalidOperationException("La ruta de la base local no tiene directorio.");
        Directory.CreateDirectory(directory);

        var connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = DatabasePath,
            Mode = SqliteOpenMode.ReadWriteCreate,
            Cache = SqliteCacheMode.Private,
            ForeignKeys = true,
            Pooling = true,
            DefaultTimeout = busyTimeoutSeconds,
        };
        var connection = new SqliteConnection(connectionString.ToString());

        try
        {
            await connection.OpenAsync(cancellationToken).ConfigureAwait(false);
            await using SqliteCommand command = connection.CreateCommand();
            command.CommandText = $"""
                PRAGMA foreign_keys = ON;
                PRAGMA busy_timeout = {busyTimeoutSeconds * 1000};
                PRAGMA synchronous = FULL;
                """;
            await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
            return connection;
        }
        catch
        {
            await connection.DisposeAsync().ConfigureAwait(false);
            throw;
        }
    }
}
