using System.Globalization;
using System.IO;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Configuration;
using IndustriasDoradas.Desktop.Domain.Production;
using IndustriasDoradas.Desktop.Infrastructure.LocalStorage;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Tests.Infrastructure;

[TestClass]
public sealed class LocalSqliteStorageTests
{
    private static readonly Guid OrganizationId = Guid.Parse("30000000-0000-4000-8000-000000000001");
    private static readonly Guid PlantId = Guid.Parse("31000000-0000-4000-8000-000000000001");
    private static readonly Guid StationId = Guid.Parse("34000000-0000-4000-8000-000000000001");
    private static readonly Guid LineId = Guid.Parse("43000000-0000-4000-8000-000000000001");
    private static readonly Guid SupplierId = Guid.Parse("42000000-0000-4000-8000-000000000001");
    private static readonly Guid ShipmentId = Guid.Parse("41000000-0000-4000-8000-000000000001");
    private static readonly Guid CycleId = Guid.Parse("44000000-0000-4000-8000-000000000001");
    private static readonly Guid WorkerId = Guid.Parse("45000000-0000-4000-8000-000000000001");
    private static readonly DateTimeOffset StartedAt = new(2026, 8, 26, 12, 0, 0, TimeSpan.Zero);

    [TestMethod]
    public void DatabasePathIsIsolatedByStation()
    {
        string root = CreateRoot();
        try
        {
            string first = CreatePath(root, StationId);
            string second = CreatePath(root, Guid.Parse("34000000-0000-4000-8000-000000000002"));

            Assert.AreNotEqual(first, second);
            StringAssert.Contains(first, StationId.ToString("N"));
            StringAssert.EndsWith(first, "operation.sqlite3");
            Assert.IsTrue(Path.GetFullPath(first).StartsWith(Path.GetFullPath(root), StringComparison.OrdinalIgnoreCase));
        }
        finally
        {
            DeleteRoot(root);
        }
    }

