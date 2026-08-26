using System.Globalization;
using System.Text.Json;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain.Production;
using Microsoft.Data.Sqlite;

namespace IndustriasDoradas.Desktop.Infrastructure.LocalStorage;

public sealed partial class SqliteCajuelaRepository
{
    private const string ImmediateInputErrorReason = "IMMEDIATE_INPUT_ERROR";

    public async Task<LocalCajuelaCorrectionTarget> FindCorrectionTargetAsync(
        Guid stationId,
        CancellationToken cancellationToken = default)
    {
        SqliteLocalStorageConverters.Id(stationId, nameof(stationId));
        await using SqliteConnection connection = await connectionFactory
            .OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        using SqliteTransaction transaction = connection.BeginTransaction();
        LocalOperationalSession session = await RequireActiveSessionAsync(
                connection,
                transaction,
                stationId,
                cancellationToken)
            .ConfigureAwait(false);
        ProductionEvent target = await RequireLatestEffectiveAddedAsync(
                connection,
                transaction,
                session.LineId,
                session.ShipmentId,
                cancellationToken)
            .ConfigureAwait(false);
        int total = await ReadTotalAsync(
                connection,
                transaction,
                session.LineId,
                session.ShipmentId,
                cancellationToken)
            .ConfigureAwait(false);
        if (total < 1)
        {
            throw new InvalidOperationException("No existe una cajuela efectiva que pueda corregirse.");
        }

        transaction.Commit();
        return new LocalCajuelaCorrectionTarget(session, target, total);
    }

    public async Task<LocalCajuelaReversal> ReverseAsync(
        ReverseCajuelaMutation mutation,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(mutation);
        ValidateReversalMutation(mutation);
        await using SqliteConnection connection = await connectionFactory
            .OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        using SqliteTransaction transaction = connection.BeginTransaction(deferred: false);

        ProductionEvent? existing = await FindEventAsync(
                connection,
                transaction,
                mutation.ReversalEventId,
                cancellationToken)
            .ConfigureAwait(false);
        if (existing is not null)
        {
            LocalCajuelaReversal duplicate = await ReadExistingReversalAsync(
                    connection,
                    transaction,
                    existing,
                    mutation,
                    cancellationToken)
                .ConfigureAwait(false);
            transaction.Commit();
            return duplicate;
        }

        LocalOperationalSession current = await RequireActiveSessionAsync(
                connection,
                transaction,
                mutation.ExpectedSession.StationId,
                cancellationToken)
            .ConfigureAwait(false);
        if (current != mutation.ExpectedSession)
        {
            throw new InvalidOperationException(
                "El contexto cambió después de preparar la corrección; debe confirmarse nuevamente.");
        }

        ProductionEvent target = await RequireLatestEffectiveAddedAsync(
                connection,
                transaction,
                current.LineId,
                current.ShipmentId,
                cancellationToken)
            .ConfigureAwait(false);
        if (target.ClientEventId != mutation.TargetClientEventId)
        {
            throw new InvalidOperationException(
                "La última cajuela cambió después de preparar la corrección.");
        }

        long sequence = await NextSequenceAsync(
                connection,
                transaction,
                current.StationId,
                cancellationToken)
            .ConfigureAwait(false);
        ProductionEvent reversal = ProductionEvent.CajuelaReversed(
            mutation.ReversalEventId,
            ToEventContext(current),
            sequence,
            mutation.ConfirmedAt,
            mutation.ConfirmedAt,
            target.ClientEventId);
        await InsertReversalEventAsync(connection, transaction, reversal, cancellationToken)
            .ConfigureAwait(false);
        int total = await DecrementCounterAsync(connection, transaction, reversal, cancellationToken)
            .ConfigureAwait(false);
        await InsertCorrectionAuditAsync(connection, transaction, mutation, cancellationToken)
            .ConfigureAwait(false);
        await InsertReversalOutboxAsync(
                connection,
                transaction,
                reversal,
                mutation,
                cancellationToken)
            .ConfigureAwait(false);
        transaction.Commit();
        return new LocalCajuelaReversal(
            reversal,
            target.ClientEventId,
            mutation.ReasonCode,
            total,
            false);
    }

