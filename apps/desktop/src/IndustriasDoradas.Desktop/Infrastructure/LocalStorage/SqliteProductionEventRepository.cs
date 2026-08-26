using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain.Production;
using Microsoft.Data.Sqlite;

namespace IndustriasDoradas.Desktop.Infrastructure.LocalStorage;

public sealed class SqliteProductionEventRepository(ILocalSqliteConnectionFactory connectionFactory)
    : ILocalProductionEventRepository
{
    public async Task AppendWithOutboxAsync(
        ProductionEvent productionEvent,
        PendingOutboxMessage outboxMessage,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(productionEvent);
        ArgumentNullException.ThrowIfNull(outboxMessage);

        await using SqliteConnection connection = await connectionFactory
            .OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        using SqliteTransaction transaction = connection.BeginTransaction();
        await InsertEventAsync(connection, transaction, productionEvent, cancellationToken)
            .ConfigureAwait(false);
        await InsertOutboxAsync(connection, transaction, outboxMessage, cancellationToken)
            .ConfigureAwait(false);
        transaction.Commit();
    }

    public async Task<IReadOnlyList<ProductionEvent>> ListAsync(
        Guid lineId,
        Guid shipmentId,
        CancellationToken cancellationToken = default)
    {
        await using SqliteConnection connection = await connectionFactory
            .OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            SELECT client_event_id, organization_id, plant_id, station_id, line_id,
                   feed_cycle_id, shipment_id, responsible_worker_id, event_type,
                   work_period, occurred_at_utc, recorded_at_utc, client_sequence,
                   reverses_client_event_id
            FROM production_events
            WHERE line_id = $lineId AND shipment_id = $shipmentId
            ORDER BY client_sequence, client_event_id;
            """;
        command.Parameters.AddWithValue("$lineId", SqliteLocalStorageConverters.Id(lineId, nameof(lineId)));
        command.Parameters.AddWithValue(
            "$shipmentId",
            SqliteLocalStorageConverters.Id(shipmentId, nameof(shipmentId)));

        var events = new List<ProductionEvent>();
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            events.Add(ReadEvent(reader));
        }

        return events;
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
                $feedCycleId, $shipmentId, $responsibleWorkerId, $eventType,
                $workPeriod, $occurredAtUtc, $recordedAtUtc, $clientSequence,
                $reversesClientEventId);
            """;
        ProductionEventContext context = productionEvent.Context;
        command.Parameters.AddWithValue(
            "$clientEventId",
            SqliteLocalStorageConverters.Id(productionEvent.ClientEventId, nameof(productionEvent)));
        command.Parameters.AddWithValue("$organizationId", context.OrganizationId.ToString("D"));
        command.Parameters.AddWithValue("$plantId", context.PlantId.ToString("D"));
        command.Parameters.AddWithValue("$stationId", context.StationId.ToString("D"));
        command.Parameters.AddWithValue("$lineId", context.LineId.ToString("D"));
        command.Parameters.AddWithValue("$feedCycleId", context.FeedCycleId.ToString("D"));
        command.Parameters.AddWithValue("$shipmentId", context.ShipmentId.ToString("D"));
        command.Parameters.AddWithValue("$responsibleWorkerId", context.ResponsibleWorkerId.ToString("D"));
        command.Parameters.AddWithValue("$eventType", SqliteLocalStorageConverters.EventType(productionEvent.Type));
        command.Parameters.AddWithValue("$workPeriod", SqliteLocalStorageConverters.WorkPeriod(productionEvent.WorkPeriod));
        command.Parameters.AddWithValue("$occurredAtUtc", SqliteLocalStorageConverters.Timestamp(productionEvent.OccurredAt));
        command.Parameters.AddWithValue("$recordedAtUtc", SqliteLocalStorageConverters.Timestamp(productionEvent.RecordedAt));
        command.Parameters.AddWithValue("$clientSequence", productionEvent.ClientSequence);
        command.Parameters.AddWithValue(
            "$reversesClientEventId",
            productionEvent.ReversesClientEventId is null
                ? DBNull.Value
                : productionEvent.ReversesClientEventId.Value.ToString("D"));
        await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    private static async Task InsertOutboxAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        PendingOutboxMessage outboxMessage,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            INSERT INTO outbox_messages(
                id, operation_type, aggregate_type, aggregate_id, payload_json,
                state, attempt_count, created_at_utc, updated_at_utc)
            VALUES (
                $id, $operationType, $aggregateType, $aggregateId, $payloadJson,
                'PENDING', 0, $createdAtUtc, $createdAtUtc);
            """;
        command.Parameters.AddWithValue("$id", SqliteLocalStorageConverters.Id(outboxMessage.Id, nameof(outboxMessage)));
        command.Parameters.AddWithValue(
            "$operationType",
            SqliteLocalStorageConverters.Text(outboxMessage.OperationType, nameof(outboxMessage)));
        command.Parameters.AddWithValue(
            "$aggregateType",
            SqliteLocalStorageConverters.Text(outboxMessage.AggregateType, nameof(outboxMessage)));
        command.Parameters.AddWithValue(
            "$aggregateId",
            SqliteLocalStorageConverters.Id(outboxMessage.AggregateId, nameof(outboxMessage)));
        command.Parameters.AddWithValue(
            "$payloadJson",
            SqliteLocalStorageConverters.Text(outboxMessage.PayloadJson, nameof(outboxMessage)));
        command.Parameters.AddWithValue("$createdAtUtc", SqliteLocalStorageConverters.Timestamp(outboxMessage.CreatedAt));
        await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
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
        Guid clientEventId = Guid.Parse(reader.GetString(0));
        DateTimeOffset occurredAt = SqliteLocalStorageConverters.ReadTimestamp(reader.GetString(10));
        DateTimeOffset recordedAt = SqliteLocalStorageConverters.ReadTimestamp(reader.GetString(11));
        long sequence = reader.GetInt64(12);
        string storedWorkPeriod = reader.GetString(9);
        ProductionEvent result = reader.GetString(8) switch
        {
            "CAJUELA_ADDED" => ProductionEvent.CajuelaAdded(
                clientEventId,
                context,
                sequence,
                occurredAt,
                recordedAt),
            "CAJUELA_REVERSED" => ProductionEvent.CajuelaReversed(
                clientEventId,
                context,
                sequence,
                occurredAt,
                recordedAt,
                Guid.Parse(reader.GetString(13))),
            string value => throw new InvalidOperationException($"Tipo SQLite desconocido: {value}."),
        };

        if (SqliteLocalStorageConverters.WorkPeriod(result.WorkPeriod) != storedWorkPeriod)
        {
            throw new InvalidOperationException("La jornada persistida no coincide con la hora del evento.");
        }

        return result;
    }
}
