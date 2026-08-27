using IndustriasDoradas.Desktop.Application;
using Microsoft.Data.Sqlite;

namespace IndustriasDoradas.Desktop.Infrastructure.LocalStorage;

internal static class SqliteLocalClockGuard
{
    public static async Task EnsureNotRolledBackAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        DateTimeOffset candidate,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "SELECT MAX(created_at_utc) FROM outbox_messages;";
        object? value = await command.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false);
        if (value is null or DBNull) return;
        DateTimeOffset latest = SqliteLocalStorageConverters.ReadTimestamp((string)value);
        if (candidate.ToUniversalTime().Add(LocalClockPolicy.AllowedRollback) < latest)
        {
            throw new LocalClockRollbackException();
        }
    }
}
