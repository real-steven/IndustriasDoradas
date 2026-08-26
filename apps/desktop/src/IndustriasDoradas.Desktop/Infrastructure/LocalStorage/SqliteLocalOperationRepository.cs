using System.Globalization;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain.Production;
using Microsoft.Data.Sqlite;

namespace IndustriasDoradas.Desktop.Infrastructure.LocalStorage;

public sealed class SqliteLocalOperationRepository(ILocalSqliteConnectionFactory connectionFactory)
    : ILocalOperationRepository
{
    public async Task StartAsync(
        StartLocalOperationMutation mutation,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(mutation);
        LocalOperationalSession session = mutation.Session;
        if (session.Status != LineFeedCycleStatus.Active)
        {
            throw new ArgumentException("Una operación nueva debe iniciar activa.", nameof(mutation));
        }

        ValidateOutbox(mutation.OutboxMessage, session.ShipmentId, "OPERATION_STARTED");
        await ExecuteTransactionAsync(
            async (connection, transaction) =>
            {
                await EnsureStartCatalogsAsync(connection, transaction, mutation, cancellationToken)
                    .ConfigureAwait(false);
                await InsertShipmentAsync(connection, transaction, mutation, cancellationToken)
                    .ConfigureAwait(false);
                await InsertAssignmentAsync(
                        connection,
                        transaction,
                        mutation.ResponsibilityAssignmentId,
                        session,
                        session.ResponsibleWorkerId,
                        session.StartedAt,
                        cancellationToken)
                    .ConfigureAwait(false);

                await using SqliteCommand sessionCommand = connection.CreateCommand();
                sessionCommand.Transaction = transaction;
                sessionCommand.CommandText = """
                    INSERT INTO operational_sessions(
                        station_id, organization_id, plant_id, line_id, shipment_id,
                        feed_cycle_id, responsible_worker_id, started_at_utc, updated_at_utc, status)
                    VALUES (
                        $stationId, $organizationId, $plantId, $lineId, $shipmentId,
                        $feedCycleId, $responsibleWorkerId, $startedAtUtc, $updatedAtUtc, 'ACTIVE')
                    ON CONFLICT(station_id) DO UPDATE SET
                        organization_id = excluded.organization_id,
                        plant_id = excluded.plant_id,
                        line_id = excluded.line_id,
                        shipment_id = excluded.shipment_id,
                        feed_cycle_id = excluded.feed_cycle_id,
                        responsible_worker_id = excluded.responsible_worker_id,
                        started_at_utc = excluded.started_at_utc,
                        updated_at_utc = excluded.updated_at_utc,
                        status = excluded.status
                    WHERE operational_sessions.status = 'COMPLETED';
                    """;
                AddSessionScope(sessionCommand, session);
                sessionCommand.Parameters.AddWithValue(
                    "$responsibleWorkerId",
                    SqliteLocalStorageConverters.Id(session.ResponsibleWorkerId, nameof(mutation)));
                sessionCommand.Parameters.AddWithValue(
                    "$startedAtUtc",
                    SqliteLocalStorageConverters.Timestamp(session.StartedAt));
                sessionCommand.Parameters.AddWithValue(
                    "$updatedAtUtc",
                    SqliteLocalStorageConverters.Timestamp(session.UpdatedAt));
                await RequireSingleChangeAsync(
                        sessionCommand,
                        "La estación ya tiene un cargamento activo.",
                        cancellationToken)
                    .ConfigureAwait(false);
                await InsertOutboxAsync(connection, transaction, mutation.OutboxMessage, cancellationToken)
                    .ConfigureAwait(false);
            },
            cancellationToken).ConfigureAwait(false);
    }

    public async Task RelieveAsync(
        RelieveLocalOperationMutation mutation,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(mutation);
        LocalOperationalSession current = mutation.ExpectedSession;
        ValidateOutbox(mutation.OutboxMessage, current.ShipmentId, "RESPONSIBLE_RELIEVED");
        if (mutation.NextResponsibleWorkerId == current.ResponsibleWorkerId)
        {
            throw new ArgumentException("El relevo debe cambiar de responsable.", nameof(mutation));
        }

        await ExecuteTransactionAsync(
            async (connection, transaction) =>
            {
                await EnsureActiveWorkerAsync(
                        connection,
                        transaction,
                        mutation.NextResponsibleWorkerId,
                        current.OrganizationId,
                        cancellationToken)
                    .ConfigureAwait(false);

                await using SqliteCommand closeAssignment = connection.CreateCommand();
                closeAssignment.Transaction = transaction;
                closeAssignment.CommandText = """
                    UPDATE responsibility_assignments
                    SET unassigned_at_utc = $effectiveAtUtc
                    WHERE organization_id = $organizationId
                      AND line_id = $lineId
                      AND shipment_id = $shipmentId
                      AND feed_cycle_id = $feedCycleId
                      AND worker_id = $responsibleWorkerId
                      AND unassigned_at_utc IS NULL
                      AND assigned_at_utc < $effectiveAtUtc;
                    """;
                AddSessionScope(closeAssignment, current);
                closeAssignment.Parameters.AddWithValue(
                    "$responsibleWorkerId",
                    SqliteLocalStorageConverters.Id(current.ResponsibleWorkerId, nameof(mutation)));
                closeAssignment.Parameters.AddWithValue(
                    "$effectiveAtUtc",
                    SqliteLocalStorageConverters.Timestamp(mutation.EffectiveAt));
                await RequireSingleChangeAsync(
                        closeAssignment,
                        "El responsable vigente cambió o el instante del relevo no es válido.",
                        cancellationToken)
                    .ConfigureAwait(false);

                await InsertAssignmentAsync(
                        connection,
                        transaction,
                        mutation.ResponsibilityAssignmentId,
                        current,
                        mutation.NextResponsibleWorkerId,
                        mutation.EffectiveAt,
                        cancellationToken)
                    .ConfigureAwait(false);

                await using SqliteCommand updateSession = connection.CreateCommand();
                updateSession.Transaction = transaction;
                updateSession.CommandText = """
                    UPDATE operational_sessions
                    SET responsible_worker_id = $nextResponsibleWorkerId,
                        updated_at_utc = $effectiveAtUtc
                    WHERE station_id = $stationId
                      AND organization_id = $organizationId
                      AND plant_id = $plantId
                      AND line_id = $lineId
                      AND shipment_id = $shipmentId
                      AND feed_cycle_id = $feedCycleId
                      AND responsible_worker_id = $responsibleWorkerId
                      AND updated_at_utc = $expectedUpdatedAtUtc
                      AND status = 'ACTIVE';
                    """;
                AddSessionScope(updateSession, current);
                updateSession.Parameters.AddWithValue(
                    "$responsibleWorkerId",
                    SqliteLocalStorageConverters.Id(current.ResponsibleWorkerId, nameof(mutation)));
                updateSession.Parameters.AddWithValue(
                    "$nextResponsibleWorkerId",
                    SqliteLocalStorageConverters.Id(mutation.NextResponsibleWorkerId, nameof(mutation)));
                updateSession.Parameters.AddWithValue(
                    "$effectiveAtUtc",
                    SqliteLocalStorageConverters.Timestamp(mutation.EffectiveAt));
                updateSession.Parameters.AddWithValue(
                    "$expectedUpdatedAtUtc",
                    SqliteLocalStorageConverters.Timestamp(current.UpdatedAt));
                await RequireSingleChangeAsync(
                        updateSession,
                        "El contexto cambió mientras se preparaba el relevo.",
                        cancellationToken)
                    .ConfigureAwait(false);
                await InsertOutboxAsync(connection, transaction, mutation.OutboxMessage, cancellationToken)
                    .ConfigureAwait(false);
            },
            cancellationToken).ConfigureAwait(false);
    }

    public async Task CompleteAsync(
        CompleteLocalOperationMutation mutation,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(mutation);
        LocalOperationalSession current = mutation.ExpectedSession;
        ValidateOutbox(mutation.OutboxMessage, current.ShipmentId, "OPERATION_COMPLETED");

        await ExecuteTransactionAsync(
            async (connection, transaction) =>
            {
                await using SqliteCommand closeAssignment = connection.CreateCommand();
                closeAssignment.Transaction = transaction;
                closeAssignment.CommandText = """
                    UPDATE responsibility_assignments
                    SET unassigned_at_utc = $completedAtUtc
                    WHERE organization_id = $organizationId
                      AND line_id = $lineId
                      AND shipment_id = $shipmentId
                      AND feed_cycle_id = $feedCycleId
                      AND worker_id = $responsibleWorkerId
                      AND unassigned_at_utc IS NULL
                      AND assigned_at_utc <= $completedAtUtc;
                    """;
                AddSessionScope(closeAssignment, current);
                closeAssignment.Parameters.AddWithValue(
                    "$responsibleWorkerId",
                    SqliteLocalStorageConverters.Id(current.ResponsibleWorkerId, nameof(mutation)));
                closeAssignment.Parameters.AddWithValue(
                    "$completedAtUtc",
                    SqliteLocalStorageConverters.Timestamp(mutation.CompletedAt));
                await RequireSingleChangeAsync(
                        closeAssignment,
                        "No existe una asignación vigente que pueda finalizarse.",
                        cancellationToken)
                    .ConfigureAwait(false);

                await using SqliteCommand completeShipment = connection.CreateCommand();
                completeShipment.Transaction = transaction;
                completeShipment.CommandText = """
                    UPDATE cached_shipments
                    SET completed_at_utc = $completedAtUtc,
                        status = 'COMPLETED'
                    WHERE id = $shipmentId
                      AND organization_id = $organizationId
                      AND line_id = $lineId
                      AND feed_cycle_id = $feedCycleId
                      AND status = 'ACTIVE';
                    """;
                AddSessionScope(completeShipment, current);
                completeShipment.Parameters.AddWithValue(
                    "$completedAtUtc",
                    SqliteLocalStorageConverters.Timestamp(mutation.CompletedAt));
                await RequireSingleChangeAsync(
                        completeShipment,
                        "El cargamento ya no está activo.",
                        cancellationToken)
                    .ConfigureAwait(false);

                await using SqliteCommand completeSession = connection.CreateCommand();
                completeSession.Transaction = transaction;
                completeSession.CommandText = """
                    UPDATE operational_sessions
                    SET updated_at_utc = $completedAtUtc,
                        status = 'COMPLETED'
                    WHERE station_id = $stationId
                      AND organization_id = $organizationId
                      AND plant_id = $plantId
                      AND line_id = $lineId
                      AND shipment_id = $shipmentId
                      AND feed_cycle_id = $feedCycleId
                      AND responsible_worker_id = $responsibleWorkerId
                      AND updated_at_utc = $expectedUpdatedAtUtc
                      AND status = 'ACTIVE';
                    """;
                AddSessionScope(completeSession, current);
                completeSession.Parameters.AddWithValue(
                    "$responsibleWorkerId",
                    SqliteLocalStorageConverters.Id(current.ResponsibleWorkerId, nameof(mutation)));
                completeSession.Parameters.AddWithValue(
                    "$completedAtUtc",
                    SqliteLocalStorageConverters.Timestamp(mutation.CompletedAt));
                completeSession.Parameters.AddWithValue(
                    "$expectedUpdatedAtUtc",
                    SqliteLocalStorageConverters.Timestamp(current.UpdatedAt));
                await RequireSingleChangeAsync(
                        completeSession,
                        "El contexto cambió mientras se preparaba el cierre.",
                        cancellationToken)
                    .ConfigureAwait(false);
                await InsertOutboxAsync(connection, transaction, mutation.OutboxMessage, cancellationToken)
                    .ConfigureAwait(false);
            },
            cancellationToken).ConfigureAwait(false);
    }

    private async Task ExecuteTransactionAsync(
        Func<SqliteConnection, SqliteTransaction, Task> action,
        CancellationToken cancellationToken)
    {
        await using SqliteConnection connection = await connectionFactory
            .OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        using SqliteTransaction transaction = connection.BeginTransaction();
        try
        {
            await action(connection, transaction).ConfigureAwait(false);
            transaction.Commit();
        }
        catch (SqliteException exception) when (exception.SqliteErrorCode == 19)
        {
            throw new InvalidOperationException(
                "La operación local viola el contexto vigente y fue revertida por completo.",
                exception);
        }
    }

    private static async Task EnsureStartCatalogsAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        StartLocalOperationMutation mutation,
        CancellationToken cancellationToken)
    {
        LocalOperationalSession session = mutation.Session;
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT
                EXISTS(
                    SELECT 1 FROM cached_suppliers
                    WHERE id = $supplierId AND organization_id = $organizationId AND is_active = 1)
              * EXISTS(
                    SELECT 1 FROM cached_workers
                    WHERE id = $responsibleWorkerId AND organization_id = $organizationId AND is_active = 1)
              * EXISTS(
                    SELECT 1 FROM cached_production_lines
                    WHERE id = $lineId AND organization_id = $organizationId
                      AND plant_id = $plantId AND is_active = 1);
            """;
        AddSessionScope(command, session);
        command.Parameters.AddWithValue(
            "$supplierId",
            SqliteLocalStorageConverters.Id(mutation.SupplierId, nameof(mutation)));
        command.Parameters.AddWithValue(
            "$responsibleWorkerId",
            SqliteLocalStorageConverters.Id(session.ResponsibleWorkerId, nameof(mutation)));
        if (Convert.ToInt64(
                await command.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false),
                CultureInfo.InvariantCulture) != 1)
        {
            throw new InvalidOperationException("Proveedor, línea o responsable dejaron de estar activos.");
        }
    }

    private static async Task EnsureActiveWorkerAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        Guid workerId,
        Guid organizationId,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT EXISTS(
                SELECT 1 FROM cached_workers
                WHERE id = $workerId AND organization_id = $organizationId AND is_active = 1);
            """;
        command.Parameters.AddWithValue("$workerId", SqliteLocalStorageConverters.Id(workerId, nameof(workerId)));
        command.Parameters.AddWithValue(
            "$organizationId",
            SqliteLocalStorageConverters.Id(organizationId, nameof(organizationId)));
        if (Convert.ToInt64(
                await command.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false),
                CultureInfo.InvariantCulture) != 1)
        {
            throw new InvalidOperationException("El nuevo responsable dejó de estar activo.");
        }
    }

    private static async Task InsertShipmentAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        StartLocalOperationMutation mutation,
        CancellationToken cancellationToken)
    {
        LocalOperationalSession session = mutation.Session;
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            INSERT INTO cached_shipments(
                id, organization_id, supplier_id, line_id, feed_cycle_id,
                started_at_utc, completed_at_utc, status)
            VALUES (
                $shipmentId, $organizationId, $supplierId, $lineId, $feedCycleId,
                $startedAtUtc, NULL, 'ACTIVE');
            """;
        AddSessionScope(command, session);
        command.Parameters.AddWithValue(
            "$supplierId",
            SqliteLocalStorageConverters.Id(mutation.SupplierId, nameof(mutation)));
        command.Parameters.AddWithValue(
            "$startedAtUtc",
            SqliteLocalStorageConverters.Timestamp(session.StartedAt));
        await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    private static async Task InsertAssignmentAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        Guid assignmentId,
        LocalOperationalSession session,
        Guid workerId,
        DateTimeOffset assignedAt,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            INSERT INTO responsibility_assignments(
                id, organization_id, line_id, shipment_id, feed_cycle_id,
                worker_id, assigned_at_utc, unassigned_at_utc)
            VALUES (
                $id, $organizationId, $lineId, $shipmentId, $feedCycleId,
                $workerId, $assignedAtUtc, NULL);
            """;
        AddSessionScope(command, session);
        command.Parameters.AddWithValue("$id", SqliteLocalStorageConverters.Id(assignmentId, nameof(assignmentId)));
        command.Parameters.AddWithValue("$workerId", SqliteLocalStorageConverters.Id(workerId, nameof(workerId)));
        command.Parameters.AddWithValue("$assignedAtUtc", SqliteLocalStorageConverters.Timestamp(assignedAt));
        await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    private static async Task InsertOutboxAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        PendingOutboxMessage outbox,
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
        command.Parameters.AddWithValue("$id", SqliteLocalStorageConverters.Id(outbox.Id, nameof(outbox)));
        command.Parameters.AddWithValue(
            "$operationType",
            SqliteLocalStorageConverters.Text(outbox.OperationType, nameof(outbox)));
        command.Parameters.AddWithValue(
            "$aggregateType",
            SqliteLocalStorageConverters.Text(outbox.AggregateType, nameof(outbox)));
        command.Parameters.AddWithValue(
            "$aggregateId",
            SqliteLocalStorageConverters.Id(outbox.AggregateId, nameof(outbox)));
        command.Parameters.AddWithValue(
            "$payloadJson",
            SqliteLocalStorageConverters.Text(outbox.PayloadJson, nameof(outbox)));
        command.Parameters.AddWithValue("$createdAtUtc", SqliteLocalStorageConverters.Timestamp(outbox.CreatedAt));
        await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    private static void AddSessionScope(SqliteCommand command, LocalOperationalSession session)
    {
        command.Parameters.AddWithValue(
            "$stationId",
            SqliteLocalStorageConverters.Id(session.StationId, nameof(session)));
        command.Parameters.AddWithValue(
            "$organizationId",
            SqliteLocalStorageConverters.Id(session.OrganizationId, nameof(session)));
        command.Parameters.AddWithValue(
            "$plantId",
            SqliteLocalStorageConverters.Id(session.PlantId, nameof(session)));
        command.Parameters.AddWithValue("$lineId", SqliteLocalStorageConverters.Id(session.LineId, nameof(session)));
        command.Parameters.AddWithValue(
            "$shipmentId",
            SqliteLocalStorageConverters.Id(session.ShipmentId, nameof(session)));
        command.Parameters.AddWithValue(
            "$feedCycleId",
            SqliteLocalStorageConverters.Id(session.FeedCycleId, nameof(session)));
    }

    private static async Task RequireSingleChangeAsync(
        SqliteCommand command,
        string errorMessage,
        CancellationToken cancellationToken)
    {
        if (await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false) != 1)
        {
            throw new InvalidOperationException(errorMessage);
        }
    }

    private static void ValidateOutbox(
        PendingOutboxMessage outbox,
        Guid shipmentId,
        string operationType)
    {
        ArgumentNullException.ThrowIfNull(outbox);
        if (outbox.AggregateId != shipmentId ||
            !string.Equals(outbox.AggregateType, "shipment", StringComparison.Ordinal) ||
            !string.Equals(outbox.OperationType, operationType, StringComparison.Ordinal))
        {
            throw new ArgumentException("La Outbox no corresponde a la mutación operativa.", nameof(outbox));
        }
    }
}
