using System.Globalization;
using System.IO;
using IndustriasDoradas.Desktop.Application.Abstractions;
using Microsoft.Data.Sqlite;

namespace IndustriasDoradas.Desktop.Infrastructure.LocalStorage;

public sealed class SqliteDatabaseDiagnostics(ILocalSqliteConnectionFactory connectionFactory)
    : ILocalDatabaseDiagnostics
{
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
        cancellationToken.ThrowIfCancellationRequested();
        return destinationPath;
    }
}
