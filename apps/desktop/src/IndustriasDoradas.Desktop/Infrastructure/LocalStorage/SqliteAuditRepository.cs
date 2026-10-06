using IndustriasDoradas.Desktop.Application.Abstractions;
using Microsoft.Data.Sqlite;

namespace IndustriasDoradas.Desktop.Infrastructure.LocalStorage;

public sealed class SqliteAuditRepository(
    ILocalSqliteConnectionFactory connectionFactory) : ILocalAuditRepository
{
    public async Task<IReadOnlyList<LocalCompletedShipmentAudit>> ListCompletedShipmentsAsync(
        CancellationToken cancellationToken = default)
    {
        await using SqliteConnection connection = await connectionFactory
            .OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        var rows = new List<CompletedShipmentRow>();
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            SELECT shipment.id, shipment.line_id, line.name, supplier.name,
                   shipment.started_at_utc, shipment.completed_at_utc,
                   COALESCE(counter.total, 0),
                   COALESCE((SELECT COUNT(*) FROM production_sweeps AS sweep
                       WHERE sweep.organization_id = shipment.organization_id
                         AND sweep.line_id = shipment.line_id
                         AND sweep.feed_cycle_id = shipment.feed_cycle_id
                         AND sweep.shipment_id = shipment.id), 0),
                   COALESCE((SELECT SUM(sweep.cajuela_count) FROM production_sweeps AS sweep
                       WHERE sweep.organization_id = shipment.organization_id
                         AND sweep.line_id = shipment.line_id
                         AND sweep.feed_cycle_id = shipment.feed_cycle_id
                         AND sweep.shipment_id = shipment.id), 0),
                   COALESCE((SELECT COUNT(*)
                       FROM production_event_corrections AS correction
                       INNER JOIN production_events AS target
                         ON target.client_event_id = correction.target_client_event_id
                       WHERE target.organization_id = shipment.organization_id
                         AND target.line_id = shipment.line_id
                         AND target.feed_cycle_id = shipment.feed_cycle_id
                         AND target.shipment_id = shipment.id), 0),
                   COALESCE((SELECT COUNT(DISTINCT movement.sweep_id)
                       FROM mercury_movements AS movement
                       WHERE movement.organization_id = shipment.organization_id
                         AND movement.line_id = shipment.line_id
                         AND movement.feed_cycle_id = shipment.feed_cycle_id
                         AND movement.shipment_id = shipment.id
                         AND movement.movement_kind = 'RECOVERY'), 0)
            FROM cached_shipments AS shipment
            INNER JOIN cached_production_lines AS line ON line.id = shipment.line_id
            INNER JOIN cached_suppliers AS supplier ON supplier.id = shipment.supplier_id
            LEFT JOIN production_counters AS counter
              ON counter.line_id = shipment.line_id
             AND counter.shipment_id = shipment.id
            WHERE shipment.status = 'COMPLETED'
              AND shipment.completed_at_utc IS NOT NULL
            ORDER BY shipment.completed_at_utc DESC, shipment.id;
            """;
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            rows.Add(new CompletedShipmentRow(
                Guid.Parse(reader.GetString(0)),
                Guid.Parse(reader.GetString(1)),
                reader.GetString(2),
                reader.GetString(3),
                SqliteLocalStorageConverters.ReadTimestamp(reader.GetString(4)),
                SqliteLocalStorageConverters.ReadTimestamp(reader.GetString(5)),
                reader.GetInt32(6),
                reader.GetInt32(7),
                reader.GetInt32(8),
                reader.GetInt32(9),
                reader.GetInt32(10)));
        }

        await reader.DisposeAsync().ConfigureAwait(false);
        var results = new List<LocalCompletedShipmentAudit>(rows.Count);
        foreach (CompletedShipmentRow row in rows)
        {
            IReadOnlyList<LocalResponsibilityAudit> responsibilities =
                await ReadResponsibilitiesAsync(connection, row.ShipmentId, cancellationToken)
                    .ConfigureAwait(false);
            results.Add(new LocalCompletedShipmentAudit(
                row.ShipmentId,
                row.LineId,
                row.LineName,
                row.SupplierName,
                row.StartedAt,
                row.CompletedAt,
                row.TotalCajuelas,
                row.SweepCount,
                row.SweptCajuelas,
                row.CorrectionCount,
                row.MercuryRecordedSweepCount,
                responsibilities));
        }
        return results;
    }

    public async Task<IReadOnlyList<LocalCajuelaCorrectionAudit>> ListCajuelaCorrectionsAsync(
        CancellationToken cancellationToken = default)
    {
        await using SqliteConnection connection = await connectionFactory
            .OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            SELECT correction.reversal_client_event_id,
                   target.shipment_id,
                   line.name,
                   COALESCE(
                       NULLIF(correction.actor_display_name, ''),
                       actor_worker.name,
                       CASE correction.actor_kind
                           WHEN 'JEFE_PLANTA' THEN 'Jefe de planta'
                           WHEN 'OPERARIO' THEN 'Operario responsable'
                           ELSE 'Registro anterior'
                       END),
                   COALESCE(NULLIF(correction.actor_role_code, ''), correction.actor_kind),
                   COALESCE(
                       NULLIF(correction.reason_detail, ''),
                       CASE WHEN correction.requires_plant_manager = 1
                           THEN 'Corrección autorizada por jefatura'
                           ELSE 'Corrección inmediata de conteo'
                       END),
                   correction.total_before,
                   correction.total_after,
                   correction.confirmed_at_utc,
                   correction.requires_plant_manager
            FROM production_event_corrections AS correction
            INNER JOIN production_events AS target
              ON target.client_event_id = correction.target_client_event_id
            INNER JOIN cached_production_lines AS line ON line.id = target.line_id
            LEFT JOIN cached_workers AS actor_worker ON actor_worker.id = correction.actor_id
            ORDER BY correction.confirmed_at_utc DESC,
                     correction.reversal_client_event_id DESC;
            """;
        var results = new List<LocalCajuelaCorrectionAudit>();
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            results.Add(new LocalCajuelaCorrectionAudit(
                Guid.Parse(reader.GetString(0)),
                Guid.Parse(reader.GetString(1)),
                reader.GetString(2),
                reader.GetString(3),
                reader.GetString(4),
                reader.GetString(5),
                reader.IsDBNull(6) ? null : reader.GetInt32(6),
                reader.IsDBNull(7) ? null : reader.GetInt32(7),
                SqliteLocalStorageConverters.ReadTimestamp(reader.GetString(8)),
                reader.GetInt32(9) == 1));
        }

        return results;
    }

    private static async Task<IReadOnlyList<LocalResponsibilityAudit>> ReadResponsibilitiesAsync(
        SqliteConnection connection,
        Guid shipmentId,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            SELECT assignment.worker_id, worker.name,
                   assignment.assigned_at_utc, assignment.unassigned_at_utc
            FROM responsibility_assignments AS assignment
            INNER JOIN cached_workers AS worker ON worker.id = assignment.worker_id
            WHERE assignment.shipment_id = $shipmentId
            ORDER BY assignment.assigned_at_utc, assignment.id;
            """;
        command.Parameters.AddWithValue("$shipmentId", shipmentId.ToString("D"));
        var results = new List<LocalResponsibilityAudit>();
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            results.Add(new LocalResponsibilityAudit(
                Guid.Parse(reader.GetString(0)),
                reader.GetString(1),
                SqliteLocalStorageConverters.ReadTimestamp(reader.GetString(2)),
                reader.IsDBNull(3)
                    ? null
                    : SqliteLocalStorageConverters.ReadTimestamp(reader.GetString(3))));
        }

        return results;
    }

    private sealed record CompletedShipmentRow(
        Guid ShipmentId,
        Guid LineId,
        string LineName,
        string SupplierName,
        DateTimeOffset StartedAt,
        DateTimeOffset CompletedAt,
        int TotalCajuelas,
        int SweepCount,
        int SweptCajuelas,
        int CorrectionCount,
        int MercuryRecordedSweepCount);
}
