using System.Globalization;
using System.Text.Json;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain.Attendance;
using Microsoft.Data.Sqlite;

namespace IndustriasDoradas.Desktop.Infrastructure.LocalStorage;

public sealed class SqliteAttendanceRepository(
    ILocalSqliteConnectionFactory connectionFactory) : ILocalAttendanceRepository
{
    public async Task<LocalAttendanceRegistration> RecordAsync(
        RecordLocalAttendanceMutation mutation,
        CancellationToken cancellationToken = default)
    {
        await using SqliteConnection connection = await connectionFactory
            .OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        using SqliteTransaction transaction = connection.BeginTransaction(deferred: false);

        AttendanceEvent? existing = await FindAsync(
                connection, transaction, mutation.ClientEventId, cancellationToken)
            .ConfigureAwait(false);
        if (existing is not null)
        {
            EnsureSameMutation(existing, mutation);
            transaction.Commit();
            return new LocalAttendanceRegistration(existing, true);
        }

        long sequence = await NextSequenceAsync(
                connection, transaction, mutation.StationId, cancellationToken)
            .ConfigureAwait(false);
        AttendanceEvent attendanceEvent = CreateEvent(mutation, sequence);
        await InsertEventAsync(connection, transaction, attendanceEvent, cancellationToken)
            .ConfigureAwait(false);
        await InsertOutboxAsync(
                connection, transaction, attendanceEvent, mutation.Authorization, cancellationToken)
            .ConfigureAwait(false);
        await AdvanceSequenceAsync(
                connection,
                transaction,
                attendanceEvent.StationId,
                sequence + 1,
                attendanceEvent.RecordedAt,
                cancellationToken)
            .ConfigureAwait(false);
        transaction.Commit();
        return new LocalAttendanceRegistration(attendanceEvent, false);
    }

    public async Task<IReadOnlyList<AttendanceEvent>> ListForWorkerAsync(
        Guid organizationId,
        Guid workerId,
        CancellationToken cancellationToken = default)
    {
        await using SqliteConnection connection = await connectionFactory
            .OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = $"""
            {SelectColumns}
            WHERE organization_id = $organizationId AND worker_id = $workerId
            ORDER BY occurred_at_utc, client_sequence, client_event_id;
            """;
        command.Parameters.AddWithValue("$organizationId", organizationId.ToString("D"));
        command.Parameters.AddWithValue("$workerId", workerId.ToString("D"));
        var result = new List<AttendanceEvent>();
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            result.Add(ReadEvent(reader));
        }

        return result;
    }

    private const string SelectColumns = """
        SELECT client_event_id, organization_id, plant_id, station_id, worker_id,
               client_sequence, event_type, occurred_at_utc, recorded_at_utc,
               confirmed_at_utc, sync_status, corrected_by_profile_id,
               correction_reason, related_event_id
        FROM attendance_events
        """;

    private static AttendanceEvent CreateEvent(
        RecordLocalAttendanceMutation mutation,
        long sequence) => mutation.EventType switch
        {
            AttendanceEventType.CheckIn => AttendanceEvent.CheckIn(
                mutation.ClientEventId,
                mutation.OrganizationId,
                mutation.PlantId,
                mutation.StationId,
                mutation.WorkerId,
                sequence,
                mutation.OccurredAt,
                mutation.RecordedAt),
            AttendanceEventType.CheckOut => AttendanceEvent.CheckOut(
                mutation.ClientEventId,
                mutation.OrganizationId,
                mutation.PlantId,
                mutation.StationId,
                mutation.WorkerId,
                sequence,
                mutation.OccurredAt,
                mutation.RecordedAt),
            AttendanceEventType.AdjustedCheckIn or AttendanceEventType.AdjustedCheckOut =>
                AttendanceEvent.Adjustment(
                    mutation.ClientEventId,
                    mutation.OrganizationId,
                    mutation.PlantId,
                    mutation.StationId,
                    mutation.WorkerId,
                    mutation.EventType,
                    sequence,
                    mutation.OccurredAt,
                    mutation.RecordedAt,
                    mutation.CorrectedByProfileId ?? Guid.Empty,
                    mutation.CorrectionReason ?? string.Empty,
                    mutation.RelatedEventId ?? Guid.Empty),
            _ => throw new ArgumentOutOfRangeException(nameof(mutation), "Tipo de asistencia no soportado."),
        };

    private static async Task<AttendanceEvent?> FindAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        Guid eventId,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = $"""
            {SelectColumns}
            WHERE client_event_id = $eventId;
            """;
        command.Parameters.AddWithValue("$eventId", eventId.ToString("D"));
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        return await reader.ReadAsync(cancellationToken).ConfigureAwait(false)
            ? ReadEvent(reader)
            : null;
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
                COALESCE((SELECT MAX(client_sequence) + 1 FROM attendance_events
                          WHERE station_id = $stationId), 1),
                COALESCE((SELECT MAX(station_sequence) + 1 FROM outbox_messages
                          WHERE station_id = $stationId), 1),
                COALESCE((SELECT next_sequence FROM station_sequence_state
                          WHERE station_id = $stationId), 1));
            """;
        command.Parameters.AddWithValue("$stationId", stationId.ToString("D"));
        return Convert.ToInt64(
            await command.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false),
            CultureInfo.InvariantCulture);
    }

    private static async Task InsertEventAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        AttendanceEvent attendanceEvent,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            INSERT INTO attendance_events(
                client_event_id, organization_id, plant_id, station_id, worker_id,
                client_sequence, event_type, occurred_at_utc, recorded_at_utc,
                sync_status, corrected_by_profile_id, correction_reason, related_event_id)
            VALUES (
                $eventId, $organizationId, $plantId, $stationId, $workerId,
                $sequence, $eventType, $occurredAt, $recordedAt, 'PENDING',
                $correctedBy, $reason, $relatedEventId);
            """;
        AddEventParameters(command, attendanceEvent);
        await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    private static async Task InsertOutboxAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        AttendanceEvent attendanceEvent,
        OutboxAuthorizationEvidence? authorization,
        CancellationToken cancellationToken)
    {
        var payload = new AttendanceEventOutboxPayload(
            1,
            attendanceEvent.ClientEventId,
            attendanceEvent.OrganizationId,
            attendanceEvent.PlantId,
            attendanceEvent.StationId,
            attendanceEvent.WorkerId,
            ToStorage(attendanceEvent.Type),
            attendanceEvent.ClientSequence,
            attendanceEvent.OccurredAt,
            attendanceEvent.RecordedAt,
            attendanceEvent.CorrectedByProfileId,
            attendanceEvent.CorrectionReason,
            attendanceEvent.RelatedEventId);
        string json = JsonSerializer.Serialize(
            payload,
            LocalStorageJsonSerializerContext.Default.AttendanceEventOutboxPayload);
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            INSERT INTO outbox_messages(
                id, station_id, station_sequence, operation_type, aggregate_type,
                aggregate_id, payload_json, actor_profile_id, permission_version,
                authorization_validated_at_utc, authorization_offline_until_utc,
                authorization_state, state, attempt_count, created_at_utc, updated_at_utc)
            VALUES (
                $outboxId, $stationId, $sequence, 'ATTENDANCE_EVENT_RECORDED',
                'attendance_event', $eventId, $payload, $actorProfileId,
                $permissionVersion, $authorizationValidatedAt,
                $authorizationOfflineUntil, $authorizationState,
                'PENDING', 0, $recordedAt, $recordedAt);
            """;
        command.Parameters.AddWithValue("$outboxId", Guid.NewGuid().ToString("D"));
        command.Parameters.AddWithValue("$stationId", attendanceEvent.StationId.ToString("D"));
        command.Parameters.AddWithValue("$sequence", attendanceEvent.ClientSequence);
        command.Parameters.AddWithValue("$eventId", attendanceEvent.ClientEventId.ToString("D"));
        command.Parameters.AddWithValue("$payload", json);
        command.Parameters.AddWithValue(
            "$recordedAt", SqliteLocalStorageConverters.Timestamp(attendanceEvent.RecordedAt));
        SqliteLocalStorageConverters.AddAuthorizationParameters(command, authorization);
        await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
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

    private static AttendanceEvent ReadEvent(SqliteDataReader reader) => AttendanceEvent.Restore(
        Guid.Parse(reader.GetString(0)),
        Guid.Parse(reader.GetString(1)),
        Guid.Parse(reader.GetString(2)),
        Guid.Parse(reader.GetString(3)),
        Guid.Parse(reader.GetString(4)),
        FromStorage(reader.GetString(6)),
        reader.GetInt64(5),
        SqliteLocalStorageConverters.ReadTimestamp(reader.GetString(7)),
        SqliteLocalStorageConverters.ReadTimestamp(reader.GetString(8)),
        reader.IsDBNull(9) ? null : SqliteLocalStorageConverters.ReadTimestamp(reader.GetString(9)),
        FromSyncStorage(reader.GetString(10)),
        reader.IsDBNull(11) ? null : Guid.Parse(reader.GetString(11)),
        reader.IsDBNull(12) ? null : reader.GetString(12),
        reader.IsDBNull(13) ? null : Guid.Parse(reader.GetString(13)));

    private static void AddEventParameters(SqliteCommand command, AttendanceEvent attendanceEvent)
    {
        command.Parameters.AddWithValue("$eventId", attendanceEvent.ClientEventId.ToString("D"));
        command.Parameters.AddWithValue("$organizationId", attendanceEvent.OrganizationId.ToString("D"));
        command.Parameters.AddWithValue("$plantId", attendanceEvent.PlantId.ToString("D"));
        command.Parameters.AddWithValue("$stationId", attendanceEvent.StationId.ToString("D"));
        command.Parameters.AddWithValue("$workerId", attendanceEvent.WorkerId.ToString("D"));
        command.Parameters.AddWithValue("$sequence", attendanceEvent.ClientSequence);
        command.Parameters.AddWithValue("$eventType", ToStorage(attendanceEvent.Type));
        command.Parameters.AddWithValue("$occurredAt", SqliteLocalStorageConverters.Timestamp(attendanceEvent.OccurredAt));
        command.Parameters.AddWithValue("$recordedAt", SqliteLocalStorageConverters.Timestamp(attendanceEvent.RecordedAt));
        command.Parameters.AddWithValue("$correctedBy", (object?)attendanceEvent.CorrectedByProfileId?.ToString("D") ?? DBNull.Value);
        command.Parameters.AddWithValue("$reason", (object?)attendanceEvent.CorrectionReason ?? DBNull.Value);
        command.Parameters.AddWithValue("$relatedEventId", (object?)attendanceEvent.RelatedEventId?.ToString("D") ?? DBNull.Value);
    }

    private static string ToStorage(AttendanceEventType type) => type switch
    {
        AttendanceEventType.CheckIn => "CHECK_IN",
        AttendanceEventType.CheckOut => "CHECK_OUT",
        AttendanceEventType.AdjustedCheckIn => "ADJUSTED_CHECK_IN",
        AttendanceEventType.AdjustedCheckOut => "ADJUSTED_CHECK_OUT",
        _ => throw new ArgumentOutOfRangeException(nameof(type)),
    };

    private static AttendanceEventType FromStorage(string value) => value switch
    {
        "CHECK_IN" => AttendanceEventType.CheckIn,
        "CHECK_OUT" => AttendanceEventType.CheckOut,
        "ADJUSTED_CHECK_IN" => AttendanceEventType.AdjustedCheckIn,
        "ADJUSTED_CHECK_OUT" => AttendanceEventType.AdjustedCheckOut,
        _ => throw new InvalidOperationException($"Tipo de asistencia local desconocido: {value}."),
    };

    private static AttendanceSyncStatus FromSyncStorage(string value) => value switch
    {
        "PENDING" => AttendanceSyncStatus.Pending,
        "SYNCHRONIZED" => AttendanceSyncStatus.Synchronized,
        "REQUIRES_ATTENTION" => AttendanceSyncStatus.RequiresAttention,
        _ => throw new InvalidOperationException($"Estado de asistencia local desconocido: {value}."),
    };

    private static void EnsureSameMutation(
        AttendanceEvent existing,
        RecordLocalAttendanceMutation mutation)
    {
        bool same = existing.OrganizationId == mutation.OrganizationId &&
            existing.PlantId == mutation.PlantId &&
            existing.StationId == mutation.StationId &&
            existing.WorkerId == mutation.WorkerId &&
            existing.Type == mutation.EventType &&
            existing.OccurredAt == mutation.OccurredAt.ToUniversalTime() &&
            existing.RecordedAt == mutation.RecordedAt.ToUniversalTime() &&
            existing.CorrectedByProfileId == mutation.CorrectedByProfileId &&
            existing.CorrectionReason == mutation.CorrectionReason?.Trim() &&
            existing.RelatedEventId == mutation.RelatedEventId;
        if (!same)
        {
            throw new InvalidOperationException("El UUID de asistencia ya existe con otro contenido.");
        }
    }
}