    private static async Task<LocalOperationalSession> RequireActiveSessionAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        Guid stationId,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT session.station_id, session.organization_id, session.plant_id,
                   session.line_id, session.shipment_id, session.feed_cycle_id,
                   session.responsible_worker_id, session.started_at_utc,
                   session.updated_at_utc, session.status
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
                "La corrección inmediata requiere un cargamento y responsable activos.");
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

    private static async Task<ProductionEvent> RequireLatestEffectiveAddedAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        Guid lineId,
        Guid shipmentId,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT added.client_event_id, added.organization_id, added.plant_id,
                   added.station_id, added.line_id, added.feed_cycle_id,
                   added.shipment_id, added.responsible_worker_id, added.event_type,
                   added.work_period, added.occurred_at_utc, added.recorded_at_utc,
                   added.client_sequence, added.reverses_client_event_id
            FROM production_events AS added
            WHERE added.line_id = $lineId
              AND added.shipment_id = $shipmentId
              AND added.event_type = 'CAJUELA_ADDED'
              AND NOT EXISTS (
                  SELECT 1
                  FROM production_events AS reversal
                  WHERE reversal.event_type = 'CAJUELA_REVERSED'
                    AND reversal.reverses_client_event_id = added.client_event_id)
            ORDER BY added.client_sequence DESC, added.client_event_id DESC
            LIMIT 1;
            """;
        command.Parameters.AddWithValue("$lineId", SqliteLocalStorageConverters.Id(lineId, nameof(lineId)));
        command.Parameters.AddWithValue(
            "$shipmentId",
            SqliteLocalStorageConverters.Id(shipmentId, nameof(shipmentId)));
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        if (!await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            throw new InvalidOperationException("No existe una cajuela efectiva que pueda corregirse.");
        }

        return ReadEvent(reader);
    }

    private static async Task InsertReversalEventAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        ProductionEvent reversal,
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
                $feedCycleId, $shipmentId, $responsibleWorkerId, 'CAJUELA_REVERSED',
                $workPeriod, $occurredAtUtc, $recordedAtUtc, $clientSequence,
                $reversesClientEventId);
            """;
        AddEventParameters(command, reversal);
        command.Parameters.AddWithValue(
            "$reversesClientEventId",
            reversal.ReversesClientEventId!.Value.ToString("D"));
        await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    private static async Task<int> DecrementCounterAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        ProductionEvent reversal,
        CancellationToken cancellationToken)
    {
        ProductionEventContext context = reversal.Context;
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            UPDATE production_counters
            SET total = total - 1,
                updated_at_utc = $updatedAtUtc
            WHERE organization_id = $organizationId
              AND plant_id = $plantId
              AND line_id = $lineId
              AND shipment_id = $shipmentId
              AND feed_cycle_id = $feedCycleId
              AND total > 0
            RETURNING total;
            """;
        command.Parameters.AddWithValue("$organizationId", context.OrganizationId.ToString("D"));
        command.Parameters.AddWithValue("$plantId", context.PlantId.ToString("D"));
        command.Parameters.AddWithValue("$lineId", context.LineId.ToString("D"));
        command.Parameters.AddWithValue("$shipmentId", context.ShipmentId.ToString("D"));
        command.Parameters.AddWithValue("$feedCycleId", context.FeedCycleId.ToString("D"));
        command.Parameters.AddWithValue(
            "$updatedAtUtc",
            SqliteLocalStorageConverters.Timestamp(reversal.RecordedAt));
        object? value = await command.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false);
        if (value is null)
        {
            throw new InvalidOperationException("El contador no contiene la cajuela que se intenta corregir.");
        }

        return Convert.ToInt32(value, CultureInfo.InvariantCulture);
    }

    private static async Task InsertCorrectionAuditAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        ReverseCajuelaMutation mutation,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            INSERT INTO production_event_corrections(
                reversal_client_event_id, target_client_event_id, confirmation_id,
                reason_code, prepared_at_utc, confirmed_at_utc)
            VALUES (
                $reversalClientEventId, $targetClientEventId, $confirmationId,
                $reasonCode, $preparedAtUtc, $confirmedAtUtc);
            """;
        AddCorrectionParameters(command, mutation);
        await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    private static async Task InsertReversalOutboxAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        ProductionEvent reversal,
        ReverseCajuelaMutation mutation,
        CancellationToken cancellationToken)
    {
        ProductionEventContext context = reversal.Context;
        var payload = new ProductionEventReversalOutboxPayload(
            1,
            reversal.ClientEventId,
            context.OrganizationId,
            context.PlantId,
            context.StationId,
            context.LineId,
            context.FeedCycleId,
            context.ShipmentId,
            context.ResponsibleWorkerId,
            "CAJUELA_REVERSED",
            SqliteLocalStorageConverters.WorkPeriod(reversal.WorkPeriod),
            reversal.OccurredAt,
            reversal.RecordedAt,
            reversal.ClientSequence,
            -1,
            mutation.TargetClientEventId,
            mutation.ConfirmationId,
            mutation.ReasonCode,
            mutation.PreparedAt);
        string payloadJson = JsonSerializer.Serialize(
            payload,
            LocalStorageJsonSerializerContext.Default.ProductionEventReversalOutboxPayload);

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
        command.Parameters.AddWithValue("$aggregateId", reversal.ClientEventId.ToString("D"));
        command.Parameters.AddWithValue("$payloadJson", payloadJson);
        command.Parameters.AddWithValue(
            "$createdAtUtc",
            SqliteLocalStorageConverters.Timestamp(reversal.RecordedAt));
        await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    private static async Task<LocalCajuelaReversal> ReadExistingReversalAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        ProductionEvent existing,
        ReverseCajuelaMutation mutation,
        CancellationToken cancellationToken)
    {
        if (existing.Type != ProductionEventType.CajuelaReversed ||
            existing.Context.StationId != mutation.ExpectedSession.StationId)
        {
            throw new InvalidOperationException(
                "El UUID de reversión ya existe con un contenido diferente.");
        }

        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT target_client_event_id, confirmation_id, reason_code
            FROM production_event_corrections
            WHERE reversal_client_event_id = $reversalClientEventId;
            """;
        command.Parameters.AddWithValue("$reversalClientEventId", existing.ClientEventId.ToString("D"));
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        if (!await reader.ReadAsync(cancellationToken).ConfigureAwait(false) ||
            Guid.Parse(reader.GetString(0)) != mutation.TargetClientEventId ||
            Guid.Parse(reader.GetString(1)) != mutation.ConfirmationId ||
            !string.Equals(reader.GetString(2), mutation.ReasonCode, StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                "La confirmación ya existe con un contenido diferente.");
        }

        int total = await ReadTotalAsync(
                connection,
                transaction,
                existing.Context.LineId,
                existing.Context.ShipmentId,
                cancellationToken)
            .ConfigureAwait(false);
        return new LocalCajuelaReversal(
            existing,
            mutation.TargetClientEventId,
            mutation.ReasonCode,
            total,
            true);
    }

    private static ProductionEventContext ToEventContext(LocalOperationalSession session) =>
        ProductionEventContext.Create(
            session.OrganizationId,
            session.PlantId,
            session.StationId,
            session.LineId,
            session.FeedCycleId,
            session.ShipmentId,
            session.ResponsibleWorkerId);

    private static void ValidateReversalMutation(ReverseCajuelaMutation mutation)
    {
        SqliteLocalStorageConverters.Id(mutation.ReversalEventId, nameof(mutation));
        SqliteLocalStorageConverters.Id(mutation.ConfirmationId, nameof(mutation));
        SqliteLocalStorageConverters.Id(mutation.TargetClientEventId, nameof(mutation));
        ArgumentNullException.ThrowIfNull(mutation.ExpectedSession);
        if (!string.Equals(mutation.ReasonCode, ImmediateInputErrorReason, StringComparison.Ordinal))
        {
            throw new InvalidOperationException("La corrección inmediata usa un motivo automático fijo.");
        }

        if (mutation.ConfirmedAt.ToUniversalTime() < mutation.PreparedAt.ToUniversalTime())
        {
            throw new InvalidOperationException("La confirmación no puede ocurrir antes de la preparación.");
        }
    }

    private static void AddCorrectionParameters(
        SqliteCommand command,
        ReverseCajuelaMutation mutation)
    {
        command.Parameters.AddWithValue("$reversalClientEventId", mutation.ReversalEventId.ToString("D"));
        command.Parameters.AddWithValue("$targetClientEventId", mutation.TargetClientEventId.ToString("D"));
        command.Parameters.AddWithValue("$confirmationId", mutation.ConfirmationId.ToString("D"));
        command.Parameters.AddWithValue("$reasonCode", mutation.ReasonCode);
        command.Parameters.AddWithValue(
            "$preparedAtUtc",
            SqliteLocalStorageConverters.Timestamp(mutation.PreparedAt));
        command.Parameters.AddWithValue(
            "$confirmedAtUtc",
            SqliteLocalStorageConverters.Timestamp(mutation.ConfirmedAt));
    }
}
