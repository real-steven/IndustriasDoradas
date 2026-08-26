using IndustriasDoradas.Desktop.Application.Abstractions;
using Microsoft.Data.Sqlite;

namespace IndustriasDoradas.Desktop.Infrastructure.LocalStorage;

public sealed class SqliteOutboxRepository(ILocalSqliteConnectionFactory connectionFactory)
    : ILocalOutboxRepository
{
    public async Task<IReadOnlyList<StoredOutboxMessage>> ListPendingAsync(
        int limit,
        CancellationToken cancellationToken = default)
    {
        if (limit is < 1 or > 500)
        {
            throw new ArgumentOutOfRangeException(nameof(limit), "El límite debe estar entre 1 y 500.");
        }

        await using SqliteConnection connection = await connectionFactory
            .OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            SELECT id, operation_type, aggregate_type, aggregate_id, payload_json,
                   created_at_utc, attempt_count, next_attempt_at_utc
            FROM outbox_messages
            WHERE state IN ('PENDING', 'FAILED')
            ORDER BY created_at_utc, id
            LIMIT $limit;
            """;
        command.Parameters.AddWithValue("$limit", limit);

        var messages = new List<StoredOutboxMessage>();
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            var pending = new PendingOutboxMessage(
                Guid.Parse(reader.GetString(0)),
                reader.GetString(1),
                reader.GetString(2),
                Guid.Parse(reader.GetString(3)),
                reader.GetString(4),
                SqliteLocalStorageConverters.ReadTimestamp(reader.GetString(5)));
            messages.Add(new StoredOutboxMessage(
                pending,
                reader.GetInt32(6),
                reader.IsDBNull(7)
                    ? null
                    : SqliteLocalStorageConverters.ReadTimestamp(reader.GetString(7))));
        }

        return messages;
    }
}
