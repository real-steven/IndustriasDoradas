using IndustriasDoradas.Desktop.Application.Abstractions;
using Microsoft.Data.Sqlite;

namespace IndustriasDoradas.Desktop.Infrastructure.LocalStorage;

public sealed class SqliteCatalogRepository(ILocalSqliteConnectionFactory connectionFactory)
    : ILocalCatalogRepository
{
    public Task UpsertSupplierAsync(
        CachedSupplier supplier,
        CancellationToken cancellationToken = default) =>
        UpsertAsync(
            """
            INSERT INTO cached_suppliers(id, organization_id, name, is_active, updated_at_utc)
            VALUES ($id, $organizationId, $name, $isActive, $updatedAtUtc)
            ON CONFLICT(id) DO UPDATE SET
                organization_id = excluded.organization_id,
                name = excluded.name,
                is_active = excluded.is_active,
                updated_at_utc = excluded.updated_at_utc;
            """,
            command =>
            {
                command.Parameters.AddWithValue("$id", SqliteLocalStorageConverters.Id(supplier.Id, nameof(supplier)));
                command.Parameters.AddWithValue(
                    "$organizationId",
                    SqliteLocalStorageConverters.Id(supplier.OrganizationId, nameof(supplier)));
                command.Parameters.AddWithValue("$name", SqliteLocalStorageConverters.Text(supplier.Name, nameof(supplier)));
                command.Parameters.AddWithValue("$isActive", supplier.IsActive ? 1 : 0);
                command.Parameters.AddWithValue("$updatedAtUtc", SqliteLocalStorageConverters.Timestamp(supplier.UpdatedAt));
            },
            cancellationToken);

    public Task UpsertWorkerAsync(
        CachedWorker worker,
        CancellationToken cancellationToken = default) =>
        UpsertAsync(
            """
            INSERT INTO cached_workers(id, organization_id, name, is_active, updated_at_utc)
            VALUES ($id, $organizationId, $name, $isActive, $updatedAtUtc)
            ON CONFLICT(id) DO UPDATE SET
                organization_id = excluded.organization_id,
                name = excluded.name,
                is_active = excluded.is_active,
                updated_at_utc = excluded.updated_at_utc;
            """,
            command =>
            {
                command.Parameters.AddWithValue("$id", SqliteLocalStorageConverters.Id(worker.Id, nameof(worker)));
                command.Parameters.AddWithValue(
                    "$organizationId",
                    SqliteLocalStorageConverters.Id(worker.OrganizationId, nameof(worker)));
                command.Parameters.AddWithValue("$name", SqliteLocalStorageConverters.Text(worker.Name, nameof(worker)));
                command.Parameters.AddWithValue("$isActive", worker.IsActive ? 1 : 0);
                command.Parameters.AddWithValue("$updatedAtUtc", SqliteLocalStorageConverters.Timestamp(worker.UpdatedAt));
            },
            cancellationToken);

    public Task UpsertLineAsync(
        CachedProductionLine line,
        CancellationToken cancellationToken = default) =>
        UpsertAsync(
            """
            INSERT INTO cached_production_lines(
                id, organization_id, plant_id, name, is_active, updated_at_utc)
            VALUES ($id, $organizationId, $plantId, $name, $isActive, $updatedAtUtc)
            ON CONFLICT(id) DO UPDATE SET
                organization_id = excluded.organization_id,
                plant_id = excluded.plant_id,
                name = excluded.name,
                is_active = excluded.is_active,
                updated_at_utc = excluded.updated_at_utc;
            """,
            command =>
            {
                command.Parameters.AddWithValue("$id", SqliteLocalStorageConverters.Id(line.Id, nameof(line)));
                command.Parameters.AddWithValue(
                    "$organizationId",
                    SqliteLocalStorageConverters.Id(line.OrganizationId, nameof(line)));
                command.Parameters.AddWithValue("$plantId", SqliteLocalStorageConverters.Id(line.PlantId, nameof(line)));
                command.Parameters.AddWithValue("$name", SqliteLocalStorageConverters.Text(line.Name, nameof(line)));
                command.Parameters.AddWithValue("$isActive", line.IsActive ? 1 : 0);
                command.Parameters.AddWithValue("$updatedAtUtc", SqliteLocalStorageConverters.Timestamp(line.UpdatedAt));
            },
            cancellationToken);

    public async Task<IReadOnlyList<CachedSupplier>> ListActiveSuppliersAsync(
        Guid organizationId,
        CancellationToken cancellationToken = default)
    {
        await using SqliteConnection connection = await connectionFactory
            .OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            SELECT id, organization_id, name, is_active, updated_at_utc
            FROM cached_suppliers
            WHERE organization_id = $organizationId AND is_active = 1
            ORDER BY name COLLATE NOCASE, id;
            """;
        command.Parameters.AddWithValue(
            "$organizationId",
            SqliteLocalStorageConverters.Id(organizationId, nameof(organizationId)));

        var result = new List<CachedSupplier>();
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            result.Add(new CachedSupplier(
                Guid.Parse(reader.GetString(0)),
                Guid.Parse(reader.GetString(1)),
                reader.GetString(2),
                reader.GetInt64(3) == 1,
                SqliteLocalStorageConverters.ReadTimestamp(reader.GetString(4))));
        }

        return result;
    }

    public async Task<IReadOnlyList<CachedWorker>> ListActiveWorkersAsync(
        Guid organizationId,
        CancellationToken cancellationToken = default)
    {
        await using SqliteConnection connection = await connectionFactory.OpenAsync(cancellationToken).ConfigureAwait(false);
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            SELECT id, organization_id, name, is_active, updated_at_utc
            FROM cached_workers
            WHERE organization_id = $organizationId AND is_active = 1
            ORDER BY name COLLATE NOCASE, id;
            """;
        command.Parameters.AddWithValue(
            "$organizationId",
            SqliteLocalStorageConverters.Id(organizationId, nameof(organizationId)));
        var result = new List<CachedWorker>();
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);
        while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            result.Add(new CachedWorker(
                Guid.Parse(reader.GetString(0)),
                Guid.Parse(reader.GetString(1)),
                reader.GetString(2),
                reader.GetInt64(3) == 1,
                SqliteLocalStorageConverters.ReadTimestamp(reader.GetString(4))));
        }

        return result;
    }

    public async Task<IReadOnlyList<CachedProductionLine>> ListActiveLinesAsync(
        Guid organizationId,
        Guid plantId,
        CancellationToken cancellationToken = default)
    {
        await using SqliteConnection connection = await connectionFactory.OpenAsync(cancellationToken).ConfigureAwait(false);
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            SELECT id, organization_id, plant_id, name, is_active, updated_at_utc
            FROM cached_production_lines
            WHERE organization_id = $organizationId AND plant_id = $plantId AND is_active = 1
            ORDER BY name COLLATE NOCASE, id;
            """;
        command.Parameters.AddWithValue(
            "$organizationId",
            SqliteLocalStorageConverters.Id(organizationId, nameof(organizationId)));
        command.Parameters.AddWithValue("$plantId", SqliteLocalStorageConverters.Id(plantId, nameof(plantId)));
        var result = new List<CachedProductionLine>();
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);
        while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            result.Add(new CachedProductionLine(
                Guid.Parse(reader.GetString(0)),
                Guid.Parse(reader.GetString(1)),
                Guid.Parse(reader.GetString(2)),
                reader.GetString(3),
                reader.GetInt64(4) == 1,
                SqliteLocalStorageConverters.ReadTimestamp(reader.GetString(5))));
        }

        return result;
    }

    public async Task<CachedSupplier?> FindSupplierAsync(
        Guid supplierId,
        CancellationToken cancellationToken = default)
    {
        await using SqliteConnection connection = await connectionFactory
            .OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            SELECT id, organization_id, name, is_active, updated_at_utc
            FROM cached_suppliers
            WHERE id = $id;
            """;
        command.Parameters.AddWithValue("$id", SqliteLocalStorageConverters.Id(supplierId, nameof(supplierId)));
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        return await reader.ReadAsync(cancellationToken).ConfigureAwait(false)
            ? new CachedSupplier(
                Guid.Parse(reader.GetString(0)),
                Guid.Parse(reader.GetString(1)),
                reader.GetString(2),
                reader.GetInt64(3) == 1,
                SqliteLocalStorageConverters.ReadTimestamp(reader.GetString(4)))
            : null;
    }

    public async Task<CachedWorker?> FindWorkerAsync(
        Guid workerId,
        CancellationToken cancellationToken = default)
    {
        await using SqliteConnection connection = await connectionFactory
            .OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            SELECT id, organization_id, name, is_active, updated_at_utc
            FROM cached_workers
            WHERE id = $id;
            """;
        command.Parameters.AddWithValue("$id", SqliteLocalStorageConverters.Id(workerId, nameof(workerId)));
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        return await reader.ReadAsync(cancellationToken).ConfigureAwait(false)
            ? new CachedWorker(
                Guid.Parse(reader.GetString(0)),
                Guid.Parse(reader.GetString(1)),
                reader.GetString(2),
                reader.GetInt64(3) == 1,
                SqliteLocalStorageConverters.ReadTimestamp(reader.GetString(4)))
            : null;
    }

    public async Task<CachedProductionLine?> FindLineAsync(
        Guid lineId,
        CancellationToken cancellationToken = default)
    {
        await using SqliteConnection connection = await connectionFactory
            .OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            SELECT id, organization_id, plant_id, name, is_active, updated_at_utc
            FROM cached_production_lines
            WHERE id = $id;
            """;
        command.Parameters.AddWithValue("$id", SqliteLocalStorageConverters.Id(lineId, nameof(lineId)));
        await using SqliteDataReader reader = await command.ExecuteReaderAsync(cancellationToken)
            .ConfigureAwait(false);
        return await reader.ReadAsync(cancellationToken).ConfigureAwait(false)
            ? new CachedProductionLine(
                Guid.Parse(reader.GetString(0)),
                Guid.Parse(reader.GetString(1)),
                Guid.Parse(reader.GetString(2)),
                reader.GetString(3),
                reader.GetInt64(4) == 1,
                SqliteLocalStorageConverters.ReadTimestamp(reader.GetString(5)))
            : null;
    }

    private async Task UpsertAsync(
        string sql,
        Action<SqliteCommand> addParameters,
        CancellationToken cancellationToken)
    {
        await using SqliteConnection connection = await connectionFactory
            .OpenAsync(cancellationToken)
            .ConfigureAwait(false);
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = sql;
        addParameters(command);
        await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }
}