    [TestMethod]
    public async Task NewDatabaseAppliesMigrationsForeignKeysWalAndSafeNativeVersion()
    {
        await using var database = new TestDatabase();

        LocalDatabaseMigrationResult result = await database.Migrator.MigrateAsync();

        Assert.AreEqual(2L, result.CurrentVersion);
        Assert.AreEqual(2, result.AppliedCount);
        Assert.AreEqual("wal", result.JournalMode, ignoreCase: true);
        await using SqliteConnection connection = await database.Factory.OpenAsync();
        Assert.AreEqual(1L, await ScalarLongAsync(connection, "PRAGMA foreign_keys;"));
        Assert.AreEqual(2L, await ScalarLongAsync(connection, "PRAGMA synchronous;"));
        Assert.AreEqual("wal", await ScalarTextAsync(connection, "PRAGMA journal_mode;"), ignoreCase: true);
        Assert.AreEqual("ok", await ScalarTextAsync(connection, "PRAGMA integrity_check;"), ignoreCase: true);
        Assert.AreEqual(0L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM pragma_foreign_key_check;"));
        Assert.IsTrue(Version.Parse(await ScalarTextAsync(connection, "SELECT sqlite_version();")) >= new Version(3, 50, 2));
        Assert.AreEqual(2L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM local_schema_migrations;"));
        Assert.AreEqual(1L, await ScalarLongAsync(
            connection,
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'production_events';"));
    }

    [TestMethod]
    public async Task RestartIsIdempotentAndPreservesCachedData()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        SqliteCatalogRepository catalogs = database.Catalogs();
        await catalogs.UpsertSupplierAsync(Supplier());

        LocalDatabaseMigrationResult secondRun = await database.Migrator.MigrateAsync();
        IReadOnlyList<CachedSupplier> suppliers = await database.Catalogs()
            .ListActiveSuppliersAsync(OrganizationId);

        Assert.AreEqual(0, secondRun.AppliedCount);
        Assert.AreEqual(1, suppliers.Count);
        Assert.AreEqual(SupplierId, suppliers[0].Id);
    }

    [TestMethod]
    public async Task UpgradeFromFirstMigrationPreservesDataAndAddsImmutability()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync([SqliteMigrationCatalog.All[0]]);
        await database.Catalogs().UpsertSupplierAsync(Supplier());

        LocalDatabaseMigrationResult result = await database.Migrator.MigrateAsync();

        Assert.AreEqual(1, result.AppliedCount);
        Assert.AreEqual(1, (await database.Catalogs().ListActiveSuppliersAsync(OrganizationId)).Count);
        await using SqliteConnection connection = await database.Factory.OpenAsync();
        Assert.AreEqual(1L, await ScalarLongAsync(
            connection,
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger' AND name = 'production_events_reject_update';"));
    }

    [TestMethod]
    public async Task ForeignKeysRejectShipmentWithoutCachedSupplierAndLine()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();

        await Assert.ThrowsExactlyAsync<SqliteException>(
            () => database.Shipments().UpsertAsync(Shipment()));
    }

    [TestMethod]
    public async Task CatalogShipmentAndOperationalSessionSurviveNewRepositoryInstances()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedContextAsync(database);
        var expected = new LocalOperationalSession(
            StationId,
            OrganizationId,
            PlantId,
            LineId,
            ShipmentId,
            CycleId,
            WorkerId,
            StartedAt,
            StartedAt.AddMinutes(1),
            LineFeedCycleStatus.Active);
        await database.Sessions().SaveAsync(expected);

        LocalOperationalSession? restored = await database.Sessions().LoadAsync(StationId);

        Assert.AreEqual(expected, restored);
    }

    [TestMethod]
    public async Task EventAndOutboxCommitAtomicallyAndCounterCanBeRebuilt()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedContextAsync(database);
        ProductionEvent productionEvent = Added(EventId(1), 1);
        var outbox = Outbox(EventId(10), productionEvent.ClientEventId);

        await database.Events().AppendWithOutboxAsync(productionEvent, outbox);

        IReadOnlyList<ProductionEvent> events = await database.Events().ListAsync(LineId, ShipmentId);
        IReadOnlyList<StoredOutboxMessage> pending = await database.Outbox().ListPendingAsync(10);
        Assert.AreEqual(1, events.Count);
        Assert.AreEqual(productionEvent, events[0]);
        Assert.AreEqual(1, ProductionEventCounter.ForLineAndShipment(events, LineId, ShipmentId));
        Assert.AreEqual(1, pending.Count);
        Assert.AreEqual(outbox, pending[0].Message);
    }

    [TestMethod]
    public async Task OutboxFailureRollsBackEventInsert()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedContextAsync(database);
        PendingOutboxMessage duplicatedOutbox = Outbox(EventId(10), EventId(1));
        await database.Events().AppendWithOutboxAsync(Added(EventId(1), 1), duplicatedOutbox);

        await Assert.ThrowsExactlyAsync<SqliteException>(
            () => database.Events().AppendWithOutboxAsync(
                Added(EventId(2), 2),
                duplicatedOutbox));

        IReadOnlyList<ProductionEvent> events = await database.Events().ListAsync(LineId, ShipmentId);
        Assert.AreEqual(1, events.Count);
        Assert.AreEqual(EventId(1), events[0].ClientEventId);
    }

    [TestMethod]
    public async Task DatabaseTriggersRejectProductionEventUpdateAndDelete()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedContextAsync(database);
        await database.Events().AppendWithOutboxAsync(
            Added(EventId(1), 1),
            Outbox(EventId(10), EventId(1)));
        await using SqliteConnection connection = await database.Factory.OpenAsync();

