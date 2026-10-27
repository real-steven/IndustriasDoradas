using System.Globalization;
using System.Text.Json;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain.Inventory;
using Microsoft.Data.Sqlite;

namespace IndustriasDoradas.Desktop.Infrastructure.LocalStorage;

public sealed class SqliteInventoryMaintenanceRepository(
    ILocalSqliteConnectionFactory connectionFactory) : ILocalInventoryMaintenanceRepository
{
    public async Task<IReadOnlyList<LocalRastra>> ListRastrasAsync(
        Guid organizationId,
        Guid plantId,
        CancellationToken cancellationToken = default)
    {
        await using SqliteConnection connection = await connectionFactory.OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            SELECT component.id, line.id, line.name, component.name
            FROM cached_line_components AS component
            JOIN cached_production_lines AS line ON line.id = component.line_id
            WHERE component.organization_id = $organizationId
              AND line.organization_id = $organizationId
              AND line.plant_id = $plantId
              AND component.component_type_code = 'RASTRA'
              AND component.is_active = 1 AND line.is_active = 1
            ORDER BY line.name, component.display_order, component.name;
            """;
        command.Parameters.AddWithValue("$organizationId", organizationId.ToString("D"));
        command.Parameters.AddWithValue("$plantId", plantId.ToString("D"));
        var result = new List<LocalRastra>();
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
            result.Add(new(Guid.Parse(reader.GetString(0)), Guid.Parse(reader.GetString(1)),
                reader.GetString(2), reader.GetString(3)));
        return result;
    }

    public async Task<IReadOnlyList<LocalRastraInstallation>> ListActiveInstallationsAsync(
        Guid organizationId,
        Guid plantId,
        Guid rastraId,
        CancellationToken cancellationToken = default)
    {
        await using SqliteConnection connection = await connectionFactory.OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            SELECT installed.installation_id, installed.rastra_id,
                   installed.inventory_item_id, item.name,
                   installed.component_identifier, installed.installed_condition,
                   installed.occurred_at_utc
            FROM rastra_component_changes AS installed
            JOIN inventory_items AS item ON item.id = installed.inventory_item_id
            WHERE installed.organization_id = $organizationId
              AND installed.plant_id = $plantId
              AND installed.rastra_id = $rastraId
              AND installed.change_type IN ('INSTALLATION', 'REPLACEMENT')
              AND NOT EXISTS (
                SELECT 1 FROM rastra_component_changes AS closure
                WHERE closure.organization_id = installed.organization_id
                  AND closure.rastra_id = installed.rastra_id
                  AND closure.change_type IN ('REMOVAL', 'REPLACEMENT')
                  AND CASE WHEN closure.change_type = 'REMOVAL'
                      THEN closure.installation_id
                      ELSE closure.replaced_installation_id END = installed.installation_id
              )
            ORDER BY installed.occurred_at_utc, installed.installation_id;
            """;
        command.Parameters.AddWithValue("$organizationId", organizationId.ToString("D"));
        command.Parameters.AddWithValue("$plantId", plantId.ToString("D"));
        command.Parameters.AddWithValue("$rastraId", rastraId.ToString("D"));
        var result = new List<LocalRastraInstallation>();
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
            result.Add(new(Guid.Parse(reader.GetString(0)), Guid.Parse(reader.GetString(1)),
                Guid.Parse(reader.GetString(2)), reader.GetString(3),
                reader.IsDBNull(4) ? null : reader.GetString(4), reader.GetString(5),
                SqliteLocalStorageConverters.ReadTimestamp(reader.GetString(6))));
        return result;
    }

    public async Task<IReadOnlyList<OperationalNoveltyCategory>> ListNoveltyCategoriesAsync(
        Guid organizationId,
        CancellationToken cancellationToken = default)
    {
        await using SqliteConnection connection = await connectionFactory.OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            SELECT id, code, name, is_active
            FROM operational_novelty_categories
            WHERE organization_id = $organizationId AND is_active = 1
            ORDER BY name, id;
            """;
        command.Parameters.AddWithValue("$organizationId", organizationId.ToString("D"));
        var result = new List<OperationalNoveltyCategory>();
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
            result.Add(OperationalNoveltyCategory.Create(Guid.Parse(reader.GetString(0)),
                reader.GetString(1), reader.GetString(2), reader.GetInt32(3) == 1));
        return result;
    }

    public async Task<IReadOnlyList<LocalOperationalNovelty>> ListNoveltiesAsync(
        Guid organizationId,
        Guid plantId,
        CancellationToken cancellationToken = default)
    {
        await using SqliteConnection connection = await connectionFactory.OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            SELECT opening.novelty_id, opening.line_id, line.name,
                   opening.category_id, category.name, opening.description,
                   opening.occurred_at_utc, closure.occurred_at_utc
            FROM operational_novelty_changes AS opening
            LEFT JOIN operational_novelty_changes AS closure
              ON closure.organization_id = opening.organization_id
             AND closure.novelty_id = opening.novelty_id
             AND closure.change_type = 'CLOSURE'
            LEFT JOIN cached_production_lines AS line ON line.id = opening.line_id
            LEFT JOIN operational_novelty_categories AS category
              ON category.organization_id = opening.organization_id
             AND category.id = opening.category_id
            WHERE opening.organization_id = $organizationId
              AND opening.plant_id = $plantId AND opening.change_type = 'OPENING'
            ORDER BY opening.occurred_at_utc DESC, opening.novelty_id DESC;
            """;
        command.Parameters.AddWithValue("$organizationId", organizationId.ToString("D"));
        command.Parameters.AddWithValue("$plantId", plantId.ToString("D"));
        var result = new List<LocalOperationalNovelty>();
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
            result.Add(new(Guid.Parse(reader.GetString(0)),
                reader.IsDBNull(1) ? null : Guid.Parse(reader.GetString(1)),
                reader.IsDBNull(2) ? null : reader.GetString(2),
                reader.IsDBNull(3) ? null : Guid.Parse(reader.GetString(3)),
                reader.IsDBNull(4) ? null : reader.GetString(4), reader.GetString(5),
                SqliteLocalStorageConverters.ReadTimestamp(reader.GetString(6)),
                reader.IsDBNull(7) ? null : SqliteLocalStorageConverters.ReadTimestamp(reader.GetString(7))));
        return result;
    }

    public async Task<LocalMaintenanceRegistration> RecordComponentChangeAsync(
        RecordLocalRastraComponentChange mutation,
        CancellationToken cancellationToken = default)
    {
        await using SqliteConnection connection = await connectionFactory.OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        using SqliteTransaction transaction = connection.BeginTransaction(deferred: false);
        long? existing = await FindSequenceAsync(connection, transaction, "rastra_component_changes",
            "client_change_id", mutation.ClientChangeId, cancellationToken).ConfigureAwait(false);
        if (existing.HasValue)
        {
            transaction.Commit();
            return new(mutation.ClientChangeId, existing.Value, true);
        }

        long sequence = await NextSequenceAsync(connection, transaction, mutation.StationId, cancellationToken)
            .ConfigureAwait(false);
        InventoryItem? item = mutation.InventoryItemId.HasValue
            ? await RequireItemAsync(connection, transaction, mutation.OrganizationId, mutation.PlantId,
                mutation.InventoryItemId.Value, cancellationToken).ConfigureAwait(false)
            : null;
        PlantRecordContext context = PlantRecordContext.ForStation(mutation.OrganizationId,
            mutation.PlantId, mutation.StationId, sequence, mutation.ActorProfileId,
            mutation.ResponsibleWorkerId);
        RastraComponentChange change = mutation.ChangeType switch
        {
            RastraComponentChangeType.Installation when item is not null && mutation.Quantity.HasValue =>
                RastraComponentChange.Install(mutation.ClientChangeId, mutation.InstallationId, context,
                    mutation.RastraId, item, mutation.Quantity.Value, mutation.OccurredAt,
                    mutation.RecordedAt, mutation.InstalledCondition ?? string.Empty,
                    mutation.ComponentIdentifier, mutation.InstallationNotes),
            RastraComponentChangeType.Removal =>
                RastraComponentChange.Remove(mutation.ClientChangeId, mutation.InstallationId, context,
                    mutation.RastraId, mutation.OccurredAt, mutation.RecordedAt,
                    mutation.RemovedCondition ?? string.Empty, mutation.Reason ?? string.Empty,
                    mutation.RemovalNotes),
            RastraComponentChangeType.Replacement when item is not null && mutation.Quantity.HasValue &&
                mutation.ReplacedInstallationId.HasValue =>
                RastraComponentChange.Replace(mutation.ClientChangeId, mutation.InstallationId,
                    mutation.ReplacedInstallationId.Value, context, mutation.RastraId, item,
                    mutation.Quantity.Value, mutation.OccurredAt, mutation.RecordedAt,
                    mutation.RemovedCondition ?? string.Empty, mutation.InstalledCondition ?? string.Empty,
                    mutation.Reason ?? string.Empty, mutation.ComponentIdentifier,
                    mutation.RemovalNotes, mutation.InstallationNotes),
            _ => throw new ArgumentException("Los datos no corresponden al cambio de componente.", nameof(mutation)),
        };
        await InsertComponentAsync(connection, transaction, change, item, cancellationToken).ConfigureAwait(false);
        await InsertComponentOutboxAsync(connection, transaction, mutation, change, item, sequence,
            cancellationToken).ConfigureAwait(false);
        await AdvanceSequenceAsync(connection, transaction, mutation.StationId, sequence + 1,
            mutation.RecordedAt, cancellationToken).ConfigureAwait(false);
        transaction.Commit();
        return new(mutation.ClientChangeId, sequence, false);
    }

    public async Task<LocalMaintenanceRegistration> RecordNoveltyChangeAsync(
        RecordLocalOperationalNoveltyChange mutation,
        CancellationToken cancellationToken = default)
    {
        await using SqliteConnection connection = await connectionFactory.OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        using SqliteTransaction transaction = connection.BeginTransaction(deferred: false);
        long? existing = await FindSequenceAsync(connection, transaction, "operational_novelty_changes",
            "client_change_id", mutation.ClientChangeId, cancellationToken).ConfigureAwait(false);
        if (existing.HasValue)
        {
            transaction.Commit();
            return new(mutation.ClientChangeId, existing.Value, true);
        }

        long sequence = await NextSequenceAsync(connection, transaction, mutation.StationId, cancellationToken)
            .ConfigureAwait(false);
        OperationalNoveltyCategory? category = mutation.CategoryId.HasValue
            ? await RequireCategoryAsync(connection, transaction, mutation.OrganizationId,
                mutation.CategoryId.Value, cancellationToken).ConfigureAwait(false)
            : null;
        PlantRecordContext context = PlantRecordContext.ForStation(mutation.OrganizationId,
            mutation.PlantId, mutation.StationId, sequence, mutation.ActorProfileId,
            mutation.ResponsibleWorkerId);
        OperationalNoveltyChange change = mutation.ChangeType == OperationalNoveltyChangeType.Opening
            ? OperationalNoveltyChange.Open(mutation.ClientChangeId, mutation.NoveltyId, context,
                mutation.OccurredAt, mutation.RecordedAt, mutation.Description ?? string.Empty,
                mutation.LineId, category)
            : OperationalNoveltyChange.Close(mutation.ClientChangeId, mutation.NoveltyId, context,
                mutation.OccurredAt, mutation.RecordedAt);
        await InsertNoveltyAsync(connection, transaction, change, cancellationToken).ConfigureAwait(false);
        await InsertNoveltyOutboxAsync(connection, transaction, mutation, change, sequence,
            cancellationToken).ConfigureAwait(false);
        await AdvanceSequenceAsync(connection, transaction, mutation.StationId, sequence + 1,
            mutation.RecordedAt, cancellationToken).ConfigureAwait(false);
        transaction.Commit();
        return new(mutation.ClientChangeId, sequence, false);
    }

    private static async Task InsertComponentAsync(SqliteConnection connection, SqliteTransaction transaction,
        RastraComponentChange change, InventoryItem? item, CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            INSERT INTO rastra_component_changes(
                client_change_id, organization_id, plant_id, rastra_id, change_type,
                installation_id, replaced_installation_id, inventory_item_id, unit_id,
                quantity_milliunits, actor_profile_id, station_id, client_sequence,
                responsible_worker_id, occurred_at_utc, recorded_at_utc,
                component_identifier, installed_condition, removed_condition, reason,
                installation_notes, removal_notes)
            VALUES ($id, $organizationId, $plantId, $rastraId, $type,
                $installationId, $replacedId, $itemId, $unitId, $quantity,
                $actorId, $stationId, $sequence, $workerId, $occurredAt, $recordedAt,
                $identifier, $installedCondition, $removedCondition, $reason,
                $installationNotes, $removalNotes);
            """;
        command.Parameters.AddWithValue("$id", change.ClientChangeId.ToString("D"));
        command.Parameters.AddWithValue("$organizationId", change.Context.OrganizationId.ToString("D"));
        command.Parameters.AddWithValue("$plantId", change.Context.PlantId.ToString("D"));
        command.Parameters.AddWithValue("$rastraId", change.RastraId.ToString("D"));
        command.Parameters.AddWithValue("$type", ComponentType(change.Type));
        command.Parameters.AddWithValue("$installationId", change.InstallationId.ToString("D"));
        AddOptional(command, "$replacedId", change.ReplacedInstallationId?.ToString("D"));
        AddOptional(command, "$itemId", change.InventoryItemId?.ToString("D"));
        AddOptional(command, "$unitId", item?.Unit.Id.ToString("D"));
        command.Parameters.AddWithValue("$quantity", change.Quantity.HasValue
            ? checked((long)(change.Quantity.Value * 1000m)) : DBNull.Value);
        command.Parameters.AddWithValue("$actorId", change.Context.ActorProfileId.ToString("D"));
        AddOptional(command, "$stationId", change.Context.StationId?.ToString("D"));
        command.Parameters.AddWithValue("$sequence", change.Context.ClientSequence ?? (object)DBNull.Value);
        AddOptional(command, "$workerId", change.Context.ResponsibleWorkerId?.ToString("D"));
        command.Parameters.AddWithValue("$occurredAt", SqliteLocalStorageConverters.Timestamp(change.OccurredAt));
        command.Parameters.AddWithValue("$recordedAt", SqliteLocalStorageConverters.Timestamp(change.RecordedAt));
        AddOptional(command, "$identifier", change.ComponentIdentifier);
        AddOptional(command, "$installedCondition", change.InstalledCondition);
        AddOptional(command, "$removedCondition", change.RemovedCondition);
        AddOptional(command, "$reason", change.Reason);
        AddOptional(command, "$installationNotes", change.InstallationNotes);
        AddOptional(command, "$removalNotes", change.RemovalNotes);
        await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    private static async Task InsertNoveltyAsync(SqliteConnection connection, SqliteTransaction transaction,
        OperationalNoveltyChange change, CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            INSERT INTO operational_novelty_changes(
                client_change_id, novelty_id, organization_id, plant_id, change_type,
                line_id, category_id, description, actor_profile_id, station_id,
                client_sequence, responsible_worker_id, occurred_at_utc, recorded_at_utc)
            VALUES ($id, $noveltyId, $organizationId, $plantId, $type,
                $lineId, $categoryId, $description, $actorId, $stationId,
                $sequence, $workerId, $occurredAt, $recordedAt);
            """;
        command.Parameters.AddWithValue("$id", change.ClientChangeId.ToString("D"));
        command.Parameters.AddWithValue("$noveltyId", change.NoveltyId.ToString("D"));
        command.Parameters.AddWithValue("$organizationId", change.Context.OrganizationId.ToString("D"));
        command.Parameters.AddWithValue("$plantId", change.Context.PlantId.ToString("D"));
        command.Parameters.AddWithValue("$type", change.Type == OperationalNoveltyChangeType.Opening
            ? "OPENING" : "CLOSURE");
        AddOptional(command, "$lineId", change.LineId?.ToString("D"));
        AddOptional(command, "$categoryId", change.CategoryId?.ToString("D"));
        AddOptional(command, "$description", change.Description);
        command.Parameters.AddWithValue("$actorId", change.Context.ActorProfileId.ToString("D"));
        AddOptional(command, "$stationId", change.Context.StationId?.ToString("D"));
        command.Parameters.AddWithValue("$sequence", change.Context.ClientSequence ?? (object)DBNull.Value);
        AddOptional(command, "$workerId", change.Context.ResponsibleWorkerId?.ToString("D"));
        command.Parameters.AddWithValue("$occurredAt", SqliteLocalStorageConverters.Timestamp(change.OccurredAt));
        command.Parameters.AddWithValue("$recordedAt", SqliteLocalStorageConverters.Timestamp(change.RecordedAt));
        await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    private static async Task InsertComponentOutboxAsync(SqliteConnection connection,
        SqliteTransaction transaction, RecordLocalRastraComponentChange mutation,
        RastraComponentChange change, InventoryItem? item, long sequence,
        CancellationToken cancellationToken)
    {
        var payload = new RastraComponentChangeOutboxPayload(1, change.ClientChangeId,
            mutation.OrganizationId, mutation.PlantId, mutation.StationId, sequence,
            mutation.LineId, mutation.RastraId, ComponentType(change.Type), change.InstallationId,
            change.ReplacedInstallationId, change.InventoryItemId, item?.Unit.Id, change.Quantity,
            mutation.ActorProfileId, mutation.ResponsibleWorkerId, change.OccurredAt, change.RecordedAt,
            change.ComponentIdentifier, change.InstalledCondition, change.RemovedCondition,
            change.Reason, change.InstallationNotes, change.RemovalNotes);
        string json = JsonSerializer.Serialize(payload,
            LocalStorageJsonSerializerContext.Default.RastraComponentChangeOutboxPayload);
        await InsertOutboxAsync(connection, transaction, mutation.ClientChangeId, mutation.StationId,
            sequence, "RASTRA_COMPONENT_CHANGE_RECORDED", "rastra_component_change", json,
            mutation.RecordedAt, mutation.Authorization, cancellationToken).ConfigureAwait(false);
    }

    private static async Task InsertNoveltyOutboxAsync(SqliteConnection connection,
        SqliteTransaction transaction, RecordLocalOperationalNoveltyChange mutation,
        OperationalNoveltyChange change, long sequence, CancellationToken cancellationToken)
    {
        var payload = new OperationalNoveltyChangeOutboxPayload(1, change.ClientChangeId,
            change.NoveltyId, mutation.OrganizationId, mutation.PlantId, mutation.StationId,
            sequence, change.LineId, change.CategoryId, change.Description, mutation.ActorProfileId,
            mutation.ResponsibleWorkerId, change.OccurredAt, change.RecordedAt);
        string json = JsonSerializer.Serialize(payload,
            LocalStorageJsonSerializerContext.Default.OperationalNoveltyChangeOutboxPayload);
        string operation = change.Type == OperationalNoveltyChangeType.Opening
            ? "OPERATIONAL_NOVELTY_OPENED" : "OPERATIONAL_NOVELTY_CLOSED";
        await InsertOutboxAsync(connection, transaction, mutation.ClientChangeId, mutation.StationId,
            sequence, operation, "operational_novelty_change", json, mutation.RecordedAt,
            mutation.Authorization, cancellationToken).ConfigureAwait(false);
    }

    private static async Task InsertOutboxAsync(SqliteConnection connection, SqliteTransaction transaction,
        Guid aggregateId, Guid stationId, long sequence, string operationType, string aggregateType,
        string payload, DateTimeOffset createdAt, OutboxAuthorizationEvidence? authorization,
        CancellationToken cancellationToken)
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
        command.Parameters.AddWithValue("$id", Guid.NewGuid().ToString("D"));
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

    private static async Task<InventoryItem> RequireItemAsync(SqliteConnection connection,
        SqliteTransaction transaction, Guid organizationId, Guid plantId, Guid itemId,
        CancellationToken cancellationToken)
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
        InventoryItemType type = InventoryItemType.Create(Guid.Parse(reader.GetString(5)),
            reader.GetString(6), reader.GetString(7), reader.GetInt32(8) == 1, reader.GetInt32(9) == 1);
        InventoryUnit unit = InventoryUnit.Create(Guid.Parse(reader.GetString(10)), reader.GetString(11),
            reader.GetString(12), reader.GetInt32(13), reader.GetInt32(14) == 1);
        return InventoryItem.Create(Guid.Parse(reader.GetString(0)), Guid.Parse(reader.GetString(1)),
            Guid.Parse(reader.GetString(2)), type, unit, reader.GetString(3), reader.GetInt32(4) == 1);
    }

    private static async Task<OperationalNoveltyCategory> RequireCategoryAsync(SqliteConnection connection,
        SqliteTransaction transaction, Guid organizationId, Guid categoryId,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT id, code, name, is_active FROM operational_novelty_categories
            WHERE organization_id = $organizationId AND id = $id AND is_active = 1;
            """;
        command.Parameters.AddWithValue("$organizationId", organizationId.ToString("D"));
        command.Parameters.AddWithValue("$id", categoryId.ToString("D"));
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        if (!await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
            throw new InvalidOperationException("La categoría de novedad no está activa localmente.");
        return OperationalNoveltyCategory.Create(Guid.Parse(reader.GetString(0)), reader.GetString(1),
            reader.GetString(2), reader.GetInt32(3) == 1);
    }

    private static async Task<long?> FindSequenceAsync(SqliteConnection connection,
        SqliteTransaction transaction, string table, string idColumn, Guid id,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = $"SELECT client_sequence FROM {table} WHERE {idColumn} = $id;";
        command.Parameters.AddWithValue("$id", id.ToString("D"));
        object? result = await command.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false);
        return result is null or DBNull ? null : Convert.ToInt64(result, CultureInfo.InvariantCulture);
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

    private static string ComponentType(RastraComponentChangeType type) => type switch
    {
        RastraComponentChangeType.Installation => "INSTALLATION",
        RastraComponentChangeType.Removal => "REMOVAL",
        RastraComponentChangeType.Replacement => "REPLACEMENT",
        _ => throw new ArgumentOutOfRangeException(nameof(type)),
    };

    private static void AddOptional(SqliteCommand command, string name, string? value) =>
        command.Parameters.AddWithValue(name, string.IsNullOrWhiteSpace(value) ? DBNull.Value : value);
}
