using IndustriasDoradas.Desktop.Application.Abstractions;
using Microsoft.Data.Sqlite;

namespace IndustriasDoradas.Desktop.Infrastructure.LocalStorage;

public sealed class SqliteOperationDashboardRepository(
    ILocalSqliteConnectionFactory connectionFactory) : ILocalOperationDashboardRepository
{
    public async Task<LocalOperationDashboardSnapshot> GetAsync(
        Guid stationId,
        CancellationToken cancellationToken = default)
    {
        string station = SqliteLocalStorageConverters.Id(stationId, nameof(stationId));
        await using SqliteConnection connection = await connectionFactory
            .OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        using SqliteTransaction transaction = connection.BeginTransaction();
        LocalOperationDashboardSnapshot? active = await ReadActiveAsync(
                connection,
                transaction,
                station,
                cancellationToken)
            .ConfigureAwait(false);
        int pending = await ReadPendingCountAsync(connection, transaction, cancellationToken)
            .ConfigureAwait(false);
        transaction.Commit();

        if (active is not null)
        {
            return active with { PendingOutboxCount = pending };
        }

        string lineName = await ReadPilotLineNameAsync(connection, cancellationToken)
            .ConfigureAwait(false);
        return new LocalOperationDashboardSnapshot(
            null,
            lineName,
            null,
            null,
            null,
            null,
            null,
            null,
            0,
            pending);
    }

    private static async Task<LocalOperationDashboardSnapshot?> ReadActiveAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        string stationId,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT session.station_id, session.organization_id, session.plant_id,
                   session.line_id, session.shipment_id, session.feed_cycle_id,
                   session.responsible_worker_id, session.started_at_utc,
                   session.updated_at_utc, session.status,
                   line.name, supplier.name, shipment.started_at_utc,
                   responsible.name, assignment.assigned_at_utc,
                   previous_worker.name, previous_assignment.unassigned_at_utc,
                   COALESCE(counter.total, 0)
            FROM operational_sessions AS session
            INNER JOIN cached_production_lines AS line ON line.id = session.line_id
            INNER JOIN cached_shipments AS shipment
                ON shipment.id = session.shipment_id
               AND shipment.feed_cycle_id = session.feed_cycle_id
               AND shipment.line_id = session.line_id
               AND shipment.organization_id = session.organization_id
            INNER JOIN cached_suppliers AS supplier ON supplier.id = shipment.supplier_id
            INNER JOIN cached_workers AS responsible
                ON responsible.id = session.responsible_worker_id
            INNER JOIN responsibility_assignments AS assignment
                ON assignment.shipment_id = session.shipment_id
               AND assignment.feed_cycle_id = session.feed_cycle_id
               AND assignment.line_id = session.line_id
               AND assignment.worker_id = session.responsible_worker_id
               AND assignment.unassigned_at_utc IS NULL
            LEFT JOIN responsibility_assignments AS previous_assignment
                ON previous_assignment.id = (
                    SELECT candidate.id
                    FROM responsibility_assignments AS candidate
                    WHERE candidate.shipment_id = session.shipment_id
                      AND candidate.feed_cycle_id = session.feed_cycle_id
                      AND candidate.line_id = session.line_id
                      AND candidate.unassigned_at_utc IS NOT NULL
                    ORDER BY candidate.unassigned_at_utc DESC, candidate.id DESC
                    LIMIT 1)
            LEFT JOIN cached_workers AS previous_worker
                ON previous_worker.id = previous_assignment.worker_id
            LEFT JOIN production_counters AS counter
                ON counter.line_id = session.line_id
               AND counter.shipment_id = session.shipment_id
            WHERE session.station_id = $stationId
              AND session.status = 'ACTIVE'
              AND shipment.status = 'ACTIVE'
            LIMIT 1;
            """;
        command.Parameters.AddWithValue("$stationId", stationId);
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        if (!await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            return null;
        }

        var session = new LocalOperationalSession(
            Guid.Parse(reader.GetString(0)),
            Guid.Parse(reader.GetString(1)),
            Guid.Parse(reader.GetString(2)),
            Guid.Parse(reader.GetString(3)),
            Guid.Parse(reader.GetString(4)),
            Guid.Parse(reader.GetString(5)),
            Guid.Parse(reader.GetString(6)),
            SqliteLocalStorageConverters.ReadTimestamp(reader.GetString(7)),
            SqliteLocalStorageConverters.ReadTimestamp(reader.GetString(8)),
            SqliteLocalStorageConverters.ReadStatus(reader.GetString(9)));
        return new LocalOperationDashboardSnapshot(
            session,
            reader.GetString(10),
            reader.GetString(11),
            SqliteLocalStorageConverters.ReadTimestamp(reader.GetString(12)),
            reader.GetString(13),
            SqliteLocalStorageConverters.ReadTimestamp(reader.GetString(14)),
            reader.IsDBNull(15) ? null : reader.GetString(15),
            reader.IsDBNull(16)
                ? null
                : SqliteLocalStorageConverters.ReadTimestamp(reader.GetString(16)),
            reader.GetInt32(17),
            0);
    }

    private static async Task<int> ReadPendingCountAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT COUNT(*)
            FROM outbox_messages
            WHERE state IN ('PENDING', 'FAILED');
            """;
        object? value = await command.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false);
        return Convert.ToInt32(value, System.Globalization.CultureInfo.InvariantCulture);
    }

    private static async Task<string> ReadPilotLineNameAsync(
        SqliteConnection connection,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            SELECT name
            FROM cached_production_lines
            WHERE is_active = 1
            ORDER BY name COLLATE NOCASE, id
            LIMIT 1;
            """;
        object? value = await command.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false);
        return value as string ?? "Línea piloto";
    }
}
