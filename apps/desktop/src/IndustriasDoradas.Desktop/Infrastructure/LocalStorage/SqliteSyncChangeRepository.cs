using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using IndustriasDoradas.Desktop.Application.Abstractions;
using Microsoft.Data.Sqlite;

namespace IndustriasDoradas.Desktop.Infrastructure.LocalStorage;

public sealed class SqliteSyncChangeRepository(ILocalSqliteConnectionFactory connectionFactory)
    : ILocalSyncChangeRepository
{
    public async Task<string?> GetCursorAsync(CancellationToken cancellationToken = default)
    {
        await using SqliteConnection connection = await connectionFactory.OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = "SELECT cursor FROM sync_pull_state WHERE singleton_id = 1;";
        object? value = await command.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false);
        return value is null or DBNull ? null : Convert.ToString(value, CultureInfo.InvariantCulture);
    }

    public async Task ApplyPageAsync(SyncPullPage page, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(page.NextCursor);
        await using SqliteConnection connection = await connectionFactory.OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        using SqliteTransaction transaction = connection.BeginTransaction();
        foreach (SyncChange change in page.Changes)
            await ApplyChangeAsync(connection, transaction, change, cancellationToken).ConfigureAwait(false);

        await using SqliteCommand cursor = connection.CreateCommand();
        cursor.Transaction = transaction;
        cursor.CommandText = """
            INSERT INTO sync_pull_state(singleton_id, cursor, updated_at_utc)
            VALUES (1, $cursor, $updatedAtUtc)
            ON CONFLICT(singleton_id) DO UPDATE SET
                cursor = excluded.cursor,
                updated_at_utc = excluded.updated_at_utc;
            """;
        cursor.Parameters.AddWithValue("$cursor", page.NextCursor);
        cursor.Parameters.AddWithValue("$updatedAtUtc", SqliteLocalStorageConverters.Timestamp(page.ServerTimeUtc));
        await cursor.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        transaction.Commit();
    }

    private static async Task ApplyChangeAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        SyncChange change,
        CancellationToken cancellationToken)
    {
        if (change.PayloadSchemaVersion != 1 || change.Payload.ValueKind != JsonValueKind.Object)
            throw new InvalidOperationException("El cambio remoto usa un esquema no compatible.");
        string payload = change.Payload.GetRawText();
        string hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(payload))).ToLowerInvariant();
        string? appliedHash = await ScalarAsync(
            connection, transaction,
            "SELECT payload_hash FROM sync_applied_changes WHERE change_id = $id;",
            ("$id", change.ChangeId.ToString("D")), cancellationToken).ConfigureAwait(false);
        if (appliedHash is not null)
        {
            if (!string.Equals(appliedHash, hash, StringComparison.Ordinal))
                await ReviewAsync(connection, transaction, change, "CHANGE_CONTENT_MISMATCH", cancellationToken)
                    .ConfigureAwait(false);
            return;
        }

        (long Version, string Hash)? current = await ReadEntityVersionAsync(
            connection, transaction, change, cancellationToken).ConfigureAwait(false);
        if (current is not null && change.EntityVersion <= current.Value.Version)
        {
            if (change.EntityVersion == current.Value.Version &&
                !string.Equals(current.Value.Hash, hash, StringComparison.Ordinal))
                await ReviewAsync(connection, transaction, change, "ENTITY_VERSION_MISMATCH", cancellationToken)
                    .ConfigureAwait(false);
            await MarkAppliedAsync(connection, transaction, change, hash, cancellationToken).ConfigureAwait(false);
            return;
        }

        await UpsertGenericAsync(connection, transaction, change, payload, hash, cancellationToken)
            .ConfigureAwait(false);
        await ApplyProjectionAsync(connection, transaction, change, cancellationToken).ConfigureAwait(false);
        await MarkAppliedAsync(connection, transaction, change, hash, cancellationToken).ConfigureAwait(false);
    }

    private static async Task ApplyProjectionAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        SyncChange change,
        CancellationToken cancellationToken)
    {
        JsonElement payload = change.Payload;
        switch (change.EntityType)
        {
            case "SUPPLIER":
                await ExecuteAsync(connection, transaction, """
                    INSERT INTO cached_suppliers(id, organization_id, name, is_active, updated_at_utc)
                    VALUES ($id, $organizationId, $name, $active, $updated)
                    ON CONFLICT(id) DO UPDATE SET organization_id=excluded.organization_id,
                        name=excluded.name, is_active=excluded.is_active, updated_at_utc=excluded.updated_at_utc;
                    """, cancellationToken,
                    ("$id", Text(payload, "id")), ("$organizationId", Text(payload, "organization_id")),
                    ("$name", Text(payload, "name")), ("$active", Bool(payload, "is_active") ? 1 : 0),
                    ("$updated", Timestamp(payload, "updated_at", change.ChangedAtUtc))).ConfigureAwait(false);
                break;
            case "WORKER":
                await ExecuteAsync(connection, transaction, """
                    INSERT INTO cached_workers(id, organization_id, name, is_active, updated_at_utc)
                    VALUES ($id, $organizationId, $name, $active, $updated)
                    ON CONFLICT(id) DO UPDATE SET organization_id=excluded.organization_id,
                        name=excluded.name, is_active=excluded.is_active, updated_at_utc=excluded.updated_at_utc;
                    """, cancellationToken,
                    ("$id", Text(payload, "id")), ("$organizationId", Text(payload, "organization_id")),
                    ("$name", Text(payload, "name")), ("$active", Bool(payload, "is_active") ? 1 : 0),
                    ("$updated", Timestamp(payload, "updated_at", change.ChangedAtUtc))).ConfigureAwait(false);
                break;
            case "PRODUCTION_LINE":
                await ExecuteAsync(connection, transaction, """
                    INSERT INTO cached_production_lines(id, organization_id, plant_id, name, is_active, updated_at_utc)
                    VALUES ($id, $organizationId, $plantId, $name, $active, $updated)
                    ON CONFLICT(id) DO UPDATE SET organization_id=excluded.organization_id,
                        plant_id=excluded.plant_id, name=excluded.name,
                        is_active=excluded.is_active, updated_at_utc=excluded.updated_at_utc;
                    """, cancellationToken,
                    ("$id", Text(payload, "id")), ("$organizationId", Text(payload, "organization_id")),
                    ("$plantId", Text(payload, "plant_id")), ("$name", Text(payload, "name")),
                    ("$active", Bool(payload, "is_active") ? 1 : 0),
                    ("$updated", Timestamp(payload, "updated_at", change.ChangedAtUtc))).ConfigureAwait(false);
                break;
            case "SHIPMENT":
                await ExecuteAsync(connection, transaction, """
                    INSERT INTO cached_shipments(id, organization_id, supplier_id, line_id, feed_cycle_id,
                        started_at_utc, completed_at_utc, status)
                    VALUES ($id, $organizationId, $supplierId, $lineId, $cycleId, $started, $completed, $status)
                    ON CONFLICT(id) DO UPDATE SET supplier_id=excluded.supplier_id,
                        line_id=excluded.line_id, feed_cycle_id=excluded.feed_cycle_id,
                        started_at_utc=excluded.started_at_utc, completed_at_utc=excluded.completed_at_utc,
                        status=excluded.status;
                    """, cancellationToken,
                    ("$id", Text(payload, "id")), ("$organizationId", Text(payload, "organization_id")),
                    ("$supplierId", Text(payload, "supplier_id")),
                    ("$lineId", Text(payload, "production_line_id")),
                    ("$cycleId", Text(payload, "feed_cycle_id")),
                    ("$started", Timestamp(payload, "started_at_utc", change.ChangedAtUtc)),
                    ("$completed", NullableText(payload, "completed_at_utc") ?? (object)DBNull.Value),
                    ("$status", Text(payload, "status"))).ConfigureAwait(false);
                break;
            case "RESPONSIBILITY_ASSIGNMENT":
                await ExecuteAsync(connection, transaction, """
                    INSERT INTO responsibility_assignments(
                        id, organization_id, line_id, shipment_id, feed_cycle_id, worker_id,
                        assigned_at_utc, unassigned_at_utc)
                    SELECT $id, shipment.organization_id, shipment.line_id, shipment.id,
                           shipment.feed_cycle_id, $workerId, $assigned, $unassigned
                    FROM cached_shipments shipment WHERE shipment.id = $shipmentId
                    ON CONFLICT(id) DO UPDATE SET worker_id=excluded.worker_id,
                        assigned_at_utc=excluded.assigned_at_utc,
                        unassigned_at_utc=excluded.unassigned_at_utc;
                    """, cancellationToken,
                    ("$id", Text(payload, "id")), ("$shipmentId", Text(payload, "shipment_id")),
                    ("$workerId", Text(payload, "worker_id")),
                    ("$assigned", Timestamp(payload, "started_at_utc", change.ChangedAtUtc)),
                    ("$unassigned", NullableText(payload, "ended_at_utc") ?? (object)DBNull.Value)).ConfigureAwait(false);
                break;
        }
    }

    private static async Task UpsertGenericAsync(SqliteConnection connection, SqliteTransaction transaction,
        SyncChange change, string payload, string hash, CancellationToken cancellationToken) =>
        await ExecuteAsync(connection, transaction, """
            INSERT INTO sync_entity_cache(entity_type, entity_id, entity_version, action,
                payload_json, payload_hash, changed_at_utc)
            VALUES ($type, $id, $version, $action, $payload, $hash, $changed)
            ON CONFLICT(entity_type, entity_id) DO UPDATE SET
                entity_version=excluded.entity_version, action=excluded.action,
                payload_json=excluded.payload_json, payload_hash=excluded.payload_hash,
                changed_at_utc=excluded.changed_at_utc;
            """, cancellationToken,
            ("$type", change.EntityType), ("$id", change.EntityId.ToString("D")),
            ("$version", change.EntityVersion), ("$action", change.Action), ("$payload", payload),
            ("$hash", hash), ("$changed", SqliteLocalStorageConverters.Timestamp(change.ChangedAtUtc)))
            .ConfigureAwait(false);

    private static async Task<(long Version, string Hash)?> ReadEntityVersionAsync(
        SqliteConnection connection, SqliteTransaction transaction, SyncChange change,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "SELECT entity_version, payload_hash FROM sync_entity_cache WHERE entity_type=$type AND entity_id=$id;";
        command.Parameters.AddWithValue("$type", change.EntityType);
        command.Parameters.AddWithValue("$id", change.EntityId.ToString("D"));
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);
        return await reader.ReadAsync(cancellationToken).ConfigureAwait(false)
            ? (reader.GetInt64(0), reader.GetString(1)) : null;
    }

    private static Task ReviewAsync(SqliteConnection connection, SqliteTransaction transaction,
        SyncChange change, string reason, CancellationToken cancellationToken) =>
        ExecuteAsync(connection, transaction, """
            INSERT INTO sync_pull_reviews(change_id, entity_type, entity_id, reason_code, detected_at_utc)
            VALUES ($changeId, $type, $entityId, $reason, $detected)
            ON CONFLICT(change_id) DO NOTHING;
            """, cancellationToken, ("$changeId", change.ChangeId.ToString("D")),
            ("$type", change.EntityType), ("$entityId", change.EntityId.ToString("D")),
            ("$reason", reason), ("$detected", SqliteLocalStorageConverters.Timestamp(DateTimeOffset.UtcNow)));

    private static Task MarkAppliedAsync(SqliteConnection connection, SqliteTransaction transaction,
        SyncChange change, string hash, CancellationToken cancellationToken) =>
        ExecuteAsync(connection, transaction, """
            INSERT INTO sync_applied_changes(change_id, entity_type, entity_id, entity_version, payload_hash, applied_at_utc)
            VALUES ($changeId, $type, $entityId, $version, $hash, $applied)
            ON CONFLICT(change_id) DO NOTHING;
            """, cancellationToken, ("$changeId", change.ChangeId.ToString("D")),
            ("$type", change.EntityType), ("$entityId", change.EntityId.ToString("D")),
            ("$version", change.EntityVersion), ("$hash", hash),
            ("$applied", SqliteLocalStorageConverters.Timestamp(DateTimeOffset.UtcNow)));

    private static async Task<string?> ScalarAsync(SqliteConnection connection, SqliteTransaction transaction,
        string sql, (string Name, object Value) parameter, CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = sql;
        command.Parameters.AddWithValue(parameter.Name, parameter.Value);
        object? value = await command.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false);
        return value is null or DBNull ? null : Convert.ToString(value, CultureInfo.InvariantCulture);
    }

    private static async Task ExecuteAsync(SqliteConnection connection, SqliteTransaction transaction,
        string sql, CancellationToken cancellationToken, params (string Name, object Value)[] parameters)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = sql;
        foreach ((string name, object value) in parameters) command.Parameters.AddWithValue(name, value);
        await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    private static string Text(JsonElement payload, string name) =>
        payload.TryGetProperty(name, out JsonElement value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()! : throw new InvalidOperationException($"Falta {name} en cambio remoto.");
    private static string? NullableText(JsonElement payload, string name) =>
        payload.TryGetProperty(name, out JsonElement value) && value.ValueKind == JsonValueKind.String
            ? value.GetString() : null;
    private static bool Bool(JsonElement payload, string name) =>
        payload.TryGetProperty(name, out JsonElement value) && value.ValueKind is JsonValueKind.True or JsonValueKind.False
            ? value.GetBoolean() : throw new InvalidOperationException($"Falta {name} en cambio remoto.");
    private static string Timestamp(JsonElement payload, string name, DateTimeOffset fallback) =>
        NullableText(payload, name) ?? SqliteLocalStorageConverters.Timestamp(fallback);
}
