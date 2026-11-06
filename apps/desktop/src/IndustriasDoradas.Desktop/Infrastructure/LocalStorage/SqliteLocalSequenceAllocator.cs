using System.Globalization;
using Microsoft.Data.Sqlite;

namespace IndustriasDoradas.Desktop.Infrastructure.LocalStorage;

internal static class SqliteLocalSequenceAllocator
{
    // TypeScript receives sync payloads as JSON numbers. Values above this limit
    // cannot be represented exactly and are rejected by Number.isSafeInteger.
    internal const long MaximumJsonSafeInteger = 9_007_199_254_740_991L;

    internal static async Task<long> NextAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        Guid stationId,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT MAX(
                COALESCE((SELECT MAX(station_sequence) + 1
                          FROM outbox_messages
                          WHERE station_id = $stationId), 1),
                COALESCE((SELECT next_sequence
                          FROM station_sequence_state
                          WHERE station_id = $stationId), 1));
            """;
        command.Parameters.AddWithValue("$stationId", stationId.ToString("D"));
        long sequence = Convert.ToInt64(
            await command.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false),
            CultureInfo.InvariantCulture);
        if (sequence is < 1 or > MaximumJsonSafeInteger)
        {
            throw new InvalidOperationException(
                "La secuencia local de sincronización está fuera del rango seguro; " +
                "genere un informe para soporte antes de registrar más datos.");
        }

        return sequence;
    }
}
