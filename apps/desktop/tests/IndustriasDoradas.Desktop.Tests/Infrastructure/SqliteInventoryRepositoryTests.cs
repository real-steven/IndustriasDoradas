using System.Globalization;
using System.IO;
using System.Text.Json;
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
    public async Task ReviewIsAtomicDoesNotMoveStockAndIsClaimedForSync()
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
        Assert.AreEqual(2, (await outbox.ClaimAsync(StationId, Guid.NewGuid(), 10,
            Now.AddMinutes(2), Now.AddMinutes(3), Authorization())).Count);
    }

    [TestMethod]
    public async Task RejectedOfflineExitRemainsVisibleWhileCentralBalanceConverges()
    {
        await using var database = new TestDatabase();
        await database.PrepareAsync();
        var pull = new SqliteSyncChangeRepository(database.Factory);
        await ApplyCentralMovementAsync(pull, 1,
            Guid.Parse("77400000-0000-4000-8000-000000000010"), StationId, 10m, "ENTRY");

        var inventory = new SqliteInventoryRepository(database.Factory);
        Guid rejectedId = Guid.Parse("77400000-0000-4000-8000-000000000011");
        await inventory.RecordMovementAsync(Movement(rejectedId, InventoryMovementType.Exit, 6m));
        await database.ExecuteAsync($"""
            UPDATE outbox_messages SET state = 'FAILED_REVIEW',
                last_error_code = 'INVENTORY_STOCK_INSUFFICIENT'
            WHERE aggregate_id = '{rejectedId:D}';
            """);

        await ApplyCentralMovementAsync(pull, 2,
            Guid.Parse("77400000-0000-4000-8000-000000000012"),
            Guid.Parse("34000000-0000-4000-8000-000000000002"), -6m, "EXIT");

        IReadOnlyList<LocalInventoryStock> stocks =
            await inventory.ListStockAsync(OrganizationId, PlantId);
        Assert.HasCount(1, stocks);
        LocalInventoryStock stock = stocks[0];
        Assert.AreEqual(4m, stock.CentralKnownBalance);
        Assert.AreEqual(-2m, stock.LocalBalance);
        Assert.AreEqual(1, stock.PendingMovementCount);
        Assert.AreEqual(1L, await database.ScalarAsync($"""
            SELECT COUNT(*) FROM inventory_movements
            WHERE client_movement_id = '{rejectedId:D}';
            """));
    }

    [TestMethod]
    public async Task PullPopulatesInventoryCatalogForDesktopUse()
    {
        await using var database = new TestDatabase();
        await new SqliteDatabaseMigrator(database.Factory).MigrateAsync();
        var changes = new List<SyncChange>();
        Add("INVENTORY_ITEM_TYPE", Guid.Parse("77000000-0000-4000-8000-000000000001"), $$"""
            {"id":"77000000-0000-4000-8000-000000000001",
             "organization_id":"{{OrganizationId:D}}","code":"HERRAMIENTA",
             "name":"Herramienta","is_custom":false,"is_active":true,
             "updated_at":"{{Now:O}}"}
            """);
        Add("INVENTORY_UNIT", Guid.Parse("77100000-0000-4000-8000-000000000001"), $$"""
            {"id":"77100000-0000-4000-8000-000000000001",
             "organization_id":"{{OrganizationId:D}}","code":"UNIDAD","name":"unidades",
             "decimal_places":0,"is_custom":false,"is_active":true,
             "updated_at":"{{Now:O}}"}
            """);
        Add("INVENTORY_ITEM", ItemId, $$"""
            {"id":"{{ItemId:D}}","organization_id":"{{OrganizationId:D}}",
             "plant_id":"{{PlantId:D}}",
             "item_type_id":"77000000-0000-4000-8000-000000000001",
             "unit_id":"77100000-0000-4000-8000-000000000001",
             "name":"Martillo","is_active":true,"updated_at":"{{Now:O}}"}
            """);

        await new SqliteSyncChangeRepository(database.Factory).ApplyPageAsync(
            new SyncPullPage(1, null, "inventory-catalog", false, Now, changes));

        IReadOnlyList<LocalInventoryStock> stocks = await new SqliteInventoryRepository(database.Factory)
            .ListStockAsync(OrganizationId, PlantId);
        Assert.HasCount(1, stocks);
        Assert.AreEqual("Martillo", stocks[0].Item.Name);
        Assert.AreEqual(0m, stocks[0].CentralKnownBalance);

        void Add(string type, Guid id, string json)
        {
            using JsonDocument document = JsonDocument.Parse(json);
            long sequence = changes.Count + 1;
            changes.Add(new SyncChange(Guid.NewGuid(), sequence, type, id, sequence,
                "UPSERT", Now, 1, document.RootElement.Clone()));
        }
    }

    private static async Task ApplyCentralMovementAsync(
        SqliteSyncChangeRepository repository,
        long sequence,
        Guid movementId,
        Guid stationId,
        decimal delta,
        string movementType)
    {
        using JsonDocument document = JsonDocument.Parse($$"""
            {"id":"{{movementId:D}}","organization_id":"{{OrganizationId:D}}",
             "plant_id":"{{PlantId:D}}","inventory_item_id":"{{ItemId:D}}",
             "unit_id":"77100000-0000-4000-8000-000000000001",
             "movement_type":"{{movementType}}","quantity_delta":{{delta.ToString(CultureInfo.InvariantCulture)}},
             "actor_profile_id":"{{ActorId:D}}","station_id":"{{stationId:D}}",
             "client_sequence":{{sequence}},"responsible_worker_id":null,
             "occurred_at_utc":"{{Now:O}}","recorded_at_utc":"{{Now:O}}",
             "reason":null,"destination":null,"notes":null,"related_movement_id":null}
            """);
        await repository.ApplyPageAsync(new SyncPullPage(
            1,
            sequence == 1 ? null : "inventory-1",
            $"inventory-{sequence}",
            false,
            Now,
            [new SyncChange(Guid.NewGuid(), sequence, "INVENTORY_MOVEMENT", movementId,
                sequence, "UPSERT", Now, 1, document.RootElement.Clone())]));
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

        public async Task ExecuteAsync(string sql)
        {
            await using SqliteConnection connection = await Factory.OpenAsync();
            await using SqliteCommand command = connection.CreateCommand();
            command.CommandText = sql;
            await command.ExecuteNonQueryAsync();
        }

        public ValueTask DisposeAsync()
        {
            SqliteConnection.ClearAllPools();
            if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
            return ValueTask.CompletedTask;
        }
    }
}
