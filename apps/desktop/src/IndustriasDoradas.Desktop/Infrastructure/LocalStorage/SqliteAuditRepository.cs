using IndustriasDoradas.Desktop.Application.Abstractions;
using Microsoft.Data.Sqlite;

namespace IndustriasDoradas.Desktop.Infrastructure.LocalStorage;

public sealed class SqliteAuditRepository(
    ILocalSqliteConnectionFactory connectionFactory) : ILocalAuditRepository
{
    public Task<IReadOnlyList<LocalCompletedShipmentAudit>> ListCompletedShipmentsAsync(
        CancellationToken cancellationToken = default) =>
        ListCompletedShipmentsAsync(new LocalAuditQuery(null, null), cancellationToken);

    public async Task<IReadOnlyList<LocalCompletedShipmentAudit>> ListCompletedShipmentsAsync(
        LocalAuditQuery query,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(query);
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
                   COALESCE((SELECT COUNT(*)
                       FROM production_sweeps AS measured_sweep
                       WHERE measured_sweep.organization_id = shipment.organization_id
                         AND measured_sweep.line_id = shipment.line_id
                         AND measured_sweep.feed_cycle_id = shipment.feed_cycle_id
                         AND measured_sweep.shipment_id = shipment.id
                         AND EXISTS (
                             SELECT 1 FROM cached_line_components AS available_rastra
                             WHERE available_rastra.organization_id = shipment.organization_id
                               AND available_rastra.line_id = shipment.line_id
                               AND available_rastra.component_type_code = 'RASTRA'
                               AND available_rastra.is_active = 1)
                         AND NOT EXISTS (
                             SELECT 1 FROM cached_line_components AS rastra
                             WHERE rastra.organization_id = shipment.organization_id
                               AND rastra.line_id = shipment.line_id
                               AND rastra.component_type_code = 'RASTRA'
                               AND rastra.is_active = 1
                               AND (
                                   NOT EXISTS (
                                       SELECT 1 FROM mercury_movements AS movement
                                       WHERE movement.organization_id = shipment.organization_id
                                         AND movement.line_id = shipment.line_id
                                         AND movement.feed_cycle_id = shipment.feed_cycle_id
                                         AND movement.shipment_id = shipment.id
                                         AND movement.sweep_id = measured_sweep.id
                                         AND movement.line_component_id = rastra.id
                                         AND movement.movement_kind = 'SWEEP_INPUT'
                                         AND movement.amount_centigrams IS NOT NULL
                                         AND NOT EXISTS (
                                             SELECT 1 FROM mercury_movements AS replacement
                                             WHERE replacement.organization_id = movement.organization_id
                                               AND replacement.supersedes_movement_id = movement.id))
                                   OR NOT EXISTS (
                                       SELECT 1 FROM mercury_movements AS movement
                                       WHERE movement.organization_id = shipment.organization_id
                                         AND movement.line_id = shipment.line_id
                                         AND movement.feed_cycle_id = shipment.feed_cycle_id
                                         AND movement.shipment_id = shipment.id
                                         AND movement.sweep_id = measured_sweep.id
                                         AND movement.line_component_id = rastra.id
                                         AND movement.movement_kind = 'SWEEP_REMAINDER'
                                         AND movement.amount_centigrams IS NOT NULL
                                         AND NOT EXISTS (
                                             SELECT 1 FROM mercury_movements AS replacement
                                             WHERE replacement.organization_id = movement.organization_id
                                               AND replacement.supersedes_movement_id = movement.id))))), 0),
                   line.display_order
            FROM cached_shipments AS shipment
            INNER JOIN cached_production_lines AS line ON line.id = shipment.line_id
            INNER JOIN cached_suppliers AS supplier ON supplier.id = shipment.supplier_id
            LEFT JOIN production_counters AS counter
              ON counter.line_id = shipment.line_id
             AND counter.shipment_id = shipment.id
            WHERE shipment.status = 'COMPLETED'
              AND shipment.completed_at_utc IS NOT NULL
              AND ($startUtc IS NULL OR shipment.completed_at_utc >= $startUtc)
              AND ($endUtc IS NULL OR shipment.completed_at_utc < $endUtc)
            ORDER BY shipment.completed_at_utc DESC, shipment.id
            LIMIT $limit;
            """;
        AddQueryParameters(command, query);
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
                reader.GetInt32(10),
                reader.GetInt32(11)));
        }

        await reader.DisposeAsync().ConfigureAwait(false);
        IReadOnlyDictionary<Guid, IReadOnlyList<LocalResponsibilityAudit>> responsibilitiesByShipment =
            await ReadResponsibilitiesAsync(connection, rows.Select(row => row.ShipmentId), cancellationToken)
                .ConfigureAwait(false);
        var results = new List<LocalCompletedShipmentAudit>(rows.Count);
        foreach (CompletedShipmentRow row in rows)
        {
            IReadOnlyList<LocalResponsibilityAudit> responsibilities =
                responsibilitiesByShipment.GetValueOrDefault(row.ShipmentId) ?? [];
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
                responsibilities,
                row.DisplayOrder));
        }
        return results;
    }

    public Task<IReadOnlyList<LocalCajuelaCorrectionAudit>> ListCajuelaCorrectionsAsync(
        CancellationToken cancellationToken = default) =>
        ListCajuelaCorrectionsAsync(new LocalAuditQuery(null, null), cancellationToken);

    public async Task<IReadOnlyList<LocalCajuelaCorrectionAudit>> ListCajuelaCorrectionsAsync(
        LocalAuditQuery query,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(query);
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
            WHERE ($startUtc IS NULL OR correction.confirmed_at_utc >= $startUtc)
              AND ($endUtc IS NULL OR correction.confirmed_at_utc < $endUtc)
            ORDER BY correction.confirmed_at_utc DESC,
                     correction.reversal_client_event_id DESC
            LIMIT $limit;
            """;
        AddQueryParameters(command, query);
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

    private static async Task<IReadOnlyDictionary<Guid, IReadOnlyList<LocalResponsibilityAudit>>> ReadResponsibilitiesAsync(
        SqliteConnection connection,
        IEnumerable<Guid> shipmentIds,
        CancellationToken cancellationToken)
    {
        Guid[] ids = shipmentIds.Distinct().ToArray();
        if (ids.Length == 0)
        {
            return new Dictionary<Guid, IReadOnlyList<LocalResponsibilityAudit>>();
        }

        await using SqliteCommand command = connection.CreateCommand();
        string[] parameters = ids.Select((_, index) => $"$shipment{index}").ToArray();
        command.CommandText = $"""
            SELECT assignment.shipment_id,
                   assignment.worker_id,
                   worker.name,
                   assignment.assigned_at_utc, assignment.unassigned_at_utc
            FROM responsibility_assignments AS assignment
            INNER JOIN cached_workers AS worker ON worker.id = assignment.worker_id
            WHERE assignment.shipment_id IN ({string.Join(", ", parameters)})
            ORDER BY assignment.shipment_id, assignment.assigned_at_utc, assignment.id;
            """;
        for (int index = 0; index < ids.Length; index++)
        {
            command.Parameters.AddWithValue(parameters[index], ids[index].ToString("D"));
        }

        var results = new Dictionary<Guid, List<LocalResponsibilityAudit>>();
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            Guid shipmentId = Guid.Parse(reader.GetString(0));
            if (!results.TryGetValue(shipmentId, out List<LocalResponsibilityAudit>? assignments))
            {
                assignments = [];
                results.Add(shipmentId, assignments);
            }
            assignments.Add(new LocalResponsibilityAudit(
                Guid.Parse(reader.GetString(1)),
                reader.GetString(2),
                SqliteLocalStorageConverters.ReadTimestamp(reader.GetString(3)),
                reader.IsDBNull(4)
                    ? null
                    : SqliteLocalStorageConverters.ReadTimestamp(reader.GetString(4))));
        }

        return results.ToDictionary(
            pair => pair.Key,
            pair => (IReadOnlyList<LocalResponsibilityAudit>)pair.Value);
    }

    private static void AddQueryParameters(SqliteCommand command, LocalAuditQuery query)
    {
        command.Parameters.AddWithValue(
            "$startUtc",
            query.StartUtc is null
                ? DBNull.Value
                : SqliteLocalStorageConverters.Timestamp(query.StartUtc.Value));
        command.Parameters.AddWithValue(
            "$endUtc",
            query.EndExclusiveUtc is null
                ? DBNull.Value
                : SqliteLocalStorageConverters.Timestamp(query.EndExclusiveUtc.Value));
        command.Parameters.AddWithValue("$limit", Math.Clamp(query.Limit, 1, 1000));
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
        int MercuryRecordedSweepCount,
        int DisplayOrder);
}
