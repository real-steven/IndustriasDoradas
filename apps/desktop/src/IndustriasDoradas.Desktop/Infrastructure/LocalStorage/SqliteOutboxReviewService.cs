using IndustriasDoradas.Desktop.Application.Abstractions;
using Microsoft.Data.Sqlite;

namespace IndustriasDoradas.Desktop.Infrastructure.LocalStorage;

public sealed class SqliteOutboxReviewService(
    ILocalSqliteConnectionFactory connectionFactory,
    TimeProvider timeProvider) : ILocalOutboxReviewService
{
    public Task<OutboxReviewDecisionResult> RetryAsync(
        Guid outboxMessageId,
        CancellationToken cancellationToken = default) =>
        ResolveAsync(outboxMessageId, "RETRY_REQUESTED", cancellationToken);

    public Task<OutboxReviewDecisionResult> DiscardAsync(
        Guid outboxMessageId,
        CancellationToken cancellationToken = default) =>
        ResolveAsync(outboxMessageId, "DISCARDED", cancellationToken);

    private async Task<OutboxReviewDecisionResult> ResolveAsync(
        Guid outboxMessageId,
        string action,
        CancellationToken cancellationToken)
    {
        if (outboxMessageId == Guid.Empty)
            return new OutboxReviewDecisionResult(false, "No se pudo identificar el evento seleccionado.");

        await using SqliteConnection connection = await connectionFactory.OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        using SqliteTransaction transaction = connection.BeginTransaction(deferred: false);
        ReviewSnapshot? snapshot = await ReadSnapshotAsync(
            connection, transaction, outboxMessageId, cancellationToken).ConfigureAwait(false);
        if (snapshot is null)
        {
            transaction.Rollback();
            return new OutboxReviewDecisionResult(
                false,
                "El evento ya fue resuelto o dejó de estar disponible para revisión.");
        }
        if (snapshot.ErrorCode == "IDEMPOTENCY_CONTENT_MISMATCH")
        {
            transaction.Rollback();
            return new OutboxReviewDecisionResult(
                false,
                action == "RETRY_REQUESTED"
                    ? "Este evento no puede reenviarse con el mismo identificador. " +
                      "Actualice la aplicación para recuperar el dato con un sobre técnico nuevo."
                    : "Este evento no puede descartarse porque dejaría el dato aplicado solamente " +
                      "en este equipo. Actualice la aplicación para recuperarlo con un sobre técnico nuevo.");
        }

        DateTimeOffset now = timeProvider.GetUtcNow().ToUniversalTime();
        await using (SqliteCommand audit = connection.CreateCommand())
        {
            audit.Transaction = transaction;
            audit.CommandText = """
                INSERT INTO outbox_review_decisions(
                    id, outbox_message_id, operation_type, aggregate_type, aggregate_id,
                    action, previous_error_code, previous_attempt_count, decided_at_utc)
                VALUES (
                    $id, $outboxId, $operationType, $aggregateType, $aggregateId,
                    $action, $errorCode, $attemptCount, $decidedAtUtc);
                """;
            audit.Parameters.AddWithValue("$id", Guid.NewGuid().ToString("D"));
            audit.Parameters.AddWithValue("$outboxId", outboxMessageId.ToString("D"));
            audit.Parameters.AddWithValue("$operationType", snapshot.OperationType);
            audit.Parameters.AddWithValue("$aggregateType", snapshot.AggregateType);
            audit.Parameters.AddWithValue("$aggregateId", snapshot.AggregateId.ToString("D"));
            audit.Parameters.AddWithValue("$action", action);
            audit.Parameters.AddWithValue("$errorCode", (object?)snapshot.ErrorCode ?? DBNull.Value);
            audit.Parameters.AddWithValue("$attemptCount", snapshot.AttemptCount);
            audit.Parameters.AddWithValue("$decidedAtUtc", now.ToString("O"));
            await audit.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        }

        await using SqliteCommand resolution = connection.CreateCommand();
        resolution.Transaction = transaction;
        if (action == "RETRY_REQUESTED")
        {
            resolution.CommandText = """
                UPDATE outbox_messages
                SET state = 'PENDING', claim_id = NULL, claimed_at_utc = NULL,
                    lease_until_utc = NULL, next_attempt_at_utc = $now,
                    last_error_code = 'MANUAL_RETRY_REQUESTED', updated_at_utc = $now
                WHERE id = $id AND state = 'FAILED_REVIEW';
                """;
            resolution.Parameters.AddWithValue("$now", now.ToString("O"));
        }
        else
        {
            resolution.CommandText = """
                DELETE FROM outbox_messages
                WHERE id = $id AND state = 'FAILED_REVIEW';
                """;
        }
        resolution.Parameters.AddWithValue("$id", outboxMessageId.ToString("D"));
        int affected = await resolution.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        if (affected != 1)
        {
            transaction.Rollback();
            return new OutboxReviewDecisionResult(false, "El evento cambió mientras se procesaba la decisión.");
        }

        transaction.Commit();
        return action == "RETRY_REQUESTED"
            ? new OutboxReviewDecisionResult(
                true,
                "El evento se validará nuevamente contra el sistema central.")
            : new OutboxReviewDecisionResult(
                true,
                "El evento fue descartado de la sincronización y la decisión quedó registrada localmente.");
    }

    private static async Task<ReviewSnapshot?> ReadSnapshotAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        Guid outboxMessageId,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT operation_type, aggregate_type, aggregate_id,
                   last_error_code, attempt_count
            FROM outbox_messages
            WHERE id = $id AND state = 'FAILED_REVIEW';
            """;
        command.Parameters.AddWithValue("$id", outboxMessageId.ToString("D"));
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        if (!await reader.ReadAsync(cancellationToken).ConfigureAwait(false)) return null;
        return new ReviewSnapshot(
            reader.GetString(0),
            reader.GetString(1),
            Guid.Parse(reader.GetString(2)),
            reader.IsDBNull(3) ? null : reader.GetString(3),
            reader.GetInt32(4));
    }

    private sealed record ReviewSnapshot(
        string OperationType,
        string AggregateType,
        Guid AggregateId,
        string? ErrorCode,
        int AttemptCount);
}
