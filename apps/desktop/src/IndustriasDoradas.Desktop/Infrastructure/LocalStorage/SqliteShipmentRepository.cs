using IndustriasDoradas.Desktop.Application.Abstractions;
using Microsoft.Data.Sqlite;

namespace IndustriasDoradas.Desktop.Infrastructure.LocalStorage;

public sealed class SqliteShipmentRepository(ILocalSqliteConnectionFactory connectionFactory)
    : ILocalShipmentRepository
{
    public async Task UpsertAsync(
        CachedShipment shipment,
        CancellationToken cancellationToken = default)
    {
        await using SqliteConnection connection = await connectionFactory
            .OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO cached_shipments(
                id, organization_id, supplier_id, line_id, feed_cycle_id,
                started_at_utc, completed_at_utc, status)
            VALUES (
                $id, $organizationId, $supplierId, $lineId, $feedCycleId,
                $startedAtUtc, $completedAtUtc, $status)
            ON CONFLICT(id) DO UPDATE SET
                organization_id = excluded.organization_id,
                supplier_id = excluded.supplier_id,
                line_id = excluded.line_id,
                feed_cycle_id = excluded.feed_cycle_id,
                started_at_utc = excluded.started_at_utc,
                completed_at_utc = excluded.completed_at_utc,
                status = excluded.status;
            """;
        command.Parameters.AddWithValue("$id", SqliteLocalStorageConverters.Id(shipment.Id, nameof(shipment)));
        command.Parameters.AddWithValue(
            "$organizationId",
            SqliteLocalStorageConverters.Id(shipment.OrganizationId, nameof(shipment)));
        command.Parameters.AddWithValue(
            "$supplierId",
            SqliteLocalStorageConverters.Id(shipment.SupplierId, nameof(shipment)));
        command.Parameters.AddWithValue("$lineId", SqliteLocalStorageConverters.Id(shipment.LineId, nameof(shipment)));
        command.Parameters.AddWithValue(
            "$feedCycleId",
            SqliteLocalStorageConverters.Id(shipment.FeedCycleId, nameof(shipment)));
        command.Parameters.AddWithValue("$startedAtUtc", SqliteLocalStorageConverters.Timestamp(shipment.StartedAt));
        command.Parameters.AddWithValue(
            "$completedAtUtc",
            shipment.CompletedAt is null
                ? DBNull.Value
                : SqliteLocalStorageConverters.Timestamp(shipment.CompletedAt.Value));
        command.Parameters.AddWithValue("$status", SqliteLocalStorageConverters.Status(shipment.Status));
        await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }
}
