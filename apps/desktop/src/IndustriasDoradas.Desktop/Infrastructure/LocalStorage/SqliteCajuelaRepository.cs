using System.Globalization;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain.Production;
using Microsoft.Data.Sqlite;

namespace IndustriasDoradas.Desktop.Infrastructure.LocalStorage;

public sealed class SqliteCajuelaRepository(ILocalSqliteConnectionFactory connectionFactory)
    : ILocalCajuelaRepository
{
    public async Task<LocalCajuelaRegistration> RegisterAsync(
        RegisterCajuelaMutation mutation,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(mutation);
        SqliteLocalStorageConverters.Id(mutation.ClientEventId, nameof(mutation));
        SqliteLocalStorageConverters.Id(mutation.StationId, nameof(mutation));

        await using SqliteConnection connection = await connectionFactory
            .OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        using SqliteTransaction transaction = connection.BeginTransaction(deferred: false);

        ProductionEvent? existing = await FindEventAsync(
                connection,
                transaction,
                mutation.ClientEventId,
                cancellationToken)
            .ConfigureAwait(false);
        if (existing is not null)
        {
            EnsureSameCommand(existing, mutation);
            int existingTotal = await ReadTotalAsync(
                    connection,
                    transaction,
                    existing.Context.LineId,
                    existing.Context.ShipmentId,
                    cancellationToken)
                .ConfigureAwait(false);
            transaction.Commit();
            return new LocalCajuelaRegistration(existing, existingTotal, true);
        }

        ProductionEventContext context = await RequireActiveContextAsync(
                connection,
                transaction,
                mutation.StationId,
                cancellationToken)
            .ConfigureAwait(false);
        long sequence = await NextSequenceAsync(
                connection,
                transaction,
                mutation.StationId,
                cancellationToken)
            .ConfigureAwait(false);
        ProductionEvent productionEvent = ProductionEvent.CajuelaAdded(
            mutation.ClientEventId,
            context,
            sequence,
            mutation.OccurredAt,
            mutation.RecordedAt);

        await InsertEventAsync(connection, transaction, productionEvent, cancellationToken)
            .ConfigureAwait(false);
        int total = await IncrementCounterAsync(connection, transaction, productionEvent, cancellationToken)
            .ConfigureAwait(false);
        await InsertOutboxAsync(connection, transaction, productionEvent, cancellationToken)
            .ConfigureAwait(false);
        transaction.Commit();
        return new LocalCajuelaRegistration(productionEvent, total, false);
    }

    public async Task<int> GetTotalAsync(
        Guid lineId,
        Guid shipmentId,
        CancellationToken cancellationToken = default)
    {
        await using SqliteConnection connection = await connectionFactory
            .OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        return await ReadTotalAsync(connection, null, lineId, shipmentId, cancellationToken)
            .ConfigureAwait(false);
    }

    private static async Task<ProductionEventContext> RequireActiveContextAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        Guid stationId,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT session.organization_id, session.plant_id, session.station_id,
                   session.line_id, session.feed_cycle_id, session.shipment_id,
                   session.responsible_worker_id
            FROM operational_sessions AS session
            INNER JOIN cached_shipments AS shipment
                ON shipment.id = session.shipment_id
               AND shipment.feed_cycle_id = session.feed_cycle_id
               AND shipment.line_id = session.line_id
               AND shipment.organization_id = session.organization_id
            INNER JOIN responsibility_assignments AS responsibility
                ON responsibility.shipment_id = session.shipment_id
               AND responsibility.feed_cycle_id = session.feed_cycle_id
               AND responsibility.line_id = session.line_id
               AND responsibility.organization_id = session.organization_id
               AND responsibility.worker_id = session.responsible_worker_id
               AND responsibility.unassigned_at_utc IS NULL
            WHERE session.station_id = $stationId
              AND session.status = 'ACTIVE'
              AND shipment.status = 'ACTIVE';
            """;
        command.Parameters.AddWithValue(
            "$stationId",
            SqliteLocalStorageConverters.Id(stationId, nameof(stationId)));
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        if (!await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            throw new InvalidOperationException(
                "No se puede registrar una cajuela sin cargamento y responsable activos.");
        }

        return ProductionEventContext.Create(
            Guid.Parse(reader.GetString(0)),
            Guid.Parse(reader.GetString(1)),
            Guid.Parse(reader.GetString(2)),
            Guid.Parse(reader.GetString(3)),
            Guid.Parse(reader.GetString(4)),
            Guid.Parse(reader.GetString(5)),
            Guid.Parse(reader.GetString(6)));
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
            SELECT COALESCE(MAX(client_sequence), 0) + 1
            FROM production_events
            WHERE station_id = $stationId;
            """;
        command.Parameters.AddWithValue(
            "$stationId",
            SqliteLocalStorageConverters.Id(stationId, nameof(stationId)));
        return Convert.ToInt64(
            await command.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false),
            CultureInfo.InvariantCulture);
    }

    private static async Task InsertEventAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        ProductionEvent productionEvent,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            INSERT INTO production_events(
                client_event_id, organization_id, plant_id, station_id, line_id,
                feed_cycle_id, shipment_id, responsible_worker_id, event_type,
                work_period, occurred_at_utc, recorded_at_utc, client_sequence,
                reverses_client_event_id)
            VALUES (
                $clientEventId, $organizationId, $plantId, $stationId, $lineId,
                $feedCycleId, $shipmentId, $responsibleWorkerId, 'CAJUELA_ADDED',
                $workPeriod, $occurredAtUtc, $recordedAtUtc, $clientSequence, NULL);
            """;
        AddEventParameters(command, productionEvent);
        await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    private static async Task<int> IncrementCounterAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        ProductionEvent productionEvent,
        CancellationToken cancellationToken)
    {
        ProductionEventContext context = productionEvent.Context;
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            INSERT INTO production_counters(
                organization_id, plant_id, line_id, shipment_id, feed_cycle_id,
                total, updated_at_utc)
            VALUES (
                $organizationId, $plantId, $lineId, $shipmentId, $feedCycleId,
                1, $updatedAtUtc)
            ON CONFLICT(line_id, shipment_id) DO UPDATE SET
                total = production_counters.total + 1,
                updated_at_utc = excluded.updated_at_utc
            WHERE production_counters.organization_id = excluded.organization_id
              AND production_counters.plant_id = excluded.plant_id
              AND production_counters.feed_cycle_id = excluded.feed_cycle_id
            RETURNING total;
            """;
        command.Parameters.AddWithValue("$organizationId", context.OrganizationId.ToString("D"));
        command.Parameters.AddWithValue("$plantId", context.PlantId.ToString("D"));
        command.Parameters.AddWithValue("$lineId", context.LineId.ToString("D"));
        command.Parameters.AddWithValue("$shipmentId", context.ShipmentId.ToString("D"));
        command.Parameters.AddWithValue("$feedCycleId", context.FeedCycleId.ToString("D"));
        command.Parameters.AddWithValue(
            "$updatedAtUtc",
            SqliteLocalStorageConverters.Timestamp(productionEvent.RecordedAt));
        object? value = await command.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false);
        if (value is null)
        {
            throw new InvalidOperationException("El contador local no coincide con el contexto del evento.");
        }

        return Convert.ToInt32(value, CultureInfo.InvariantCulture);
    }

    private static async Task InsertOutboxAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        ProductionEvent productionEvent,
        CancellationToken cancellationToken)
    {
        ProductionEventContext context = productionEvent.Context;
        var payload = new ProductionEventOutboxPayload(
            1,
            productionEvent.ClientEventId,
            context.OrganizationId,
            context.PlantId,
            context.StationId,
            context.LineId,
            context.FeedCycleId,
            context.ShipmentId,
            context.ResponsibleWorkerId,
            "CAJUELA_ADDED",
            SqliteLocalStorageConverters.WorkPeriod(productionEvent.WorkPeriod),
            productionEvent.OccurredAt,
            productionEvent.RecordedAt,
            productionEvent.ClientSequence,
            1);
        string payloadJson = System.Text.Json.JsonSerializer.Serialize(
            payload,
            LocalStorageJsonSerializerContext.Default.ProductionEventOutboxPayload);

        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            INSERT INTO outbox_messages(
                id, operation_type, aggregate_type, aggregate_id, payload_json,
                state, attempt_count, created_at_utc, updated_at_utc)
            VALUES (
                $id, 'PRODUCTION_EVENT_CREATED', 'production_event', $aggregateId, $payloadJson,
                'PENDING', 0, $createdAtUtc, $createdAtUtc);
            """;
        command.Parameters.AddWithValue("$id", Guid.NewGuid().ToString("D"));
        command.Parameters.AddWithValue("$aggregateId", productionEvent.ClientEventId.ToString("D"));
        command.Parameters.AddWithValue("$payloadJson", payloadJson);
        command.Parameters.AddWithValue(
            "$createdAtUtc",
            SqliteLocalStorageConverters.Timestamp(productionEvent.RecordedAt));
        await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    private static async Task<ProductionEvent?> FindEventAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        Guid clientEventId,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT client_event_id, organization_id, plant_id, station_id, line_id,
                   feed_cycle_id, shipment_id, responsible_worker_id, event_type,
                   work_period, occurred_at_utc, recorded_at_utc, client_sequence,
                   reverses_client_event_id
            FROM production_events
            WHERE client_event_id = $clientEventId;
            """;
        command.Parameters.AddWithValue("$clientEventId", clientEventId.ToString("D"));
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        return await reader.ReadAsync(cancellationToken).ConfigureAwait(false)
            ? ReadEvent(reader)
            : null;
    }

    private static async Task<int> ReadTotalAsync(
        SqliteConnection connection,
        SqliteTransaction? transaction,
        Guid lineId,
        Guid shipmentId,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT total
            FROM production_counters
            WHERE line_id = $lineId AND shipment_id = $shipmentId;
            """;
        command.Parameters.AddWithValue("$lineId", SqliteLocalStorageConverters.Id(lineId, nameof(lineId)));
        command.Parameters.AddWithValue(
            "$shipmentId",
            SqliteLocalStorageConverters.Id(shipmentId, nameof(shipmentId)));
        object? value = await command.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false);
        return value is null ? 0 : Convert.ToInt32(value, CultureInfo.InvariantCulture);
    }

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
        ProductionEvent result = reader.GetString(8) switch
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

        if (SqliteLocalStorageConverters.WorkPeriod(result.WorkPeriod) != reader.GetString(9))
        {
            throw new InvalidOperationException("La jornada persistida no coincide con la hora del evento.");
        }

        return result;
    }

    private static void AddEventParameters(SqliteCommand command, ProductionEvent productionEvent)
    {
        ProductionEventContext context = productionEvent.Context;
        command.Parameters.AddWithValue("$clientEventId", productionEvent.ClientEventId.ToString("D"));
        command.Parameters.AddWithValue("$organizationId", context.OrganizationId.ToString("D"));
        command.Parameters.AddWithValue("$plantId", context.PlantId.ToString("D"));
        command.Parameters.AddWithValue("$stationId", context.StationId.ToString("D"));
        command.Parameters.AddWithValue("$lineId", context.LineId.ToString("D"));
        command.Parameters.AddWithValue("$feedCycleId", context.FeedCycleId.ToString("D"));
        command.Parameters.AddWithValue("$shipmentId", context.ShipmentId.ToString("D"));
        command.Parameters.AddWithValue("$responsibleWorkerId", context.ResponsibleWorkerId.ToString("D"));
        command.Parameters.AddWithValue(
            "$workPeriod",
            SqliteLocalStorageConverters.WorkPeriod(productionEvent.WorkPeriod));
        command.Parameters.AddWithValue(
            "$occurredAtUtc",
            SqliteLocalStorageConverters.Timestamp(productionEvent.OccurredAt));
        command.Parameters.AddWithValue(
            "$recordedAtUtc",
            SqliteLocalStorageConverters.Timestamp(productionEvent.RecordedAt));
        command.Parameters.AddWithValue("$clientSequence", productionEvent.ClientSequence);
    }

    private static void EnsureSameCommand(
        ProductionEvent existing,
        RegisterCajuelaMutation mutation)
    {
        if (existing.Type != ProductionEventType.CajuelaAdded ||
            existing.Context.StationId != mutation.StationId ||
            existing.OccurredAt != mutation.OccurredAt.ToUniversalTime())
        {
            throw new InvalidOperationException(
                "El UUID del comando ya existe con un contenido diferente.");
        }
    }
}
