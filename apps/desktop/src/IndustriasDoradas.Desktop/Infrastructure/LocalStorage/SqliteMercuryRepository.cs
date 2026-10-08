using System.Globalization;
using IndustriasDoradas.Desktop.Application.Abstractions;
using Microsoft.Data.Sqlite;

namespace IndustriasDoradas.Desktop.Infrastructure.LocalStorage;

public sealed class SqliteMercuryRepository(
    ILocalSqliteConnectionFactory connectionFactory) : ILocalMercuryRepository
{
    public async Task<IReadOnlyList<CachedLineComponent>> ListRastrasAsync(
        Guid organizationId,
        Guid lineId,
        CancellationToken cancellationToken = default)
    {
        EnsureRequired(organizationId, nameof(organizationId));
        EnsureRequired(lineId, nameof(lineId));
        await using SqliteConnection connection = await connectionFactory.OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            SELECT id, organization_id, line_id, code, name, display_order, is_active, updated_at_utc
            FROM cached_line_components
            WHERE organization_id = $organizationId
              AND line_id = $lineId
              AND component_type_code = 'RASTRA'
              AND is_active = 1
            ORDER BY display_order, name, id;
            """;
        command.Parameters.AddWithValue("$organizationId", organizationId.ToString("D"));
        command.Parameters.AddWithValue("$lineId", lineId.ToString("D"));
        var items = new List<CachedLineComponent>();
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            items.Add(new CachedLineComponent(
                Guid.Parse(reader.GetString(0)),
                Guid.Parse(reader.GetString(1)),
                Guid.Parse(reader.GetString(2)),
                reader.GetString(3),
                reader.GetString(4),
                reader.GetInt32(5),
                reader.GetBoolean(6),
                ParseTimestamp(reader.GetString(7))));
        }

        return items;
    }

    public async Task<IReadOnlyList<LocalMercurySweepTarget>> ListSweepsAsync(
        Guid shipmentId,
        CancellationToken cancellationToken = default)
    {
        EnsureRequired(shipmentId, nameof(shipmentId));
        await using SqliteConnection connection = await connectionFactory.OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            SELECT id, shipment_id, cajuela_count, swept_at_utc, is_final
            FROM production_sweeps
            WHERE shipment_id = $shipmentId
            ORDER BY swept_at_utc DESC, client_sequence DESC;
            """;
        command.Parameters.AddWithValue("$shipmentId", shipmentId.ToString("D"));
        var items = new List<LocalMercurySweepTarget>();
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            items.Add(new LocalMercurySweepTarget(
                Guid.Parse(reader.GetString(0)),
                Guid.Parse(reader.GetString(1)),
                reader.GetInt32(2),
                ParseTimestamp(reader.GetString(3)),
                reader.GetBoolean(4)));
        }

        return items;
    }

    public async Task<IReadOnlyList<CachedLineComponent>> ListRastrasForShipmentAsync(
        Guid shipmentId,
        CancellationToken cancellationToken = default)
    {
        EnsureRequired(shipmentId, nameof(shipmentId));
        await using SqliteConnection connection = await connectionFactory.OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            SELECT component.id, component.organization_id, component.line_id,
                   component.code, component.name, component.display_order,
                   component.is_active, component.updated_at_utc
            FROM cached_shipments AS shipment
            JOIN cached_line_components AS component
              ON component.organization_id = shipment.organization_id
             AND component.line_id = shipment.line_id
            WHERE shipment.id = $shipmentId
              AND component.component_type_code = 'RASTRA'
              AND component.is_active = 1
            ORDER BY component.display_order, component.name, component.id;
            """;
        command.Parameters.AddWithValue("$shipmentId", shipmentId.ToString("D"));
        var items = new List<CachedLineComponent>();
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            items.Add(new CachedLineComponent(
                Guid.Parse(reader.GetString(0)),
                Guid.Parse(reader.GetString(1)),
                Guid.Parse(reader.GetString(2)),
                reader.GetString(3),
                reader.GetString(4),
                reader.GetInt32(5),
                reader.GetBoolean(6),
                ParseTimestamp(reader.GetString(7))));
        }

        return items;
    }

    public async Task<IReadOnlyList<LocalMercuryMovement>> ListCurrentAsync(
        Guid shipmentId,
        CancellationToken cancellationToken = default)
    {
        EnsureRequired(shipmentId, nameof(shipmentId));
        await using SqliteConnection connection = await connectionFactory.OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            SELECT movement.id, movement.shipment_id, movement.line_id,
                   movement.line_component_id, movement.sweep_id, movement.movement_kind,
                   movement.amount_centigrams, movement.recorded_by_profile_id,
                   movement.occurred_at_utc, movement.recorded_at_utc,
                   movement.supersedes_movement_id, movement.notes
            FROM mercury_movements AS movement
            WHERE movement.shipment_id = $shipmentId
              AND NOT EXISTS (
                  SELECT 1 FROM mercury_movements AS replacement
                  WHERE replacement.organization_id = movement.organization_id
                    AND replacement.supersedes_movement_id = movement.id)
            ORDER BY movement.occurred_at_utc, movement.client_sequence;
            """;
        command.Parameters.AddWithValue("$shipmentId", shipmentId.ToString("D"));
        var items = new List<LocalMercuryMovement>();
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            items.Add(ReadMovement(reader));
        }

        return items;
    }

    public async Task<LocalMercuryMovement> RecordAsync(
        RecordLocalMercuryMovement movement,
        CancellationToken cancellationToken = default)
    {
        Validate(movement);
        await using SqliteConnection connection = await connectionFactory.OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        using SqliteTransaction transaction = connection.BeginTransaction();
        ShipmentScope scope = await LoadScopeAsync(
                connection, transaction, movement, cancellationToken)
            .ConfigureAwait(false);
        Guid? supersedes = movement.ReplaceCurrent
            ? await FindCurrentAsync(connection, transaction, scope, movement, cancellationToken)
                .ConfigureAwait(false)
            : null;
        long sequence = await NextSequenceAsync(
                connection, transaction, movement.StationId, cancellationToken)
            .ConfigureAwait(false);
        long? centigrams = movement.AmountGrams is decimal grams
            ? checked((long)(grams * 100m))
            : null;

        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            INSERT INTO mercury_movements(
                id, organization_id, plant_id, station_id, line_id, feed_cycle_id,
                shipment_id, line_component_id, sweep_id, client_sequence,
                movement_kind, amount_centigrams, unit_code, occurred_at_utc,
                recorded_at_utc, recorded_by_profile_id, supersedes_movement_id, notes)
            VALUES (
                $id, $organizationId, $plantId, $stationId, $lineId, $feedCycleId,
                $shipmentId, $componentId, $sweepId, $sequence,
                $kind, $amount, 'g', $occurredAt, $recordedAt,
                $recordedBy, $supersedes, $notes);
            """;
        command.Parameters.AddWithValue("$id", movement.Id.ToString("D"));
        command.Parameters.AddWithValue("$organizationId", scope.OrganizationId.ToString("D"));
        command.Parameters.AddWithValue("$plantId", scope.PlantId.ToString("D"));
        command.Parameters.AddWithValue("$stationId", movement.StationId.ToString("D"));
        command.Parameters.AddWithValue("$lineId", scope.LineId.ToString("D"));
        command.Parameters.AddWithValue("$feedCycleId", scope.FeedCycleId.ToString("D"));
        command.Parameters.AddWithValue("$shipmentId", movement.ShipmentId.ToString("D"));
        command.Parameters.AddWithValue("$componentId", movement.LineComponentId.ToString("D"));
        command.Parameters.AddWithValue("$sweepId", movement.SweepId?.ToString("D") ?? (object)DBNull.Value);
        command.Parameters.AddWithValue("$sequence", sequence);
        command.Parameters.AddWithValue("$kind", ToStorage(movement.Kind));
        command.Parameters.AddWithValue("$amount", centigrams ?? (object)DBNull.Value);
        command.Parameters.AddWithValue(
            "$occurredAt", SqliteLocalStorageConverters.Timestamp(movement.OccurredAt));
        command.Parameters.AddWithValue(
            "$recordedAt", SqliteLocalStorageConverters.Timestamp(movement.RecordedAt));
        command.Parameters.AddWithValue("$recordedBy", movement.RecordedByProfileId.ToString("D"));
        command.Parameters.AddWithValue("$supersedes", supersedes?.ToString("D") ?? (object)DBNull.Value);
        command.Parameters.AddWithValue("$notes", movement.Notes ?? (object)DBNull.Value);
        await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        await AdvanceSequenceAsync(
                connection, transaction, movement.StationId, sequence + 1,
                movement.RecordedAt, cancellationToken)
            .ConfigureAwait(false);
        transaction.Commit();

        return new LocalMercuryMovement(
            movement.Id,
            movement.ShipmentId,
            scope.LineId,
            movement.LineComponentId,
            movement.SweepId,
            movement.Kind,
            movement.AmountGrams,
            movement.RecordedByProfileId,
            movement.OccurredAt,
            movement.RecordedAt,
            supersedes,
            movement.Notes);
    }

    private static async Task<ShipmentScope> LoadScopeAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        RecordLocalMercuryMovement movement,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT shipment.organization_id, line.plant_id, shipment.line_id, shipment.feed_cycle_id
            FROM cached_shipments AS shipment
            JOIN cached_production_lines AS line ON line.id = shipment.line_id
            JOIN cached_line_components AS component
              ON component.organization_id = shipment.organization_id
             AND component.line_id = shipment.line_id
             AND component.id = $componentId
             AND component.component_type_code = 'RASTRA'
             AND component.is_active = 1
            WHERE shipment.id = $shipmentId;
            """;
        command.Parameters.AddWithValue("$shipmentId", movement.ShipmentId.ToString("D"));
        command.Parameters.AddWithValue("$componentId", movement.LineComponentId.ToString("D"));
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        if (!await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            throw new InvalidOperationException(
                "El cargamento o la rastra ya no están disponibles en el catálogo local.");
        }

        return new ShipmentScope(
            Guid.Parse(reader.GetString(0)),
            Guid.Parse(reader.GetString(1)),
            Guid.Parse(reader.GetString(2)),
            Guid.Parse(reader.GetString(3)));
    }

    private static async Task<Guid?> FindCurrentAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        ShipmentScope scope,
        RecordLocalMercuryMovement movement,
        CancellationToken cancellationToken)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT current.id
            FROM mercury_movements AS current
            WHERE current.organization_id = $organizationId
              AND current.shipment_id = $shipmentId
              AND current.line_component_id = $componentId
              AND current.movement_kind = $kind
              AND current.sweep_id IS $sweepId
              AND NOT EXISTS (
                  SELECT 1 FROM mercury_movements AS replacement
                  WHERE replacement.organization_id = current.organization_id
                    AND replacement.supersedes_movement_id = current.id)
            ORDER BY current.client_sequence DESC
            LIMIT 1;
            """;
        command.Parameters.AddWithValue("$organizationId", scope.OrganizationId.ToString("D"));
        command.Parameters.AddWithValue("$shipmentId", movement.ShipmentId.ToString("D"));
        command.Parameters.AddWithValue("$componentId", movement.LineComponentId.ToString("D"));
        command.Parameters.AddWithValue("$kind", ToStorage(movement.Kind));
        command.Parameters.AddWithValue("$sweepId", movement.SweepId?.ToString("D") ?? (object)DBNull.Value);
        object? result = await command.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false);
        return result is null or DBNull ? null : Guid.Parse(Convert.ToString(result, CultureInfo.InvariantCulture)!);
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
                COALESCE((SELECT MAX(client_sequence) + 1 FROM production_events
                          WHERE station_id = $stationId), 1),
                COALESCE((SELECT MAX(client_sequence) + 1 FROM production_sweeps
                          WHERE station_id = $stationId), 1),
                COALESCE((SELECT MAX(client_sequence) + 1 FROM mercury_movements
                          WHERE station_id = $stationId), 1),
                COALESCE((SELECT next_sequence FROM station_sequence_state
                          WHERE station_id = $stationId), 1));
            """;
        command.Parameters.AddWithValue("$stationId", stationId.ToString("D"));
        return Convert.ToInt64(
            await command.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false),
            CultureInfo.InvariantCulture);
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

    private static LocalMercuryMovement ReadMovement(SqliteDataReader reader) => new(
        Guid.Parse(reader.GetString(0)),
        Guid.Parse(reader.GetString(1)),
        Guid.Parse(reader.GetString(2)),
        Guid.Parse(reader.GetString(3)),
        reader.IsDBNull(4) ? null : Guid.Parse(reader.GetString(4)),
        FromStorage(reader.GetString(5)),
        reader.IsDBNull(6) ? null : reader.GetInt64(6) / 100m,
        Guid.Parse(reader.GetString(7)),
        ParseTimestamp(reader.GetString(8)),
        ParseTimestamp(reader.GetString(9)),
        reader.IsDBNull(10) ? null : Guid.Parse(reader.GetString(10)),
        reader.IsDBNull(11) ? null : reader.GetString(11));

    private static string ToStorage(MercuryMovementKind kind) => kind switch
    {
        MercuryMovementKind.InitialLoad => "INITIAL_LOAD",
        MercuryMovementKind.Reload => "RELOAD",
        MercuryMovementKind.Recovery => "RECOVERY",
        MercuryMovementKind.SweepInput => "SWEEP_INPUT",
        MercuryMovementKind.SweepRemainder => "SWEEP_REMAINDER",
        _ => throw new ArgumentOutOfRangeException(nameof(kind), kind, "Tipo de movimiento desconocido."),
    };

    private static MercuryMovementKind FromStorage(string value) => value switch
    {
        "INITIAL_LOAD" => MercuryMovementKind.InitialLoad,
        "RELOAD" => MercuryMovementKind.Reload,
        "RECOVERY" => MercuryMovementKind.Recovery,
        "SWEEP_INPUT" => MercuryMovementKind.SweepInput,
        "SWEEP_REMAINDER" => MercuryMovementKind.SweepRemainder,
        _ => throw new InvalidOperationException($"Movimiento de mercurio desconocido: {value}."),
    };

    private static void Validate(RecordLocalMercuryMovement movement)
    {
        ArgumentNullException.ThrowIfNull(movement);
        EnsureRequired(movement.Id, nameof(movement.Id));
        EnsureRequired(movement.StationId, nameof(movement.StationId));
        EnsureRequired(movement.ShipmentId, nameof(movement.ShipmentId));
        EnsureRequired(movement.LineComponentId, nameof(movement.LineComponentId));
        EnsureRequired(movement.RecordedByProfileId, nameof(movement.RecordedByProfileId));
        bool belongsToSweep = movement.Kind is MercuryMovementKind.Recovery or
            MercuryMovementKind.SweepInput or MercuryMovementKind.SweepRemainder;
        if (belongsToSweep != movement.SweepId.HasValue)
        {
            throw new InvalidOperationException(
                "Las mediciones de entrada y saldo final requieren una barrida; " +
                "los movimientos históricos de carga no deben incluirla.");
        }
        if (movement.AmountGrams is decimal amount &&
            (amount < 0 || decimal.Round(amount, 2) != amount))
        {
            throw new ArgumentOutOfRangeException(
                nameof(movement),
                "El mercurio debe ser positivo o cero y admitir como máximo dos decimales.");
        }
        if (movement.RecordedAt < movement.OccurredAt)
        {
            throw new ArgumentOutOfRangeException(
                nameof(movement),
                "El registro no puede anteceder al movimiento físico.");
        }
        if (movement.Notes?.Length > 500)
        {
            throw new ArgumentOutOfRangeException(nameof(movement), "La nota admite hasta 500 caracteres.");
        }
    }

    private static void EnsureRequired(Guid value, string parameterName)
    {
        if (value == Guid.Empty) throw new ArgumentException("El UUID es obligatorio.", parameterName);
    }

    private static DateTimeOffset ParseTimestamp(string value) =>
        DateTimeOffset.Parse(value, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind);

    private sealed record ShipmentScope(
        Guid OrganizationId,
        Guid PlantId,
        Guid LineId,
        Guid FeedCycleId);
}
