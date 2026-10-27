using System.Globalization;
using System.Text.Json;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain.Inventory;
using Microsoft.Data.Sqlite;

namespace IndustriasDoradas.Desktop.Infrastructure.LocalStorage;

public sealed class SqliteInventoryRepository(
    ILocalSqliteConnectionFactory connectionFactory) : ILocalInventoryRepository
{
    public async Task<IReadOnlyList<LocalInventoryStock>> ListStockAsync(
        Guid organizationId,
        Guid plantId,
        CancellationToken cancellationToken = default)
    {
        await using SqliteConnection connection = await connectionFactory.OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            SELECT item.id, item.organization_id, item.plant_id, item.name, item.is_active,
                   type.id, type.code, type.name, type.is_custom, type.is_active,
                   unit.id, unit.code, unit.name, unit.decimal_places, unit.is_custom,
                   COALESCE((SELECT SUM(central.quantity_delta_milliunits)
                       FROM inventory_central_movements AS central
                       WHERE central.organization_id = item.organization_id
                         AND central.plant_id = item.plant_id
                         AND central.inventory_item_id = item.id), 0)
                     + COALESCE(SUM(CASE WHEN outbox.id IS NULL OR outbox.state <> 'SYNCED'
                         THEN movement.quantity_delta_milliunits ELSE 0 END), 0) AS local_balance,
                   COALESCE((SELECT SUM(central.quantity_delta_milliunits)
                       FROM inventory_central_movements AS central
                       WHERE central.organization_id = item.organization_id
                         AND central.plant_id = item.plant_id
                         AND central.inventory_item_id = item.id), 0) AS central_balance,
                   COUNT(CASE WHEN outbox.id IS NOT NULL AND outbox.state <> 'SYNCED' THEN 1 END)
            FROM inventory_items AS item
            JOIN inventory_item_types AS type
              ON type.organization_id = item.organization_id AND type.id = item.item_type_id
            JOIN inventory_units AS unit
              ON unit.organization_id = item.organization_id AND unit.id = item.unit_id
            LEFT JOIN inventory_movements AS movement
              ON movement.organization_id = item.organization_id
             AND movement.plant_id = item.plant_id
             AND movement.inventory_item_id = item.id
            LEFT JOIN outbox_messages AS outbox
              ON outbox.aggregate_type = 'inventory_movement'
             AND outbox.aggregate_id = movement.client_movement_id
            WHERE item.organization_id = $organizationId AND item.plant_id = $plantId
              AND item.is_active = 1 AND type.is_active = 1 AND unit.is_active = 1
            GROUP BY item.id, type.id, unit.id
            ORDER BY item.name, item.id;
            """;
        command.Parameters.AddWithValue("$organizationId", organizationId.ToString("D"));
        command.Parameters.AddWithValue("$plantId", plantId.ToString("D"));
        var result = new List<LocalInventoryStock>();
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            InventoryItem item = ReadItem(reader);
            decimal local = FromMilliunits(reader.GetInt64(15));
            decimal central = FromMilliunits(reader.GetInt64(16));
            result.Add(new LocalInventoryStock(item, local, central, reader.GetInt32(17)));
        }
        return result;
    }

    public async Task<LocalInventoryFreshness> GetFreshnessAsync(
        Guid stationId,
        CancellationToken cancellationToken = default)
    {
        await using SqliteConnection connection = await connectionFactory.OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            SELECT pull.updated_at_utc, pull.local_received_at_utc,
                   COALESCE(runtime.network_state, 'UNKNOWN'),
                   (SELECT COUNT(*) FROM outbox_messages
                    WHERE station_id = $stationId
                      AND operation_type IN ('INVENTORY_MOVEMENT_RECORDED', 'INVENTORY_REVIEW_RECORDED')
                      AND state <> 'SYNCED')
            FROM (SELECT 1 AS singleton_id) AS seed
            LEFT JOIN sync_pull_state AS pull ON pull.singleton_id = seed.singleton_id
            LEFT JOIN sync_runtime_status AS runtime ON runtime.singleton_id = seed.singleton_id;
            """;
        command.Parameters.AddWithValue("$stationId", stationId.ToString("D"));
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        await reader.ReadAsync(cancellationToken).ConfigureAwait(false);
        return new LocalInventoryFreshness(
            reader.IsDBNull(0) ? null : SqliteLocalStorageConverters.ReadTimestamp(reader.GetString(0)),
            reader.IsDBNull(1) ? null : SqliteLocalStorageConverters.ReadTimestamp(reader.GetString(1)),
            reader.GetString(2),
            reader.GetInt32(3));
    }

    public async Task<LocalInventoryMovementRegistration> RecordMovementAsync(
        RecordLocalInventoryMovement mutation,
        CancellationToken cancellationToken = default)
    {
        await using SqliteConnection connection = await connectionFactory.OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        using SqliteTransaction transaction = connection.BeginTransaction(deferred: false);
        (long Sequence, long Delta)? existing = await FindMovementAsync(
            connection, transaction, mutation.ClientMovementId, cancellationToken).ConfigureAwait(false);
        if (existing is not null)
        {
            decimal balance = await BalanceAsync(connection, transaction, mutation.OrganizationId,
                mutation.PlantId, mutation.InventoryItemId, cancellationToken).ConfigureAwait(false);
            transaction.Commit();
            return new(mutation.ClientMovementId, existing.Value.Sequence,
                FromMilliunits(existing.Value.Delta), balance, true);
        }

        InventoryItem item = await RequireItemAsync(connection, transaction, mutation.OrganizationId,
            mutation.PlantId, mutation.InventoryItemId, cancellationToken).ConfigureAwait(false);
        ValidateMovement(mutation, item);
        long sequence = await NextSequenceAsync(connection, transaction, mutation.StationId, cancellationToken)
            .ConfigureAwait(false);
        decimal delta = SignedQuantity(mutation.MovementType, mutation.Quantity);
        long deltaMilliunits = ToMilliunits(delta);
        await InsertMovementAsync(connection, transaction, mutation, item, sequence, deltaMilliunits,
            cancellationToken).ConfigureAwait(false);
        await InsertMovementOutboxAsync(connection, transaction, mutation, item, sequence, delta,
            cancellationToken).ConfigureAwait(false);
        await AdvanceSequenceAsync(connection, transaction, mutation.StationId, sequence + 1,
            mutation.RecordedAt, cancellationToken).ConfigureAwait(false);
        decimal localBalance = await BalanceAsync(connection, transaction, mutation.OrganizationId,
            mutation.PlantId, mutation.InventoryItemId, cancellationToken).ConfigureAwait(false);
        transaction.Commit();
        return new(mutation.ClientMovementId, sequence, delta, localBalance, false);
    }

    public async Task<LocalInventoryReviewRegistration> RecordReviewAsync(
        RecordLocalInventoryReview mutation,
        CancellationToken cancellationToken = default)
    {
        await using SqliteConnection connection = await connectionFactory.OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        using SqliteTransaction transaction = connection.BeginTransaction(deferred: false);
        LocalInventoryReviewRegistration? existing = await FindReviewAsync(
            connection, transaction, mutation.ReviewId, cancellationToken).ConfigureAwait(false);
        if (existing is not null)
        {
            transaction.Commit();
            return existing with { WasDuplicate = true };
        }

        InventoryItem item = await RequireItemAsync(connection, transaction, mutation.OrganizationId,
            mutation.PlantId, mutation.InventoryItemId, cancellationToken).ConfigureAwait(false);
        item.Unit.EnsureValidQuantity(mutation.CountedQuantity, nameof(mutation.CountedQuantity), true);
        if (mutation.CountedQuantity < 0m)
            throw new ArgumentOutOfRangeException(nameof(mutation), "El conteo no puede ser negativo.");
        decimal expected = await BalanceAsync(connection, transaction, mutation.OrganizationId,
            mutation.PlantId, mutation.InventoryItemId, cancellationToken).ConfigureAwait(false);
        InventoryReview review = InventoryReview.Create(mutation.ReviewId, mutation.OrganizationId,
            mutation.PlantId, mutation.ReviewedByProfileId, mutation.ReviewedAt,
            [InventoryReviewLine.Create(item, expected, mutation.CountedQuantity)], mutation.Notes);
        long sequence = await NextSequenceAsync(connection, transaction, mutation.StationId, cancellationToken)
            .ConfigureAwait(false);
        await InsertReviewAsync(connection, transaction, mutation, item, review, sequence, cancellationToken)
            .ConfigureAwait(false);
        await InsertReviewOutboxAsync(connection, transaction, mutation, item, review, sequence,
            cancellationToken).ConfigureAwait(false);
        await AdvanceSequenceAsync(connection, transaction, mutation.StationId, sequence + 1,
            mutation.RecordedAt, cancellationToken).ConfigureAwait(false);
        transaction.Commit();
        InventoryReviewLine line = review.Lines[0];
        return new(review.Id, sequence, review.Status, line.ExpectedQuantity,
            line.CountedQuantity, line.Difference, false);
    }

    private static async Task<InventoryItem> RequireItemAsync(
        SqliteConnection connection, SqliteTransaction transaction, Guid organizationId,
        Guid plantId, Guid itemId, CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT item.id, item.organization_id, item.plant_id, item.name, item.is_active,
                   type.id, type.code, type.name, type.is_custom, type.is_active,
                   unit.id, unit.code, unit.name, unit.decimal_places, unit.is_custom
            FROM inventory_items AS item
            JOIN inventory_item_types AS type
              ON type.organization_id = item.organization_id AND type.id = item.item_type_id
            JOIN inventory_units AS unit
              ON unit.organization_id = item.organization_id AND unit.id = item.unit_id
            WHERE item.organization_id = $organizationId AND item.plant_id = $plantId
              AND item.id = $itemId AND item.is_active = 1
              AND type.is_active = 1 AND unit.is_active = 1;
            """;
        command.Parameters.AddWithValue("$organizationId", organizationId.ToString("D"));
        command.Parameters.AddWithValue("$plantId", plantId.ToString("D"));
        command.Parameters.AddWithValue("$itemId", itemId.ToString("D"));
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        if (!await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
            throw new InvalidOperationException("El artículo no está activo en el catálogo local.");
        return ReadItem(reader);
    }

    private static InventoryItem ReadItem(SqliteDataReader reader)
    {
        InventoryItemType type = InventoryItemType.Create(Guid.Parse(reader.GetString(5)),
            reader.GetString(6), reader.GetString(7), reader.GetInt32(8) == 1, reader.GetInt32(9) == 1);
        InventoryUnit unit = InventoryUnit.Create(Guid.Parse(reader.GetString(10)), reader.GetString(11),
            reader.GetString(12), reader.GetInt32(13), reader.GetInt32(14) == 1);
        return InventoryItem.Create(Guid.Parse(reader.GetString(0)), Guid.Parse(reader.GetString(1)),
            Guid.Parse(reader.GetString(2)), type, unit, reader.GetString(3), reader.GetInt32(4) == 1);
    }

    private static void ValidateMovement(RecordLocalInventoryMovement mutation, InventoryItem item)
    {
        decimal delta = SignedQuantity(mutation.MovementType, mutation.Quantity);
        item.Unit.EnsureValidQuantity(delta, nameof(mutation.Quantity));
        if (mutation.MovementType == InventoryMovementType.Entry && mutation.ResponsibleWorkerId is not null)
            throw new ArgumentException("Una entrada no asigna trabajador responsable.", nameof(mutation));
        if (mutation.MovementType is InventoryMovementType.Adjustment or InventoryMovementType.Reversal &&
            string.IsNullOrWhiteSpace(mutation.Reason))
            throw new ArgumentException("El ajuste o reverso requiere motivo.", nameof(mutation));
        if (mutation.MovementType == InventoryMovementType.Reversal && mutation.RelatedMovementId is null)
            throw new ArgumentException("El reverso requiere el movimiento original.", nameof(mutation));
    }

    private static decimal SignedQuantity(InventoryMovementType type, decimal quantity) => type switch
    {
        InventoryMovementType.Exit or InventoryMovementType.Consumption => -Math.Abs(quantity),
        InventoryMovementType.Adjustment => quantity,
        _ => Math.Abs(quantity),
    };

    private static async Task InsertMovementAsync(SqliteConnection connection, SqliteTransaction transaction,
        RecordLocalInventoryMovement mutation, InventoryItem item, long sequence, long delta,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            INSERT INTO inventory_movements(client_movement_id, organization_id, plant_id,
                inventory_item_id, unit_id, movement_type, quantity_delta_milliunits,
                actor_profile_id, station_id, client_sequence, responsible_worker_id,
                occurred_at_utc, recorded_at_utc, reason, destination, notes, related_movement_id)
            VALUES ($id, $organizationId, $plantId, $itemId, $unitId, $type, $delta,
                $actorId, $stationId, $sequence, $workerId, $occurredAt, $recordedAt,
                $reason, $destination, $notes, $relatedId);
            """;
        command.Parameters.AddWithValue("$id", mutation.ClientMovementId.ToString("D"));
        command.Parameters.AddWithValue("$organizationId", mutation.OrganizationId.ToString("D"));
        command.Parameters.AddWithValue("$plantId", mutation.PlantId.ToString("D"));
        command.Parameters.AddWithValue("$itemId", item.Id.ToString("D"));
        command.Parameters.AddWithValue("$unitId", item.Unit.Id.ToString("D"));
        command.Parameters.AddWithValue("$type", ToStorage(mutation.MovementType));
        command.Parameters.AddWithValue("$delta", delta);
        command.Parameters.AddWithValue("$actorId", mutation.ActorProfileId.ToString("D"));
        command.Parameters.AddWithValue("$stationId", mutation.StationId.ToString("D"));
        command.Parameters.AddWithValue("$sequence", sequence);
        AddOptional(command, "$workerId", mutation.ResponsibleWorkerId?.ToString("D"));
        command.Parameters.AddWithValue("$occurredAt", SqliteLocalStorageConverters.Timestamp(mutation.OccurredAt));
        command.Parameters.AddWithValue("$recordedAt", SqliteLocalStorageConverters.Timestamp(mutation.RecordedAt));
        AddOptional(command, "$reason", mutation.Reason?.Trim());
        AddOptional(command, "$destination", mutation.Destination?.Trim());
        AddOptional(command, "$notes", mutation.Notes?.Trim());
        AddOptional(command, "$relatedId", mutation.RelatedMovementId?.ToString("D"));
        await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    private static async Task InsertMovementOutboxAsync(SqliteConnection connection,
        SqliteTransaction transaction, RecordLocalInventoryMovement mutation, InventoryItem item,
        long sequence, decimal delta, CancellationToken cancellationToken)
    {
        var payload = new InventoryMovementOutboxPayload(1, mutation.ClientMovementId,
            mutation.OrganizationId, mutation.PlantId, mutation.StationId, sequence,
            item.Id, item.Unit.Id, ToStorage(mutation.MovementType), delta, mutation.ActorProfileId,
            mutation.ResponsibleWorkerId, mutation.OccurredAt.ToUniversalTime(),
            mutation.RecordedAt.ToUniversalTime(), mutation.Reason?.Trim(), mutation.Destination?.Trim(),
            mutation.Notes?.Trim(), mutation.RelatedMovementId);
        string json = JsonSerializer.Serialize(payload,
            LocalStorageJsonSerializerContext.Default.InventoryMovementOutboxPayload);
        await InsertOutboxAsync(connection, transaction, Guid.NewGuid(), mutation.StationId, sequence,
            "INVENTORY_MOVEMENT_RECORDED", "inventory_movement", mutation.ClientMovementId,
            json, mutation.RecordedAt, mutation.Authorization, cancellationToken).ConfigureAwait(false);
    }

    private static async Task InsertReviewAsync(SqliteConnection connection, SqliteTransaction transaction,
        RecordLocalInventoryReview mutation, InventoryItem item, InventoryReview review, long sequence,
        CancellationToken cancellationToken)
    {
        InventoryReviewLine line = review.Lines[0];
        await using SqliteCommand header = connection.CreateCommand();
        header.Transaction = transaction;
        header.CommandText = """
            INSERT INTO inventory_reviews(id, organization_id, plant_id, status,
                reviewed_by_profile_id, station_id, client_sequence, reviewed_at_utc,
                recorded_at_utc, notes)
            VALUES ($id, $organizationId, $plantId, $status, $actorId, $stationId,
                $sequence, $reviewedAt, $recordedAt, $notes);
            """;
        header.Parameters.AddWithValue("$id", review.Id.ToString("D"));
        header.Parameters.AddWithValue("$organizationId", review.OrganizationId.ToString("D"));
        header.Parameters.AddWithValue("$plantId", review.PlantId.ToString("D"));
        header.Parameters.AddWithValue("$status", ToStorage(review.Status));
        header.Parameters.AddWithValue("$actorId", review.ReviewedByProfileId.ToString("D"));
        header.Parameters.AddWithValue("$stationId", mutation.StationId.ToString("D"));
        header.Parameters.AddWithValue("$sequence", sequence);
        header.Parameters.AddWithValue("$reviewedAt", SqliteLocalStorageConverters.Timestamp(review.ReviewedAt));
        header.Parameters.AddWithValue("$recordedAt", SqliteLocalStorageConverters.Timestamp(mutation.RecordedAt));
        AddOptional(header, "$notes", review.Notes);
        await header.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);

        await using SqliteCommand detail = connection.CreateCommand();
        detail.Transaction = transaction;
        detail.CommandText = """
            INSERT INTO inventory_review_lines(organization_id, plant_id, review_id,
                inventory_item_id, unit_id, expected_milliunits, counted_milliunits,
                difference_milliunits)
            VALUES ($organizationId, $plantId, $reviewId, $itemId, $unitId,
                $expected, $counted, $difference);
            """;
        detail.Parameters.AddWithValue("$organizationId", review.OrganizationId.ToString("D"));
        detail.Parameters.AddWithValue("$plantId", review.PlantId.ToString("D"));
        detail.Parameters.AddWithValue("$reviewId", review.Id.ToString("D"));
        detail.Parameters.AddWithValue("$itemId", item.Id.ToString("D"));
        detail.Parameters.AddWithValue("$unitId", item.Unit.Id.ToString("D"));
        detail.Parameters.AddWithValue("$expected", ToMilliunits(line.ExpectedQuantity));
        detail.Parameters.AddWithValue("$counted", ToMilliunits(line.CountedQuantity));
        detail.Parameters.AddWithValue("$difference", ToMilliunits(line.Difference));
        await detail.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    private static async Task InsertReviewOutboxAsync(SqliteConnection connection,
        SqliteTransaction transaction, RecordLocalInventoryReview mutation, InventoryItem item,
        InventoryReview review, long sequence, CancellationToken cancellationToken)
    {
        InventoryReviewLine line = review.Lines[0];
        var payload = new InventoryReviewOutboxPayload(1, review.Id, review.OrganizationId,
            review.PlantId, mutation.StationId, sequence, ToStorage(review.Status),
            review.ReviewedByProfileId, review.ReviewedAt, mutation.RecordedAt.ToUniversalTime(),
            review.Notes, [new(item.Id, item.Unit.Id, line.ExpectedQuantity,
                line.CountedQuantity, line.Difference)]);
        string json = JsonSerializer.Serialize(payload,
            LocalStorageJsonSerializerContext.Default.InventoryReviewOutboxPayload);
        await InsertOutboxAsync(connection, transaction, Guid.NewGuid(), mutation.StationId, sequence,
            "INVENTORY_REVIEW_RECORDED", "inventory_review", review.Id, json,
            mutation.RecordedAt, mutation.Authorization, cancellationToken).ConfigureAwait(false);
    }

    private static async Task InsertOutboxAsync(SqliteConnection connection, SqliteTransaction transaction,
        Guid outboxId, Guid stationId, long sequence, string operationType, string aggregateType,
        Guid aggregateId, string payload, DateTimeOffset createdAt,
        OutboxAuthorizationEvidence? authorization, CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            INSERT INTO outbox_messages(id, station_id, station_sequence, operation_type,
                aggregate_type, aggregate_id, payload_json, actor_profile_id, permission_version,
                authorization_validated_at_utc, authorization_offline_until_utc,
                authorization_state, state, attempt_count, created_at_utc, updated_at_utc)
            VALUES ($id, $stationId, $sequence, $operationType, $aggregateType, $aggregateId,
                $payload, $actorProfileId, $permissionVersion, $authorizationValidatedAt,
                $authorizationOfflineUntil, $authorizationState, 'PENDING', 0, $createdAt, $createdAt);
            """;
        command.Parameters.AddWithValue("$id", outboxId.ToString("D"));
        command.Parameters.AddWithValue("$stationId", stationId.ToString("D"));
        command.Parameters.AddWithValue("$sequence", sequence);
        command.Parameters.AddWithValue("$operationType", operationType);
        command.Parameters.AddWithValue("$aggregateType", aggregateType);
        command.Parameters.AddWithValue("$aggregateId", aggregateId.ToString("D"));
        command.Parameters.AddWithValue("$payload", payload);
        command.Parameters.AddWithValue("$createdAt", SqliteLocalStorageConverters.Timestamp(createdAt));
        SqliteLocalStorageConverters.AddAuthorizationParameters(command, authorization);
        await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    private static async Task<long> NextSequenceAsync(SqliteConnection connection,
        SqliteTransaction transaction, Guid stationId, CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT MAX(
                COALESCE((SELECT MAX(station_sequence) + 1 FROM outbox_messages
                          WHERE station_id = $stationId), 1),
                COALESCE((SELECT next_sequence FROM station_sequence_state
                          WHERE station_id = $stationId), 1));
            """;
        command.Parameters.AddWithValue("$stationId", stationId.ToString("D"));
        return Convert.ToInt64(await command.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false),
            CultureInfo.InvariantCulture);
    }

    private static async Task AdvanceSequenceAsync(SqliteConnection connection,
        SqliteTransaction transaction, Guid stationId, long nextSequence, DateTimeOffset updatedAt,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            INSERT INTO station_sequence_state(station_id, next_sequence, updated_at_utc)
            VALUES ($stationId, $nextSequence, $updatedAt)
            ON CONFLICT(station_id) DO UPDATE SET
                next_sequence = MAX(station_sequence_state.next_sequence, excluded.next_sequence),
                updated_at_utc = excluded.updated_at_utc;
            """;
        command.Parameters.AddWithValue("$stationId", stationId.ToString("D"));
        command.Parameters.AddWithValue("$nextSequence", nextSequence);
        command.Parameters.AddWithValue("$updatedAt", SqliteLocalStorageConverters.Timestamp(updatedAt));
        await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    private static async Task<decimal> BalanceAsync(SqliteConnection connection,
        SqliteTransaction transaction, Guid organizationId, Guid plantId, Guid itemId,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT COALESCE(SUM(quantity_delta_milliunits), 0)
            FROM inventory_movements
            WHERE organization_id = $organizationId AND plant_id = $plantId
              AND inventory_item_id = $itemId;
            """;
        command.Parameters.AddWithValue("$organizationId", organizationId.ToString("D"));
        command.Parameters.AddWithValue("$plantId", plantId.ToString("D"));
        command.Parameters.AddWithValue("$itemId", itemId.ToString("D"));
        return FromMilliunits(Convert.ToInt64(
            await command.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false),
            CultureInfo.InvariantCulture));
    }

    private static async Task<(long Sequence, long Delta)?> FindMovementAsync(
        SqliteConnection connection, SqliteTransaction transaction, Guid id,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT client_sequence, quantity_delta_milliunits FROM inventory_movements
            WHERE client_movement_id = $id;
            """;
        command.Parameters.AddWithValue("$id", id.ToString("D"));
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        return await reader.ReadAsync(cancellationToken).ConfigureAwait(false)
            ? (reader.GetInt64(0), reader.GetInt64(1))
            : null;
    }

    private static async Task<LocalInventoryReviewRegistration?> FindReviewAsync(
        SqliteConnection connection, SqliteTransaction transaction, Guid id,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT review.client_sequence, review.status, line.expected_milliunits,
                   line.counted_milliunits, line.difference_milliunits
            FROM inventory_reviews AS review
            JOIN inventory_review_lines AS line ON line.review_id = review.id
            WHERE review.id = $id LIMIT 1;
            """;
        command.Parameters.AddWithValue("$id", id.ToString("D"));
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        if (!await reader.ReadAsync(cancellationToken).ConfigureAwait(false)) return null;
        return new(id, reader.GetInt64(0), FromReviewStorage(reader.GetString(1)),
            FromMilliunits(reader.GetInt64(2)), FromMilliunits(reader.GetInt64(3)),
            FromMilliunits(reader.GetInt64(4)), true);
    }

    private static void AddOptional(SqliteCommand command, string name, string? value) =>
        command.Parameters.AddWithValue(name, string.IsNullOrWhiteSpace(value) ? DBNull.Value : value);

    private static long ToMilliunits(decimal value) => checked((long)(value * 1000m));
    private static decimal FromMilliunits(long value) => value / 1000m;

    private static string ToStorage(InventoryMovementType type) => type switch
    {
        InventoryMovementType.Entry => "ENTRY",
        InventoryMovementType.Exit => "EXIT",
        InventoryMovementType.Consumption => "CONSUMPTION",
        InventoryMovementType.Return => "RETURN",
        InventoryMovementType.Adjustment => "ADJUSTMENT",
        InventoryMovementType.Reversal => "REVERSAL",
        _ => throw new ArgumentOutOfRangeException(nameof(type)),
    };

    private static string ToStorage(InventoryReviewStatus status) => status switch
    {
        InventoryReviewStatus.WithoutDifferences => "WITHOUT_DIFFERENCES",
        InventoryReviewStatus.WithDifferences => "WITH_DIFFERENCES",
        _ => throw new ArgumentOutOfRangeException(nameof(status)),
    };

    private static InventoryReviewStatus FromReviewStorage(string status) => status switch
    {
        "WITHOUT_DIFFERENCES" => InventoryReviewStatus.WithoutDifferences,
        "WITH_DIFFERENCES" => InventoryReviewStatus.WithDifferences,
        _ => throw new InvalidOperationException($"Estado de revisión desconocido: {status}."),
    };
}
