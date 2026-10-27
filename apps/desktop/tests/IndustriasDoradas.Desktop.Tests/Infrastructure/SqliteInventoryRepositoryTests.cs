using System.Globalization;
using System.IO;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Configuration;
using IndustriasDoradas.Desktop.Domain.Inventory;
using IndustriasDoradas.Desktop.Infrastructure.LocalStorage;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Tests.Infrastructure;

[TestClass]
public sealed class SqliteInventoryRepositoryTests
{
    private static readonly Guid OrganizationId = Guid.Parse("30000000-0000-4000-8000-000000000001");
    private static readonly Guid PlantId = Guid.Parse("31000000-0000-4000-8000-000000000001");
    private static readonly Guid StationId = Guid.Parse("34000000-0000-4000-8000-000000000001");
    private static readonly Guid ActorId = Guid.Parse("a1000000-0000-4000-8000-000000000002");
    private static readonly Guid ItemId = Guid.Parse("77200000-0000-4000-8000-000000000001");
    private static readonly DateTimeOffset Now = new(2026, 10, 26, 21, 0, 0, TimeSpan.Zero);

    [TestMethod]
    public async Task MovementAndOutboxAreAtomicAndSurviveRepositoryRestart()
    {
        await using var database = new TestDatabase();
        await database.PrepareAsync();
        var first = new SqliteInventoryRepository(database.Factory);

        LocalInventoryMovementRegistration entry = await first.RecordMovementAsync(Movement(
            Guid.Parse("77400000-0000-4000-8000-000000000001"),
            InventoryMovementType.Entry,
            10m));
        LocalInventoryMovementRegistration exit = await first.RecordMovementAsync(Movement(
            Guid.Parse("77400000-0000-4000-8000-000000000002"),
            InventoryMovementType.Exit,
            4m));

        var restarted = new SqliteInventoryRepository(database.Factory);
        IReadOnlyList<LocalInventoryStock> stocks = await restarted.ListStockAsync(OrganizationId, PlantId);
        Assert.HasCount(1, stocks);
        LocalInventoryStock stock = stocks[0];
        Assert.AreEqual(6m, stock.LocalBalance);
        Assert.AreEqual(0m, stock.CentralKnownBalance);
        Assert.AreEqual(2, stock.PendingMovementCount);
        Assert.AreEqual(1L, entry.ClientSequence);
        Assert.AreEqual(2L, exit.ClientSequence);
        Assert.AreEqual(2L, await database.ScalarAsync("SELECT COUNT(*) FROM inventory_movements;"));
        Assert.AreEqual(2L, await database.ScalarAsync("SELECT COUNT(*) FROM outbox_messages;"));
    }

    [TestMethod]
    public async Task InsufficientExitRollsBackMovementAndOutbox()
    {
        await using var database = new TestDatabase();
        await database.PrepareAsync();
        var repository = new SqliteInventoryRepository(database.Factory);
        await repository.RecordMovementAsync(Movement(
            Guid.Parse("77400000-0000-4000-8000-000000000003"),
            InventoryMovementType.Entry,
            4m));

        SqliteException error = await Assert.ThrowsExactlyAsync<SqliteException>(() =>
            repository.RecordMovementAsync(Movement(
                Guid.Parse("77400000-0000-4000-8000-000000000004"),
                InventoryMovementType.Exit,
                5m)));

        StringAssert.Contains(error.Message, "INVENTORY_STOCK_INSUFFICIENT");
        Assert.AreEqual(1L, await database.ScalarAsync("SELECT COUNT(*) FROM inventory_movements;"));
        Assert.AreEqual(1L, await database.ScalarAsync("SELECT COUNT(*) FROM outbox_messages;"));
    }

