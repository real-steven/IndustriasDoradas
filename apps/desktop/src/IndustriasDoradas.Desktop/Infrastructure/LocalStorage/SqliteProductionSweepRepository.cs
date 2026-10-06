using System.Globalization;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain.Production;
using Microsoft.Data.Sqlite;

namespace IndustriasDoradas.Desktop.Infrastructure.LocalStorage;

public sealed class SqliteProductionSweepRepository(
    ILocalSqliteConnectionFactory connectionFactory) : ILocalProductionSweepRepository
{
    public async Task<LocalSweepPreparation> PrepareAsync(
        Guid stationId,
        Guid lineId,
        CancellationToken cancellationToken = default)
    {
        await using SqliteConnection connection = await connectionFactory
            .OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        using SqliteTransaction transaction = connection.BeginTransaction();
        LocalOperationalSession session = await RequireActiveSessionAsync(
                connection, transaction, stationId, lineId, cancellationToken)
            .ConfigureAwait(false);
        int total = await ReadTotalAsync(connection, transaction, session, cancellationToken)
            .ConfigureAwait(false);
        int sweptTotal = await ReadCumulativeSweptTotalAsync(
                connection, transaction, session, cancellationToken)
            .ConfigureAwait(false);
        IReadOnlyList<ProductionEvent> events = await ReadUnsweptEventsAsync(
                connection, transaction, session, cancellationToken)
            .ConfigureAwait(false);
        transaction.Commit();
        return new LocalSweepPreparation(session, events, total, sweptTotal);
    }

    public async Task<LocalSweepRegistration> RecordAsync(
        ProductionSweep sweep,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(sweep);
        await using SqliteConnection connection = await connectionFactory
            .OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        using SqliteTransaction transaction = connection.BeginTransaction(deferred: false);

        bool exists = await SweepExistsAsync(connection, transaction, sweep, cancellationToken)
            .ConfigureAwait(false);
        if (exists)
        {
            int existingCumulative = await ReadCumulativeSweptTotalAsync(
                    connection,
                    transaction,
                    ScopeFrom(sweep),
                    cancellationToken)
                .ConfigureAwait(false);
            transaction.Commit();
            return new LocalSweepRegistration(sweep, existingCumulative, true);
        }

        LocalOperationalSession session = await RequireActiveSessionAsync(
                connection, transaction, sweep.StationId, sweep.LineId, cancellationToken)
            .ConfigureAwait(false);
        EnsureSameScope(sweep, session);
        await SqliteLocalClockGuard.EnsureNotRolledBackAsync(
                connection, transaction, sweep.RecordedAt, cancellationToken)
            .ConfigureAwait(false);
        await EnsureEventsRemainAvailableAsync(connection, transaction, sweep, cancellationToken)
            .ConfigureAwait(false);
        long clientSequence = await NextSequenceAsync(
                connection, transaction, sweep.StationId, cancellationToken)
            .ConfigureAwait(false);

        await InsertSweepAsync(connection, transaction, sweep, clientSequence, cancellationToken)
            .ConfigureAwait(false);
        await InsertEventReferencesAsync(connection, transaction, sweep, cancellationToken)
            .ConfigureAwait(false);
        await AdvanceSequenceAsync(
                connection,
                transaction,
                sweep.StationId,
                clientSequence + 1,
                sweep.RecordedAt,
                cancellationToken)
            .ConfigureAwait(false);
        int cumulative = await ReadCumulativeSweptTotalAsync(
                connection, transaction, session, cancellationToken)
            .ConfigureAwait(false);
        transaction.Commit();
        return new LocalSweepRegistration(sweep, cumulative, false);
    }

    private static async Task<LocalOperationalSession> RequireActiveSessionAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        Guid stationId,
        Guid lineId,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT station_id, organization_id, plant_id, line_id, shipment_id,
                   feed_cycle_id, responsible_worker_id, started_at_utc,
                   updated_at_utc, status
            FROM operational_sessions
            WHERE station_id = $stationId
              AND line_id = $lineId
              AND status = 'ACTIVE'
            LIMIT 1;
            """;
        command.Parameters.AddWithValue("$stationId", SqliteLocalStorageConverters.Id(stationId, nameof(stationId)));
        command.Parameters.AddWithValue("$lineId", SqliteLocalStorageConverters.Id(lineId, nameof(lineId)));
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        if (!await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            throw new InvalidOperationException("La línea no tiene un cargamento activo para registrar la barrida.");
        }

        return new LocalOperationalSession(
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
    }

    private static async Task<IReadOnlyList<ProductionEvent>> ReadUnsweptEventsAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        LocalOperationalSession session,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT event.client_event_id, event.organization_id, event.plant_id,
                   event.station_id, event.line_id, event.feed_cycle_id,
                   event.shipment_id, event.responsible_worker_id, event.event_type,
                   event.work_period, event.occurred_at_utc, event.recorded_at_utc,
                   event.client_sequence, event.reverses_client_event_id
            FROM production_events AS event
            LEFT JOIN sweep_production_events AS included
              ON included.organization_id = event.organization_id
             AND included.production_event_id = event.client_event_id
            WHERE event.organization_id = $organizationId
              AND event.station_id = $stationId
              AND event.line_id = $lineId
              AND event.feed_cycle_id = $feedCycleId
              AND event.shipment_id = $shipmentId
              AND included.production_event_id IS NULL
            ORDER BY event.client_sequence, event.client_event_id;
            """;
        AddScope(command, session);
        var result = new List<ProductionEvent>();
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            result.Add(ReadEvent(reader));
        }

        return result;
    }

    private static async Task EnsureEventsRemainAvailableAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        ProductionSweep sweep,
        CancellationToken cancellationToken)
    {
        foreach (SweepEventReference reference in sweep.EventReferences)
        {
            await using SqliteCommand command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = """
                SELECT COUNT(*)
                FROM production_events AS event
                LEFT JOIN sweep_production_events AS included
                  ON included.organization_id = event.organization_id
                 AND included.production_event_id = event.client_event_id
                WHERE event.client_event_id = $eventId
                  AND event.organization_id = $organizationId
                  AND event.station_id = $stationId
                  AND event.line_id = $lineId
                  AND event.feed_cycle_id = $feedCycleId
                  AND event.shipment_id = $shipmentId
                  AND event.client_sequence = $clientSequence
                  AND included.production_event_id IS NULL;
                """;
            command.Parameters.AddWithValue("$eventId", reference.ClientEventId.ToString("D"));
            command.Parameters.AddWithValue("$organizationId", sweep.OrganizationId.ToString("D"));
            command.Parameters.AddWithValue("$stationId", sweep.StationId.ToString("D"));
            command.Parameters.AddWithValue("$lineId", sweep.LineId.ToString("D"));
            command.Parameters.AddWithValue("$feedCycleId", sweep.FeedCycleId.ToString("D"));
            command.Parameters.AddWithValue("$shipmentId", sweep.ShipmentId.ToString("D"));
            command.Parameters.AddWithValue("$clientSequence", reference.ClientSequence);
            long count = Convert.ToInt64(
                await command.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false),
                CultureInfo.InvariantCulture);
            if (count != 1)
            {
                throw new InvalidOperationException(
                    "El conjunto de cajuelas cambió o ya pertenece a otra barrida. Prepárela nuevamente.");
            }
        }
    }

    private static async Task InsertSweepAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        ProductionSweep sweep,
        long clientSequence,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            INSERT INTO production_sweeps(
                id, organization_id, plant_id, station_id, line_id, feed_cycle_id,
                shipment_id, client_sequence, cajuela_count, swept_at_utc,
                recorded_at_utc, recorded_by_profile_id, is_final)
            VALUES (
                $id, $organizationId, $plantId, $stationId, $lineId, $feedCycleId,
                $shipmentId, $clientSequence, $cajuelaCount, $sweptAtUtc,
                $recordedAtUtc, $recordedByProfileId, $isFinal);
            """;
        command.Parameters.AddWithValue("$id", sweep.Id.ToString("D"));
        command.Parameters.AddWithValue("$organizationId", sweep.OrganizationId.ToString("D"));
        command.Parameters.AddWithValue("$plantId", sweep.PlantId.ToString("D"));
        command.Parameters.AddWithValue("$stationId", sweep.StationId.ToString("D"));
        command.Parameters.AddWithValue("$lineId", sweep.LineId.ToString("D"));
        command.Parameters.AddWithValue("$feedCycleId", sweep.FeedCycleId.ToString("D"));
        command.Parameters.AddWithValue("$shipmentId", sweep.ShipmentId.ToString("D"));
        command.Parameters.AddWithValue("$clientSequence", clientSequence);
        command.Parameters.AddWithValue("$cajuelaCount", sweep.CajuelaQuantity);
        command.Parameters.AddWithValue("$sweptAtUtc", SqliteLocalStorageConverters.Timestamp(sweep.PerformedAt));
        command.Parameters.AddWithValue("$recordedAtUtc", SqliteLocalStorageConverters.Timestamp(sweep.RecordedAt));
        command.Parameters.AddWithValue("$recordedByProfileId", sweep.RecordedByProfileId.ToString("D"));
        command.Parameters.AddWithValue("$isFinal", sweep.IsFinal ? 1 : 0);
        await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    private static async Task InsertEventReferencesAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        ProductionSweep sweep,
        CancellationToken cancellationToken)
    {
        foreach (SweepEventReference reference in sweep.EventReferences)
        {
            await using SqliteCommand command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = """
                INSERT INTO sweep_production_events(
                    organization_id, sweep_id, production_event_id,
                    shipment_id, line_id, feed_cycle_id)
                VALUES (
                    $organizationId, $sweepId, $productionEventId,
                    $shipmentId, $lineId, $feedCycleId);
                """;
            command.Parameters.AddWithValue("$organizationId", sweep.OrganizationId.ToString("D"));
            command.Parameters.AddWithValue("$sweepId", sweep.Id.ToString("D"));
            command.Parameters.AddWithValue("$productionEventId", reference.ClientEventId.ToString("D"));
            command.Parameters.AddWithValue("$shipmentId", sweep.ShipmentId.ToString("D"));
            command.Parameters.AddWithValue("$lineId", sweep.LineId.ToString("D"));
            command.Parameters.AddWithValue("$feedCycleId", sweep.FeedCycleId.ToString("D"));
            await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        }
    }

    private static async Task<bool> SweepExistsAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        ProductionSweep sweep,
        CancellationToken cancellationToken)
    {
        bool exists;
        bool same;
        await using (SqliteCommand command = connection.CreateCommand())
        {
            command.Transaction = transaction;
            command.CommandText = """
                SELECT organization_id, station_id, line_id, feed_cycle_id, shipment_id,
                       cajuela_count, swept_at_utc, recorded_at_utc,
                       recorded_by_profile_id, is_final
                FROM production_sweeps
                WHERE id = $id;
                """;
            command.Parameters.AddWithValue("$id", sweep.Id.ToString("D"));
            await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
                .ConfigureAwait(false);
            exists = await reader.ReadAsync(cancellationToken).ConfigureAwait(false);
            if (!exists) return false;

            same = Guid.Parse(reader.GetString(0)) == sweep.OrganizationId &&
                Guid.Parse(reader.GetString(1)) == sweep.StationId &&
                Guid.Parse(reader.GetString(2)) == sweep.LineId &&
                Guid.Parse(reader.GetString(3)) == sweep.FeedCycleId &&
                Guid.Parse(reader.GetString(4)) == sweep.ShipmentId &&
                reader.GetInt32(5) == sweep.CajuelaQuantity &&
                SqliteLocalStorageConverters.ReadTimestamp(reader.GetString(6)) == sweep.PerformedAt &&
                SqliteLocalStorageConverters.ReadTimestamp(reader.GetString(7)) == sweep.RecordedAt &&
                Guid.Parse(reader.GetString(8)) == sweep.RecordedByProfileId &&
                reader.GetInt32(9) == (sweep.IsFinal ? 1 : 0);
        }

        same = same && await HasSameEventReferencesAsync(
                connection, transaction, sweep, cancellationToken)
            .ConfigureAwait(false);
        if (!same)
        {
            throw new InvalidOperationException("El UUID de barrida ya existe con otro contenido.");
        }

        return true;
    }

    private static async Task<bool> HasSameEventReferencesAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        ProductionSweep sweep,
        CancellationToken cancellationToken)
    {
        await using (SqliteCommand countCommand = connection.CreateCommand())
        {
            countCommand.Transaction = transaction;
            countCommand.CommandText = """
                SELECT COUNT(*)
                FROM sweep_production_events
                WHERE organization_id = $organizationId
                  AND sweep_id = $sweepId;
                """;
            countCommand.Parameters.AddWithValue("$organizationId", sweep.OrganizationId.ToString("D"));
            countCommand.Parameters.AddWithValue("$sweepId", sweep.Id.ToString("D"));
            long count = Convert.ToInt64(
                await countCommand.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false),
                CultureInfo.InvariantCulture);
            if (count != sweep.EventReferences.Count) return false;
        }

        foreach (SweepEventReference reference in sweep.EventReferences)
        {
            await using SqliteCommand referenceCommand = connection.CreateCommand();
            referenceCommand.Transaction = transaction;
            referenceCommand.CommandText = """
                SELECT COUNT(*)
                FROM sweep_production_events AS included
                INNER JOIN production_events AS event
                  ON event.organization_id = included.organization_id
                 AND event.client_event_id = included.production_event_id
                WHERE included.organization_id = $organizationId
                  AND included.sweep_id = $sweepId
                  AND included.production_event_id = $eventId
                  AND event.client_sequence = $clientSequence;
                """;
            referenceCommand.Parameters.AddWithValue("$organizationId", sweep.OrganizationId.ToString("D"));
            referenceCommand.Parameters.AddWithValue("$sweepId", sweep.Id.ToString("D"));
            referenceCommand.Parameters.AddWithValue("$eventId", reference.ClientEventId.ToString("D"));
            referenceCommand.Parameters.AddWithValue("$clientSequence", reference.ClientSequence);
            long count = Convert.ToInt64(
                await referenceCommand.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false),
                CultureInfo.InvariantCulture);
            if (count != 1) return false;
        }

        return true;
    }

    private static async Task<int> ReadTotalAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        LocalOperationalSession session,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT COALESCE(total, 0)
            FROM production_counters
            WHERE line_id = $lineId AND shipment_id = $shipmentId;
            """;
        command.Parameters.AddWithValue("$lineId", session.LineId.ToString("D"));
        command.Parameters.AddWithValue("$shipmentId", session.ShipmentId.ToString("D"));
        object? value = await command.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false);
        return value is null ? 0 : Convert.ToInt32(value, CultureInfo.InvariantCulture);
    }

    private static async Task<int> ReadCumulativeSweptTotalAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        LocalOperationalSession session,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT COALESCE(SUM(cajuela_count), 0)
            FROM production_sweeps
            WHERE organization_id = $organizationId
              AND station_id = $stationId
              AND line_id = $lineId
              AND feed_cycle_id = $feedCycleId
              AND shipment_id = $shipmentId;
            """;
        AddScope(command, session);
        return Convert.ToInt32(
            await command.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false),
            CultureInfo.InvariantCulture);
    }

    private static async Task<long> NextSequenceAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        Guid stationId,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT MAX(
                COALESCE((SELECT MAX(client_sequence) + 1 FROM production_events
                          WHERE station_id = $stationId), 1),
                COALESCE((SELECT MAX(client_sequence) + 1 FROM production_sweeps
                          WHERE station_id = $stationId), 1),
                COALESCE((SELECT MAX(client_sequence) + 1 FROM mercury_movements
                          WHERE station_id = $stationId), 1),
                COALESCE((SELECT next_sequence FROM station_sequence_state
                          WHERE station_id = $stationId), 1));
            """;
        command.Parameters.AddWithValue("$stationId", stationId.ToString("D"));
        return Convert.ToInt64(
            await command.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false),
            CultureInfo.InvariantCulture);
    }

    private static async Task AdvanceSequenceAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        Guid stationId,
        long nextSequence,
        DateTimeOffset updatedAt,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            INSERT INTO station_sequence_state(station_id, next_sequence, updated_at_utc)
            VALUES ($stationId, $nextSequence, $updatedAtUtc)
            ON CONFLICT(station_id) DO UPDATE SET
                next_sequence = MAX(station_sequence_state.next_sequence, excluded.next_sequence),
                updated_at_utc = excluded.updated_at_utc;
            """;
        command.Parameters.AddWithValue("$stationId", stationId.ToString("D"));
        command.Parameters.AddWithValue("$nextSequence", nextSequence);
        command.Parameters.AddWithValue("$updatedAtUtc", SqliteLocalStorageConverters.Timestamp(updatedAt));
        await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    private static void AddScope(SqliteCommand command, LocalOperationalSession session)
    {
        command.Parameters.AddWithValue("$organizationId", session.OrganizationId.ToString("D"));
        command.Parameters.AddWithValue("$stationId", session.StationId.ToString("D"));
        command.Parameters.AddWithValue("$lineId", session.LineId.ToString("D"));
        command.Parameters.AddWithValue("$feedCycleId", session.FeedCycleId.ToString("D"));
        command.Parameters.AddWithValue("$shipmentId", session.ShipmentId.ToString("D"));
    }

    private static void EnsureSameScope(ProductionSweep sweep, LocalOperationalSession session)
    {
        if (sweep.OrganizationId != session.OrganizationId ||
            sweep.PlantId != session.PlantId ||
            sweep.StationId != session.StationId ||
            sweep.LineId != session.LineId ||
            sweep.FeedCycleId != session.FeedCycleId ||
            sweep.ShipmentId != session.ShipmentId)
        {
            throw new InvalidOperationException("El cargamento cambió mientras se confirmaba la barrida.");
        }
    }

    private static LocalOperationalSession ScopeFrom(ProductionSweep sweep) =>
        new(
            sweep.StationId,
            sweep.OrganizationId,
            sweep.PlantId,
            sweep.LineId,
            sweep.ShipmentId,
            sweep.FeedCycleId,
            sweep.ResponsibleWorkerIds[0],
            sweep.PerformedAt,
            sweep.RecordedAt,
            LineFeedCycleStatus.Active);

    private static ProductionEvent ReadEvent(SqliteDataReader reader)
    {
        var context = ProductionEventContext.Create(
            Guid.Parse(reader.GetString(1)),
            Guid.Parse(reader.GetString(2)),
            Guid.Parse(reader.GetString(3)),
            Guid.Parse(reader.GetString(4)),
            Guid.Parse(reader.GetString(5)),
            Guid.Parse(reader.GetString(6)),
            Guid.Parse(reader.GetString(7)));
        return reader.GetString(8) switch
        {
            "CAJUELA_ADDED" => ProductionEvent.CajuelaAdded(
                Guid.Parse(reader.GetString(0)),
                context,
                reader.GetInt64(12),
                SqliteLocalStorageConverters.ReadTimestamp(reader.GetString(10)),
                SqliteLocalStorageConverters.ReadTimestamp(reader.GetString(11))),
            "CAJUELA_REVERSED" => ProductionEvent.CajuelaReversed(
                Guid.Parse(reader.GetString(0)),
                context,
                reader.GetInt64(12),
                SqliteLocalStorageConverters.ReadTimestamp(reader.GetString(10)),
                SqliteLocalStorageConverters.ReadTimestamp(reader.GetString(11)),
                Guid.Parse(reader.GetString(13))),
            string value => throw new InvalidOperationException($"Tipo SQLite desconocido: {value}."),
        };
    }
}
