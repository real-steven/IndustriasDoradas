using IndustriasDoradas.Desktop.Application.Abstractions;
using Microsoft.Data.Sqlite;

namespace IndustriasDoradas.Desktop.Infrastructure.LocalStorage;

public sealed class SqliteOutboxRepository(ILocalSqliteConnectionFactory connectionFactory)
    : ILocalOutboxRepository, ILocalStationSequenceStore
{
    public async Task EnsureNextAsync(
        Guid stationId,
        long nextSequence,
        DateTimeOffset updatedAt,
        CancellationToken cancellationToken = default)
    {
        if (stationId == Guid.Empty || nextSequence < 1)
            throw new ArgumentException("La base de secuencia de estación es inválida.");

        await using SqliteConnection connection = await connectionFactory.OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO station_sequence_state(station_id, next_sequence, updated_at_utc)
            VALUES ($stationId, $nextSequence, $updatedAtUtc)
            ON CONFLICT(station_id) DO UPDATE SET
                next_sequence = MAX(station_sequence_state.next_sequence, excluded.next_sequence),
                updated_at_utc = excluded.updated_at_utc;
            """;
        command.Parameters.AddWithValue("$stationId", stationId.ToString("D"));
        command.Parameters.AddWithValue("$nextSequence", nextSequence);
        command.Parameters.AddWithValue("$updatedAtUtc", Timestamp(updatedAt));
        await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    public async Task<IReadOnlyList<StoredOutboxMessage>> ListPendingAsync(
        int limit,
        CancellationToken cancellationToken = default)
    {
        ValidateLimit(limit);
        await using SqliteConnection connection = await connectionFactory.OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            SELECT id, operation_type, aggregate_type, aggregate_id, payload_json,
                   created_at_utc, attempt_count, next_attempt_at_utc
            FROM outbox_messages
            WHERE state = 'PENDING'
            ORDER BY station_sequence
            LIMIT $limit;
            """;
        command.Parameters.AddWithValue("$limit", limit);
        var messages = new List<StoredOutboxMessage>();
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            messages.Add(new StoredOutboxMessage(
                ReadMessage(reader),
                reader.GetInt32(6),
                reader.IsDBNull(7) ? null : ReadTimestamp(reader.GetString(7))));
        }
        return messages;
    }

    public async Task<IReadOnlyList<ClaimedOutboxMessage>> ClaimAsync(
        Guid stationId,
        Guid claimId,
        int limit,
        DateTimeOffset now,
        DateTimeOffset leaseUntil,
        OutboxAuthorizationEvidence authorization,
        CancellationToken cancellationToken = default)
    {
        ValidateLimit(limit);
        if (stationId == Guid.Empty || claimId == Guid.Empty || leaseUntil <= now)
            throw new ArgumentException("El reclamo de Outbox contiene valores inválidos.");
        ValidateAuthorization(authorization);

        await using SqliteConnection connection = await connectionFactory.OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        using SqliteTransaction transaction = connection.BeginTransaction(deferred: false);
        string nowText = Timestamp(now);
        await ExecuteAsync(connection, transaction, """
            UPDATE outbox_messages
            SET state = 'PENDING', claim_id = NULL, claimed_at_utc = NULL,
                lease_until_utc = NULL, next_attempt_at_utc = $now,
                last_error_code = 'ABANDONED_CLAIM', updated_at_utc = $now
            WHERE state = 'SYNCING' AND lease_until_utc <= $now;
            """, [("$now", nowText)], cancellationToken).ConfigureAwait(false);

        var ids = new List<string>();
        await using (SqliteCommand select = connection.CreateCommand())
        {
            select.Transaction = transaction;
            select.CommandText = """
                SELECT id FROM outbox_messages
                WHERE station_id = $stationId AND state = 'PENDING'
                  AND (next_attempt_at_utc IS NULL OR next_attempt_at_utc <= $now)
                ORDER BY station_sequence LIMIT $limit;
                """;
            select.Parameters.AddWithValue("$stationId", stationId.ToString("D"));
            select.Parameters.AddWithValue("$now", nowText);
            select.Parameters.AddWithValue("$limit", limit);
            await using SqliteDataReader reader = await select.ExecuteReaderAsync(cancellationToken)
                .ConfigureAwait(false);
            while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
                ids.Add(reader.GetString(0));
        }

        foreach (string id in ids)
        {
            await ExecuteAsync(connection, transaction, """
                UPDATE outbox_messages
                SET state = 'SYNCING', claim_id = $claimId, claimed_at_utc = $now,
                    lease_until_utc = $leaseUntil, attempt_count = attempt_count + 1,
                    next_attempt_at_utc = NULL,
                    actor_profile_id = COALESCE(actor_profile_id,
                        json_extract(payload_json, '$.actorProfileId'), $actorProfileId),
                    permission_version = COALESCE(permission_version,
                        json_extract(payload_json, '$.permissionVersion'), $permissionVersion),
                    authorization_validated_at_utc = COALESCE(authorization_validated_at_utc, $validatedAt),
                    authorization_offline_until_utc = COALESCE(authorization_offline_until_utc, $offlineUntil),
                    authorization_state = COALESCE(authorization_state, $authorizationState),
                    updated_at_utc = $now
                WHERE id = $id AND state = 'PENDING';
                """,
                [
                    ("$claimId", claimId.ToString("D")), ("$now", nowText),
                    ("$leaseUntil", Timestamp(leaseUntil)),
                    ("$actorProfileId", authorization.ActorProfileId.ToString("D")),
                    ("$permissionVersion", authorization.PermissionVersion),
                    ("$validatedAt", Timestamp(authorization.ValidatedAt)),
                    ("$offlineUntil", Timestamp(authorization.OfflineValidUntil)),
                    ("$authorizationState", authorization.StateAtCapture), ("$id", id),
                ], cancellationToken).ConfigureAwait(false);
        }

        IReadOnlyList<ClaimedOutboxMessage> result = await ReadClaimAsync(
            connection, transaction, claimId, cancellationToken).ConfigureAwait(false);
        transaction.Commit();
        return result;
    }

    public async Task CompleteClaimAsync(
        Guid claimId,
        IReadOnlyList<OutboxItemDisposition> dispositions,
        DateTimeOffset now,
        Func<int, TimeSpan> retryDelay,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(dispositions);
        ArgumentNullException.ThrowIfNull(retryDelay);
        await using SqliteConnection connection = await connectionFactory.OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        using SqliteTransaction transaction = connection.BeginTransaction(deferred: false);
        Dictionary<Guid, int> attempts = await ReadClaimAttemptsAsync(
            connection, transaction, claimId, cancellationToken).ConfigureAwait(false);
        foreach (OutboxItemDisposition disposition in dispositions)
        {
            if (!attempts.Remove(disposition.OutboxMessageId, out int attemptCount)) continue;
            await ApplyDispositionAsync(connection, transaction, claimId, disposition,
                attemptCount, now, retryDelay, cancellationToken).ConfigureAwait(false);
        }
        foreach ((Guid id, int attemptCount) in attempts)
        {
            await ApplyDispositionAsync(connection, transaction, claimId,
                new OutboxItemDisposition(id, "RETRY_LATER", "INCOMPLETE_SERVER_RESPONSE", null),
                attemptCount, now, retryDelay, cancellationToken).ConfigureAwait(false);
        }
        transaction.Commit();
    }

    public async Task ReleaseClaimAsync(
        Guid claimId,
        string errorCode,
        int? httpStatus,
        DateTimeOffset now,
        Func<int, TimeSpan> retryDelay,
        bool permanent,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(errorCode);
        ArgumentNullException.ThrowIfNull(retryDelay);
        await using SqliteConnection connection = await connectionFactory.OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        using SqliteTransaction transaction = connection.BeginTransaction(deferred: false);
        Dictionary<Guid, int> attempts = await ReadClaimAttemptsAsync(
            connection, transaction, claimId, cancellationToken).ConfigureAwait(false);
        foreach ((Guid id, int attemptCount) in attempts)
        {
            await ApplyDispositionAsync(connection, transaction, claimId,
                new OutboxItemDisposition(id, permanent ? "FAILED_REVIEW" : "RETRY_LATER",
                    errorCode, null, httpStatus),
                attemptCount, now, retryDelay, cancellationToken).ConfigureAwait(false);
        }
        transaction.Commit();
    }

    private static async Task ApplyDispositionAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        Guid claimId,
        OutboxItemDisposition disposition,
        int attemptCount,
        DateTimeOffset now,
        Func<int, TimeSpan> retryDelay,
        CancellationToken cancellationToken)
    {
        bool synced = disposition.Status is "APPLIED" or "ALREADY_APPLIED";
        bool review = disposition.Status == "FAILED_REVIEW";
        if (synced && disposition.ReceiptId is null)
        {
            synced = false;
            review = false;
            disposition = disposition with { Code = "MISSING_CENTRAL_RECEIPT" };
        }
        string state = synced ? "SYNCED" : review ? "FAILED_REVIEW" : "PENDING";
        DateTimeOffset? nextAttempt = state == "PENDING" ? now + retryDelay(attemptCount) : null;
        await ExecuteAsync(connection, transaction, """
            UPDATE outbox_messages
            SET state = $state, claim_id = NULL, claimed_at_utc = NULL, lease_until_utc = NULL,
                next_attempt_at_utc = $nextAttempt, last_error_code = $errorCode,
                last_http_status = $httpStatus, synced_at_utc = $syncedAt,
                central_receipt_id = $receiptId, updated_at_utc = $now
            WHERE id = $id AND state = 'SYNCING' AND claim_id = $claimId;
            """,
            [
                ("$state", state),
                ("$nextAttempt", (object?)nextAttempt?.ToString("O") ?? DBNull.Value),
                ("$errorCode", synced ? DBNull.Value : disposition.Code),
                ("$httpStatus", (object?)disposition.HttpStatus ?? DBNull.Value),
                ("$syncedAt", synced ? now.ToString("O") : DBNull.Value),
                ("$receiptId", (object?)disposition.ReceiptId?.ToString("D") ?? DBNull.Value),
                ("$now", now.ToString("O")), ("$id", disposition.OutboxMessageId.ToString("D")),
                ("$claimId", claimId.ToString("D")),
            ], cancellationToken).ConfigureAwait(false);
    }

    private static async Task<IReadOnlyList<ClaimedOutboxMessage>> ReadClaimAsync(
        SqliteConnection connection, SqliteTransaction transaction, Guid claimId,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT id, operation_type, aggregate_type, aggregate_id, payload_json,
                   created_at_utc, station_sequence, attempt_count, actor_profile_id,
                   permission_version, authorization_validated_at_utc,
                   authorization_offline_until_utc, authorization_state
            FROM outbox_messages
            WHERE state = 'SYNCING' AND claim_id = $claimId ORDER BY station_sequence;
            """;
        command.Parameters.AddWithValue("$claimId", claimId.ToString("D"));
        var result = new List<ClaimedOutboxMessage>();
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            result.Add(new ClaimedOutboxMessage(ReadMessage(reader), reader.GetInt64(6), reader.GetInt32(7),
                new OutboxAuthorizationEvidence(Guid.Parse(reader.GetString(8)), reader.GetInt32(9),
                    ReadTimestamp(reader.GetString(10)), ReadTimestamp(reader.GetString(11)), reader.GetString(12))));
        }
        return result;
    }

    private static async Task<Dictionary<Guid, int>> ReadClaimAttemptsAsync(
        SqliteConnection connection, SqliteTransaction transaction, Guid claimId,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "SELECT id, attempt_count FROM outbox_messages WHERE state = 'SYNCING' AND claim_id = $claimId;";
        command.Parameters.AddWithValue("$claimId", claimId.ToString("D"));
        var result = new Dictionary<Guid, int>();
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
            result.Add(Guid.Parse(reader.GetString(0)), reader.GetInt32(1));
        return result;
    }

    private static async Task ExecuteAsync(
        SqliteConnection connection, SqliteTransaction transaction, string sql,
        IReadOnlyList<(string Name, object Value)> parameters, CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = sql;
        foreach ((string name, object value) in parameters) command.Parameters.AddWithValue(name, value);
        await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    private static PendingOutboxMessage ReadMessage(SqliteDataReader reader) => new(
        Guid.Parse(reader.GetString(0)), reader.GetString(1), reader.GetString(2),
        Guid.Parse(reader.GetString(3)), reader.GetString(4), ReadTimestamp(reader.GetString(5)));

    private static string Timestamp(DateTimeOffset value) => SqliteLocalStorageConverters.Timestamp(value);
    private static DateTimeOffset ReadTimestamp(string value) => SqliteLocalStorageConverters.ReadTimestamp(value);

    private static void ValidateLimit(int limit)
    {
        if (limit is < 1 or > 500)
            throw new ArgumentOutOfRangeException(nameof(limit), "El límite debe estar entre 1 y 500.");
    }

    private static void ValidateAuthorization(OutboxAuthorizationEvidence authorization)
    {
        ArgumentNullException.ThrowIfNull(authorization);
        if (authorization.ActorProfileId == Guid.Empty || authorization.PermissionVersion < 1 ||
            authorization.StateAtCapture is not ("VALID" or "EXPIRED_CONTINGENCY" or "LEGACY_UNAVAILABLE"))
            throw new ArgumentException("La evidencia de autorización es inválida.", nameof(authorization));
    }
}