    [TestMethod]
    public async Task ReviewIsAtomicDoesNotMoveStockAndWaitsForSprint77Sync()
    {
        await using var database = new TestDatabase();
        await database.PrepareAsync();
        var repository = new SqliteInventoryRepository(database.Factory);
        await repository.RecordMovementAsync(Movement(
            Guid.Parse("77400000-0000-4000-8000-000000000005"),
            InventoryMovementType.Entry,
            5m));

        LocalInventoryReviewRegistration review = await repository.RecordReviewAsync(new(
            Guid.Parse("78000000-0000-4000-8000-000000000001"),
            OrganizationId,
            PlantId,
            StationId,
            ActorId,
            ItemId,
            4m,
            Now.AddMinutes(1),
            Now.AddMinutes(1),
            "Conteo de prueba",
            Authorization()));

        Assert.AreEqual(InventoryReviewStatus.WithDifferences, review.Status);
        Assert.AreEqual(-1m, review.Difference);
        IReadOnlyList<LocalInventoryStock> stocks = await repository.ListStockAsync(OrganizationId, PlantId);
        Assert.HasCount(1, stocks);
        Assert.AreEqual(5m, stocks[0].LocalBalance);
        Assert.AreEqual(1L, await database.ScalarAsync("SELECT COUNT(*) FROM inventory_reviews;"));
        Assert.AreEqual(1L, await database.ScalarAsync("SELECT COUNT(*) FROM inventory_review_lines;"));
        var outbox = new SqliteOutboxRepository(database.Factory);
        Assert.AreEqual(2, (await outbox.ListPendingAsync(10)).Count);
        Assert.AreEqual(0, (await outbox.ClaimAsync(StationId, Guid.NewGuid(), 10,
            Now.AddMinutes(2), Now.AddMinutes(3), Authorization())).Count);
    }

    private static RecordLocalInventoryMovement Movement(
        Guid id,
        InventoryMovementType type,
        decimal quantity) => new(
            id,
            OrganizationId,
            PlantId,
            StationId,
            ActorId,
            ItemId,
            type,
            quantity,
            Now,
            Now,
            Authorization: Authorization());

    private static OutboxAuthorizationEvidence Authorization() => new(
        ActorId,
        1,
        Now.AddHours(-1),
        Now.AddHours(8),
        "VALID");

    private sealed class TestDatabase : IAsyncDisposable
    {
        private readonly string root;

        public TestDatabase()
        {
            root = Path.Combine(Path.GetTempPath(), "industrias-doradas-inventory", Guid.NewGuid().ToString("N"));
            IOptions<LocalDatabaseOptions> databaseOptions = Options.Create(new LocalDatabaseOptions
            {
                BaseDirectory = root,
                BusyTimeoutSeconds = 2,
            });
            var path = new StationDatabasePathProvider(
                Options.Create(new StationOptions { Id = StationId }),
                databaseOptions);
            Factory = new SqliteConnectionFactory(path, databaseOptions);
        }

        public SqliteConnectionFactory Factory { get; }

        public async Task PrepareAsync()
        {
            await new SqliteDatabaseMigrator(Factory).MigrateAsync();
            await using SqliteConnection connection = await Factory.OpenAsync();
            await using SqliteCommand command = connection.CreateCommand();
            command.CommandText = $"""
                INSERT INTO inventory_item_types(
                    id, organization_id, code, name, is_custom, is_active, updated_at_utc)
                VALUES ('77000000-0000-4000-8000-000000000001', '{OrganizationId:D}',
                    'HERRAMIENTA', 'Herramienta', 0, 1, '{Now:O}');
                INSERT INTO inventory_units(
                    id, organization_id, code, name, decimal_places, is_custom, is_active, updated_at_utc)
                VALUES ('77100000-0000-4000-8000-000000000001', '{OrganizationId:D}',
                    'UNIDAD', 'unidades', 0, 0, 1, '{Now:O}');
                INSERT INTO inventory_items(
                    id, organization_id, plant_id, item_type_id, unit_id, name, is_active, updated_at_utc)
                VALUES ('{ItemId:D}', '{OrganizationId:D}', '{PlantId:D}',
                    '77000000-0000-4000-8000-000000000001',
                    '77100000-0000-4000-8000-000000000001', 'Martillo', 1, '{Now:O}');
                """;
            await command.ExecuteNonQueryAsync();
        }

        public async Task<long> ScalarAsync(string sql)
        {
            await using SqliteConnection connection = await Factory.OpenAsync();
            await using SqliteCommand command = connection.CreateCommand();
            command.CommandText = sql;
            return Convert.ToInt64(await command.ExecuteScalarAsync(), CultureInfo.InvariantCulture);
        }

        public ValueTask DisposeAsync()
        {
            SqliteConnection.ClearAllPools();
            if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
            return ValueTask.CompletedTask;
        }
    }
}