        await Assert.ThrowsExactlyAsync<SqliteException>(
            () => ExecuteAsync(
                connection,
                "UPDATE production_events SET client_sequence = 2 WHERE client_event_id = $id;",
                EventId(1)));
        await Assert.ThrowsExactlyAsync<SqliteException>(
            () => ExecuteAsync(
                connection,
                "DELETE FROM production_events WHERE client_event_id = $id;",
                EventId(1)));
    }

    [TestMethod]
    public async Task DiagnosticCopyIsConsistentAndIndependent()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await database.Catalogs().UpsertSupplierAsync(Supplier());
        string copyPath = await new SqliteDatabaseDiagnostics(database.Factory)
            .CreateConsistentCopyAsync(Path.Combine(database.Root, "diagnostics"));

        var copyConnectionString = new SqliteConnectionStringBuilder
        {
            DataSource = copyPath,
            Mode = SqliteOpenMode.ReadOnly,
            Pooling = false,
        };
        await using var copy = new SqliteConnection(copyConnectionString.ToString());
        await copy.OpenAsync();

        Assert.IsTrue(File.Exists(copyPath));
        Assert.AreEqual(1L, await ScalarLongAsync(copy, "SELECT COUNT(*) FROM cached_suppliers;"));
        Assert.AreEqual(2L, await ScalarLongAsync(copy, "SELECT COUNT(*) FROM local_schema_migrations;"));
    }

    private static async Task SeedContextAsync(TestDatabase database)
    {
        SqliteCatalogRepository catalogs = database.Catalogs();
        await catalogs.UpsertSupplierAsync(Supplier());
        await catalogs.UpsertWorkerAsync(new CachedWorker(
            WorkerId,
            OrganizationId,
            "Juan",
            true,
            StartedAt));
        await catalogs.UpsertLineAsync(new CachedProductionLine(
            LineId,
            OrganizationId,
            PlantId,
            "Línea 1",
            true,
            StartedAt));
        await database.Shipments().UpsertAsync(Shipment());
    }

    private static CachedSupplier Supplier() =>
        new(SupplierId, OrganizationId, "La Esperanza", true, StartedAt);

    private static CachedShipment Shipment() =>
        new(
            ShipmentId,
            OrganizationId,
            SupplierId,
            LineId,
            CycleId,
            StartedAt,
            null,
            LineFeedCycleStatus.Active);

    private static ProductionEvent Added(Guid id, long sequence) =>
        ProductionEvent.CajuelaAdded(
            id,
            ProductionEventContext.Create(
                OrganizationId,
                PlantId,
                StationId,
                LineId,
                CycleId,
                ShipmentId,
                WorkerId),
            sequence,
            StartedAt.AddMinutes(sequence),
            StartedAt.AddMinutes(sequence).AddMilliseconds(25));

    private static PendingOutboxMessage Outbox(Guid id, Guid aggregateId) =>
        new(id, "PRODUCTION_EVENT_CREATED", "production_event", aggregateId, "{}", StartedAt);

    private static Guid EventId(int suffix) =>
        Guid.Parse($"50000000-0000-4000-8000-{suffix:D12}");

    private static string CreatePath(string root, Guid stationId) =>
        new StationDatabasePathProvider(
            Options.Create(new StationOptions { Id = stationId }),
            Options.Create(new LocalDatabaseOptions { BaseDirectory = root }))
        .DatabasePath;

    private static string CreateRoot() =>
        Path.Combine(Path.GetTempPath(), "IndustriasDoradas.Tests", Guid.NewGuid().ToString("N"));

    private static async Task<long> ScalarLongAsync(SqliteConnection connection, string sql)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = sql;
        return Convert.ToInt64(await command.ExecuteScalarAsync(), CultureInfo.InvariantCulture);
    }

    private static async Task<string> ScalarTextAsync(SqliteConnection connection, string sql)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = sql;
        return Convert.ToString(await command.ExecuteScalarAsync(), CultureInfo.InvariantCulture) ?? string.Empty;
    }

    private static async Task<int> ExecuteAsync(
        SqliteConnection connection,
        string sql,
        Guid id)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = sql;
        command.Parameters.AddWithValue("$id", id.ToString("D"));
        return await command.ExecuteNonQueryAsync();
    }

    private static void DeleteRoot(string root)
    {
        SqliteConnection.ClearAllPools();
        if (Directory.Exists(root))
        {
            Directory.Delete(root, recursive: true);
        }
    }

    private sealed class TestDatabase : IAsyncDisposable
    {
        public TestDatabase()
        {
            Root = CreateRoot();
            IOptions<LocalDatabaseOptions> options = Options.Create(new LocalDatabaseOptions
            {
                BaseDirectory = Root,
                BusyTimeoutSeconds = 1,
            });
            var pathProvider = new StationDatabasePathProvider(
                Options.Create(new StationOptions { Id = StationId }),
                options);
            Factory = new SqliteConnectionFactory(pathProvider, options);
            Migrator = new SqliteDatabaseMigrator(Factory);
        }

        public string Root { get; }

        public SqliteConnectionFactory Factory { get; }

        public SqliteDatabaseMigrator Migrator { get; }

        public SqliteCatalogRepository Catalogs() => new(Factory);

        public SqliteShipmentRepository Shipments() => new(Factory);

        public SqliteOperationalSessionRepository Sessions() => new(Factory);

        public SqliteProductionEventRepository Events() => new(Factory);

        public SqliteOutboxRepository Outbox() => new(Factory);

        public ValueTask DisposeAsync()
        {
            DeleteRoot(Root);
            return ValueTask.CompletedTask;
        }
    }
}
