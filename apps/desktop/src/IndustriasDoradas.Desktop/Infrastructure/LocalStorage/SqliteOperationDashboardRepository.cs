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
        IReadOnlyList<LocalOperationDashboardSnapshot> lines = await ListAsync(
                stationId,
                cancellationToken)
            .ConfigureAwait(false);
        return lines.FirstOrDefault(line => line.IsReady) ??
            (lines.Count == 0 ? null : lines[0]) ??
            new LocalOperationDashboardSnapshot(
                null,
                Guid.Empty,
                "Línea piloto",
                null,
                null,
                null,
                null,
                null,
                null,
                0,
                0);
    }

    public async Task<IReadOnlyList<LocalOperationDashboardSnapshot>> ListAsync(
        Guid stationId,
        CancellationToken cancellationToken = default)
    {
        string station = SqliteLocalStorageConverters.Id(stationId, nameof(stationId));
        await using SqliteConnection connection = await connectionFactory
            .OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        using SqliteTransaction transaction = connection.BeginTransaction();
        OutboxCounts outbox = await ReadOutboxCountsAsync(connection, transaction, cancellationToken)
            .ConfigureAwait(false);
        IReadOnlyList<(Guid Id, string Name)> catalogLines = await ReadLinesAsync(
                connection,
                transaction,
                station,
                cancellationToken)
            .ConfigureAwait(false);
        var result = new List<LocalOperationDashboardSnapshot>(catalogLines.Count);
        foreach ((Guid lineId, string lineName) in catalogLines)
        {
            LocalOperationDashboardSnapshot? active = await ReadActiveAsync(
                    connection,
                    transaction,
                    station,
                    lineId,
                    cancellationToken)
                .ConfigureAwait(false);
            result.Add(active is null
                ? new LocalOperationDashboardSnapshot(
                    null,
                    lineId,
                    lineName,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    0,
                    outbox.Pending,
                    outbox.FailedReview,
                    outbox.Synced)
                : active with
                {
                    PendingOutboxCount = outbox.Pending,
                    FailedReviewOutboxCount = outbox.FailedReview,
                    SyncedOutboxCount = outbox.Synced,
                });
        }
        transaction.Commit();
        return result;
    }

    private static async Task<LocalOperationDashboardSnapshot?> ReadActiveAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        string stationId,
        Guid lineId,
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
              AND session.line_id = $lineId
              AND session.status = 'ACTIVE'
              AND shipment.status = 'ACTIVE'
            LIMIT 1;
            """;
        command.Parameters.AddWithValue("$stationId", stationId);
        command.Parameters.AddWithValue(
            "$lineId",
            SqliteLocalStorageConverters.Id(lineId, nameof(lineId)));
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
            lineId,
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

    private static async Task<OutboxCounts> ReadOutboxCountsAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
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

    private static async Task<IReadOnlyList<(Guid Id, string Name)>> ReadLinesAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        string stationId,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT line.id, line.name
            FROM cached_production_lines AS line
            WHERE line.is_active = 1
              AND EXISTS (
                  SELECT 1
                  FROM sync_entity_cache AS scope
                  WHERE scope.entity_type = 'STATION_LINE_SCOPE'
                    AND scope.action = 'UPSERT'
                    AND json_extract(scope.payload_json, '$.station_id') = $stationId
                    AND json_extract(scope.payload_json, '$.production_line_id') = line.id
                    AND json_extract(scope.payload_json, '$.is_active') = 1
              )
            ORDER BY line.name COLLATE NOCASE, line.id
            LIMIT 4;
            """;
        command.Parameters.AddWithValue("$stationId", stationId);
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        var result = new List<(Guid Id, string Name)>();
        while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            result.Add((Guid.Parse(reader.GetString(0)), reader.GetString(1)));
        }

        return result;
    }

    private sealed record OutboxCounts(int Pending, int FailedReview, int Synced);
}
