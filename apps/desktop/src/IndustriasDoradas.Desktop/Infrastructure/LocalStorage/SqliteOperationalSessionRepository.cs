using IndustriasDoradas.Desktop.Application.Abstractions;
using Microsoft.Data.Sqlite;

namespace IndustriasDoradas.Desktop.Infrastructure.LocalStorage;

public sealed class SqliteOperationalSessionRepository(ILocalSqliteConnectionFactory connectionFactory)
    : ILocalOperationalSessionRepository
{
    public async Task SaveAsync(
        LocalOperationalSession session,
        CancellationToken cancellationToken = default)
    {
        await using SqliteConnection connection = await connectionFactory
            .OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO operational_sessions(
                station_id, organization_id, plant_id, line_id, shipment_id,
                feed_cycle_id, responsible_worker_id, started_at_utc, updated_at_utc, status)
            VALUES (
                $stationId, $organizationId, $plantId, $lineId, $shipmentId,
                $feedCycleId, $responsibleWorkerId, $startedAtUtc, $updatedAtUtc, $status)
            ON CONFLICT(station_id, line_id) DO UPDATE SET
                organization_id = excluded.organization_id,
                plant_id = excluded.plant_id,
                line_id = excluded.line_id,
                shipment_id = excluded.shipment_id,
                feed_cycle_id = excluded.feed_cycle_id,
                responsible_worker_id = excluded.responsible_worker_id,
                started_at_utc = excluded.started_at_utc,
                updated_at_utc = excluded.updated_at_utc,
                status = excluded.status;
            """;
        AddSessionParameters(command, session);
        await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    public async Task<LocalOperationalSession?> LoadAsync(
        Guid stationId,
        CancellationToken cancellationToken = default)
    {
        IReadOnlyList<LocalOperationalSession> sessions = await ListActiveAsync(
                stationId,
                cancellationToken)
            .ConfigureAwait(false);
        return sessions.Count == 0 ? null : sessions[0];
    }

    public Task<LocalOperationalSession?> LoadAsync(
        Guid stationId,
        Guid lineId,
        CancellationToken cancellationToken = default) =>
        LoadSingleAsync(stationId, lineId, cancellationToken);

    public async Task<IReadOnlyList<LocalOperationalSession>> ListActiveAsync(
        Guid stationId,
        CancellationToken cancellationToken = default)
    {
        await using SqliteConnection connection = await connectionFactory
            .OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            SELECT station_id, organization_id, plant_id, line_id, shipment_id,
                   feed_cycle_id, responsible_worker_id, started_at_utc, updated_at_utc, status
            FROM operational_sessions
            WHERE station_id = $stationId AND status = 'ACTIVE'
            ORDER BY line_id;
            """;
        command.Parameters.AddWithValue(
            "$stationId",
            SqliteLocalStorageConverters.Id(stationId, nameof(stationId)));
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        var result = new List<LocalOperationalSession>();
        while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            result.Add(ReadSession(reader));
        }

        return result;
    }

    private async Task<LocalOperationalSession?> LoadSingleAsync(
        Guid stationId,
        Guid lineId,
        CancellationToken cancellationToken)
    {
        await using SqliteConnection connection = await connectionFactory
            .OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            SELECT station_id, organization_id, plant_id, line_id, shipment_id,
                   feed_cycle_id, responsible_worker_id, started_at_utc, updated_at_utc, status
            FROM operational_sessions
            WHERE station_id = $stationId AND line_id = $lineId;
            """;
        command.Parameters.AddWithValue(
            "$stationId",
            SqliteLocalStorageConverters.Id(stationId, nameof(stationId)));
        command.Parameters.AddWithValue(
            "$lineId",
            SqliteLocalStorageConverters.Id(lineId, nameof(lineId)));
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        return await reader.ReadAsync(cancellationToken).ConfigureAwait(false)
            ? ReadSession(reader)
            : null;
    }

    private static LocalOperationalSession ReadSession(SqliteDataReader reader) =>
        new(
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

    private static void AddSessionParameters(SqliteCommand command, LocalOperationalSession session)
    {
        command.Parameters.AddWithValue("$stationId", SqliteLocalStorageConverters.Id(session.StationId, nameof(session)));
        command.Parameters.AddWithValue(
            "$organizationId",
            SqliteLocalStorageConverters.Id(session.OrganizationId, nameof(session)));
        command.Parameters.AddWithValue("$plantId", SqliteLocalStorageConverters.Id(session.PlantId, nameof(session)));
        command.Parameters.AddWithValue("$lineId", SqliteLocalStorageConverters.Id(session.LineId, nameof(session)));
        command.Parameters.AddWithValue("$shipmentId", SqliteLocalStorageConverters.Id(session.ShipmentId, nameof(session)));
        command.Parameters.AddWithValue(
            "$feedCycleId",
            SqliteLocalStorageConverters.Id(session.FeedCycleId, nameof(session)));
        command.Parameters.AddWithValue(
            "$responsibleWorkerId",
            SqliteLocalStorageConverters.Id(session.ResponsibleWorkerId, nameof(session)));
        command.Parameters.AddWithValue("$startedAtUtc", SqliteLocalStorageConverters.Timestamp(session.StartedAt));
        command.Parameters.AddWithValue("$updatedAtUtc", SqliteLocalStorageConverters.Timestamp(session.UpdatedAt));
        command.Parameters.AddWithValue("$status", SqliteLocalStorageConverters.Status(session.Status));
    }
}
