using System.Globalization;
using System.IO;
using System.Text.Json;
using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Configuration;
using IndustriasDoradas.Desktop.Domain;
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
    private static readonly Guid SecondStationId = Guid.Parse("34000000-0000-4000-8000-000000000002");
    private static readonly Guid LineId = Guid.Parse("43000000-0000-4000-8000-000000000001");
    private static readonly Guid SecondLineId = Guid.Parse("43000000-0000-4000-8000-000000000002");
    private static readonly Guid ThirdLineId = Guid.Parse("43000000-0000-4000-8000-000000000003");
    private static readonly Guid FourthLineId = Guid.Parse("43000000-0000-4000-8000-000000000004");
    private static readonly Guid SupplierId = Guid.Parse("42000000-0000-4000-8000-000000000001");
    private static readonly Guid ShipmentId = Guid.Parse("41000000-0000-4000-8000-000000000001");
    private static readonly Guid CycleId = Guid.Parse("44000000-0000-4000-8000-000000000001");
    private static readonly Guid WorkerId = Guid.Parse("45000000-0000-4000-8000-000000000001");
    private static readonly Guid SecondWorkerId = Guid.Parse("45000000-0000-4000-8000-000000000002");
    private static readonly Guid ThirdWorkerId = Guid.Parse("45000000-0000-4000-8000-000000000003");
    private static readonly Guid ActorProfileId = Guid.Parse("20000000-0000-4000-8000-000000000001");
    private static readonly Guid InventoryItemTypeId = Guid.Parse("77000000-0000-4000-8000-000000000001");
    private static readonly Guid InventoryUnitId = Guid.Parse("77100000-0000-4000-8000-000000000001");
    private static readonly Guid InventoryItemId = Guid.Parse("77200000-0000-4000-8000-000000000001");
    private static readonly Guid RastraId = Guid.Parse("46000000-0000-4000-8000-000000000001");
    private static readonly Guid NoveltyCategoryId = Guid.Parse("77300000-0000-4000-8000-000000000001");
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

        Assert.AreEqual(20L, result.CurrentVersion);
        Assert.AreEqual(20, result.AppliedCount);
        Assert.AreEqual("wal", result.JournalMode, ignoreCase: true);
        await using SqliteConnection connection = await database.Factory.OpenAsync();
        Assert.AreEqual(1L, await ScalarLongAsync(connection, "PRAGMA foreign_keys;"));
        Assert.AreEqual(2L, await ScalarLongAsync(connection, "PRAGMA synchronous;"));
        Assert.AreEqual("wal", await ScalarTextAsync(connection, "PRAGMA journal_mode;"), ignoreCase: true);
        Assert.AreEqual("ok", await ScalarTextAsync(connection, "PRAGMA integrity_check;"), ignoreCase: true);
        Assert.AreEqual(0L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM pragma_foreign_key_check;"));
        Assert.IsTrue(Version.Parse(await ScalarTextAsync(connection, "SELECT sqlite_version();")) >= new Version(3, 50, 2));
        Assert.AreEqual(20L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM local_schema_migrations;"));
        Assert.AreEqual(1L, await ScalarLongAsync(
            connection,
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'production_events';"));
    }

    [TestMethod]
    public async Task InventoryMigrationUpgradesSprint6WithoutLosingExistingData()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync(SqliteMigrationCatalog.All.Take(19).ToArray());
        await SeedSelectableCatalogsAsync(database);

        LocalDatabaseMigrationResult result = await database.Migrator.MigrateAsync();

        Assert.AreEqual(20L, result.CurrentVersion);
        Assert.AreEqual(1, result.AppliedCount);
        await using SqliteConnection connection = await database.Factory.OpenAsync();
        Assert.AreEqual(3L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM cached_workers;"));
        Assert.AreEqual(9L, await ScalarLongAsync(connection, """
            SELECT COUNT(*) FROM sqlite_master
            WHERE type = 'table' AND name IN (
                'inventory_item_types', 'inventory_units', 'inventory_items',
                'inventory_movements', 'inventory_reviews', 'inventory_review_lines',
                'rastra_component_changes', 'operational_novelty_categories',
                'operational_novelty_changes');
            """));
        Assert.AreEqual(0L, await ScalarLongAsync(connection, """
            SELECT COUNT(*)
            FROM pragma_table_info('inventory_items')
            WHERE lower(name) IN ('stock', 'balance', 'quantity');
            """));
    }

    [TestMethod]
    public async Task InventoryLedgerDerivesExactBalanceAndRejectsInvalidHistory()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedSelectableCatalogsAsync(database);
        await SeedInventoryCatalogAsync(database);
        await using SqliteConnection connection = await database.Factory.OpenAsync();
        const string entryId = "77400000-0000-4000-8000-000000000001";
        const string exitId = "77400000-0000-4000-8000-000000000002";
        const string returnId = "77400000-0000-4000-8000-000000000003";
        const string adjustmentId = "77400000-0000-4000-8000-000000000004";
        const string reversalId = "77400000-0000-4000-8000-000000000005";

        await ExecuteWithoutParametersAsync(connection, $"""
            INSERT INTO inventory_movements(
                client_movement_id, organization_id, plant_id, inventory_item_id, unit_id,
                movement_type, quantity_delta_milliunits, actor_profile_id, station_id,
                client_sequence, responsible_worker_id, occurred_at_utc, recorded_at_utc,
                reason, destination, notes, related_movement_id)
            VALUES
                ('{entryId}', '{OrganizationId:D}', '{PlantId:D}', '{InventoryItemId:D}',
                 '{InventoryUnitId:D}', 'ENTRY', 10000, '{ActorProfileId:D}', '{StationId:D}',
                 701, NULL, '{StartedAt:O}', '{StartedAt:O}', NULL, NULL, 'Entrada inicial', NULL),
                ('{exitId}', '{OrganizationId:D}', '{PlantId:D}', '{InventoryItemId:D}',
                 '{InventoryUnitId:D}', 'EXIT', -4000, '{ActorProfileId:D}', '{StationId:D}',
                 702, '{WorkerId:D}', '{StartedAt.AddMinutes(1):O}',
                 '{StartedAt.AddMinutes(1):O}', NULL, 'Planta', NULL, NULL),
                ('{returnId}', '{OrganizationId:D}', '{PlantId:D}', '{InventoryItemId:D}',
                 '{InventoryUnitId:D}', 'RETURN', 2000, '{ActorProfileId:D}', '{StationId:D}',
                 703, '{WorkerId:D}', '{StartedAt.AddMinutes(2):O}',
                 '{StartedAt.AddMinutes(2):O}', NULL, NULL, NULL, '{exitId}'),
                ('{adjustmentId}', '{OrganizationId:D}', '{PlantId:D}', '{InventoryItemId:D}',
                 '{InventoryUnitId:D}', 'ADJUSTMENT', -1000, '{ActorProfileId:D}', '{StationId:D}',
                 704, NULL, '{StartedAt.AddMinutes(3):O}', '{StartedAt.AddMinutes(3):O}',
                 'Diferencia en conteo físico', NULL, NULL, NULL),
                ('{reversalId}', '{OrganizationId:D}', '{PlantId:D}', '{InventoryItemId:D}',
                 '{InventoryUnitId:D}', 'REVERSAL', 1000, '{ActorProfileId:D}', '{StationId:D}',
                 705, NULL, '{StartedAt.AddMinutes(4):O}', '{StartedAt.AddMinutes(4):O}',
                 'Corrección del ajuste', NULL, NULL, '{adjustmentId}');

            INSERT INTO inventory_reviews(
                id, organization_id, plant_id, status, reviewed_by_profile_id,
                station_id, client_sequence, reviewed_at_utc, recorded_at_utc, notes)
            VALUES ('77500000-0000-4000-8000-000000000001', '{OrganizationId:D}',
                '{PlantId:D}', 'WITH_DIFFERENCES', '{ActorProfileId:D}', '{StationId:D}', 706,
                '{StartedAt.AddMinutes(5):O}', '{StartedAt.AddMinutes(5):O}', 'Conteo de cierre');

            INSERT INTO inventory_review_lines(
                organization_id, plant_id, review_id, inventory_item_id, unit_id,
                expected_milliunits, counted_milliunits, difference_milliunits)
            VALUES ('{OrganizationId:D}', '{PlantId:D}',
                '77500000-0000-4000-8000-000000000001', '{InventoryItemId:D}',
                '{InventoryUnitId:D}', 8000, 7000, -1000);
            """);

        Assert.AreEqual(8000L, await ScalarLongAsync(connection, "SELECT SUM(quantity_delta_milliunits) FROM inventory_movements;"));
        Assert.AreEqual(5L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM inventory_movements;"));
        Assert.AreEqual(-1000L, await ScalarLongAsync(connection, "SELECT difference_milliunits FROM inventory_review_lines;"));

        SqliteException negativeStock = await Assert.ThrowsExactlyAsync<SqliteException>(() =>
            ExecuteWithoutParametersAsync(connection, $"""
                INSERT INTO inventory_movements(
                    client_movement_id, organization_id, plant_id, inventory_item_id, unit_id,
                    movement_type, quantity_delta_milliunits, actor_profile_id,
                    occurred_at_utc, recorded_at_utc)
                VALUES ('77400000-0000-4000-8000-000000000006', '{OrganizationId:D}',
                    '{PlantId:D}', '{InventoryItemId:D}', '{InventoryUnitId:D}', 'CONSUMPTION',
                    -9000, '{ActorProfileId:D}', '{StartedAt.AddMinutes(6):O}',
                    '{StartedAt.AddMinutes(6):O}');
                """));
        StringAssert.Contains(negativeStock.Message, "INVENTORY_STOCK_INSUFFICIENT");

        SqliteException wrongPrecision = await Assert.ThrowsExactlyAsync<SqliteException>(() =>
            ExecuteWithoutParametersAsync(connection, $"""
                INSERT INTO inventory_movements(
                    client_movement_id, organization_id, plant_id, inventory_item_id, unit_id,
                    movement_type, quantity_delta_milliunits, actor_profile_id,
                    occurred_at_utc, recorded_at_utc)
                VALUES ('77400000-0000-4000-8000-000000000007', '{OrganizationId:D}',
                    '{PlantId:D}', '{InventoryItemId:D}', '{InventoryUnitId:D}', 'ENTRY',
                    500, '{ActorProfileId:D}', '{StartedAt.AddMinutes(7):O}',
                    '{StartedAt.AddMinutes(7):O}');
                """));
        StringAssert.Contains(wrongPrecision.Message, "INVENTORY_ITEM_UNIT_OR_PRECISION_MISMATCH");

        SqliteException excessiveReturn = await Assert.ThrowsExactlyAsync<SqliteException>(() =>
            ExecuteWithoutParametersAsync(connection, $"""
                INSERT INTO inventory_movements(
                    client_movement_id, organization_id, plant_id, inventory_item_id, unit_id,
                    movement_type, quantity_delta_milliunits, actor_profile_id,
                    occurred_at_utc, recorded_at_utc, related_movement_id)
                VALUES ('77400000-0000-4000-8000-000000000008', '{OrganizationId:D}',
                    '{PlantId:D}', '{InventoryItemId:D}', '{InventoryUnitId:D}', 'RETURN',
                    3000, '{ActorProfileId:D}', '{StartedAt.AddMinutes(8):O}',
                    '{StartedAt.AddMinutes(8):O}', '{exitId}');
                """));
        StringAssert.Contains(excessiveReturn.Message, "INVENTORY_RETURN_EXCEEDS_EXIT");

        SqliteException mutation = await Assert.ThrowsExactlyAsync<SqliteException>(() =>
            ExecuteWithoutParametersAsync(connection, $"""
                UPDATE inventory_movements SET notes = 'alterado'
                WHERE client_movement_id = '{entryId}';
                """));
        StringAssert.Contains(mutation.Message, "INVENTORY_HISTORY_IS_APPEND_ONLY");
    }

    [TestMethod]
    public async Task ComponentAndNoveltyHistoryRetainsReplacementsAndRealTimes()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedSelectableCatalogsAsync(database);
        await SeedInventoryCatalogAsync(database);
        await SeedRastraAsync(database, RastraId);
        await using SqliteConnection connection = await database.Factory.OpenAsync();
        const string installationA = "77600000-0000-4000-8000-000000000001";
        const string installationB = "77600000-0000-4000-8000-000000000002";
        const string installationC = "77600000-0000-4000-8000-000000000003";
        const string noveltyId = "77700000-0000-4000-8000-000000000001";
        const string openedAt = "2026-08-26T23:30:00.0000000+00:00";
        const string closedAt = "2026-08-27T01:15:00.0000000+00:00";

        await ExecuteWithoutParametersAsync(connection, $"""
            INSERT INTO operational_novelty_categories(
                id, organization_id, code, name, is_active, updated_at_utc)
            VALUES ('{NoveltyCategoryId:D}', '{OrganizationId:D}', 'FALLA_EQUIPO',
                'Falla de equipo', 1, '{StartedAt:O}');

            INSERT INTO rastra_component_changes(
                client_change_id, organization_id, plant_id, rastra_id, change_type,
                installation_id, replaced_installation_id, inventory_item_id, unit_id,
                quantity_milliunits, actor_profile_id, responsible_worker_id,
                occurred_at_utc, recorded_at_utc, component_identifier,
                installed_condition, removed_condition, reason)
            VALUES
                ('77800000-0000-4000-8000-000000000001', '{OrganizationId:D}',
                 '{PlantId:D}', '{RastraId:D}', 'INSTALLATION', '{installationA}', NULL,
                 '{InventoryItemId:D}', '{InventoryUnitId:D}', 1000, '{ActorProfileId:D}',
                 '{WorkerId:D}', '{StartedAt.AddMinutes(10):O}', '{StartedAt.AddMinutes(10):O}',
                 'CADENA-A', 'Nueva', NULL, NULL),
                ('77800000-0000-4000-8000-000000000002', '{OrganizationId:D}',
                 '{PlantId:D}', '{RastraId:D}', 'REPLACEMENT', '{installationB}', '{installationA}',
                 '{InventoryItemId:D}', '{InventoryUnitId:D}', 1000, '{ActorProfileId:D}',
                 '{WorkerId:D}', '{StartedAt.AddMinutes(20):O}', '{StartedAt.AddMinutes(20):O}',
                 'CADENA-B', 'Nueva', 'Desgastada', 'Desgaste normal'),
                ('77800000-0000-4000-8000-000000000003', '{OrganizationId:D}',
                 '{PlantId:D}', '{RastraId:D}', 'REPLACEMENT', '{installationC}', '{installationB}',
                 '{InventoryItemId:D}', '{InventoryUnitId:D}', 1000, '{ActorProfileId:D}',
                 '{WorkerId:D}', '{StartedAt.AddMinutes(30):O}', '{StartedAt.AddMinutes(30):O}',
                 'CADENA-C', 'Nueva', 'Dañada', 'Rotura');

            INSERT INTO operational_novelty_changes(
                client_change_id, novelty_id, organization_id, plant_id, change_type,
                line_id, category_id, description, actor_profile_id, responsible_worker_id,
                occurred_at_utc, recorded_at_utc)
            VALUES
                ('77900000-0000-4000-8000-000000000001', '{noveltyId}', '{OrganizationId:D}',
                 '{PlantId:D}', 'OPENING', '{LineId:D}', '{NoveltyCategoryId:D}',
                 'Rastra detenida por cadena dañada', '{ActorProfileId:D}', '{WorkerId:D}',
                 '{openedAt}', '{openedAt}'),
                ('77900000-0000-4000-8000-000000000002', '{noveltyId}', '{OrganizationId:D}',
                 '{PlantId:D}', 'CLOSURE', NULL, NULL, NULL, '{ActorProfileId:D}',
                 '{WorkerId:D}', '{closedAt}', '{closedAt}');
            """);

        Assert.AreEqual(3L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM rastra_component_changes;"));
        Assert.AreEqual(1L, await ScalarLongAsync(connection, """
            SELECT COUNT(*)
            FROM rastra_component_changes AS installed
            WHERE installed.change_type IN ('INSTALLATION', 'REPLACEMENT')
              AND NOT EXISTS (
                  SELECT 1 FROM rastra_component_changes AS closed
                  WHERE closed.organization_id = installed.organization_id
                    AND closed.change_type IN ('REMOVAL', 'REPLACEMENT')
                    AND (CASE WHEN closed.change_type = 'REMOVAL'
                              THEN closed.installation_id ELSE closed.replaced_installation_id END)
                        = installed.installation_id);
            """));
        Assert.AreEqual(2L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM operational_novelty_changes;"));
        Assert.AreEqual(openedAt, await ScalarTextAsync(connection, """
            SELECT occurred_at_utc FROM operational_novelty_changes WHERE change_type = 'OPENING';
            """));
        Assert.AreEqual(closedAt, await ScalarTextAsync(connection, """
            SELECT occurred_at_utc FROM operational_novelty_changes WHERE change_type = 'CLOSURE';
            """));

        SqliteException mutation = await Assert.ThrowsExactlyAsync<SqliteException>(() =>
            ExecuteWithoutParametersAsync(connection, $"""
                UPDATE operational_novelty_changes SET description = 'alterada'
                WHERE novelty_id = '{noveltyId}';
                """));
        StringAssert.Contains(mutation.Message, "INVENTORY_HISTORY_IS_APPEND_ONLY");
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
    public async Task OnlineStationSnapshotRaisesSequenceFloorForANewLocalDatabase()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedSelectableCatalogsAsync(database);
        await database.Outbox().EnsureNextAsync(StationId, 50, StartedAt);

        await StartOperationAsync(database.OperationService(new MutableTimeProvider(StartedAt)));

        await using SqliteConnection connection = await database.Factory.OpenAsync();
        Assert.AreEqual(50L, await ScalarLongAsync(
            connection,
            "SELECT station_sequence FROM outbox_messages WHERE operation_type = 'OPERATION_STARTED';"));
    }

    [TestMethod]
    public async Task OnlineStationSnapshotAlsoRaisesProductionEventSequenceForANewLocalDatabase()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedSelectableCatalogsAsync(database);
        await database.Outbox().EnsureNextAsync(StationId, 50, StartedAt);
        await StartOperationAsync(database.OperationService(new MutableTimeProvider(StartedAt)));
        var time = new MutableTimeProvider(StartedAt.AddSeconds(1));
        RegisterCajuelaHandler handler = database.RegisterHandler(time);

        RegisterCajuelaResult result = await handler.ExecuteAsync(handler.CreateCommand(StationId));

        Assert.AreEqual(50L, result.Event.ClientSequence);
        await using SqliteConnection connection = await database.Factory.OpenAsync();
        Assert.AreEqual(51L, await ScalarLongAsync(
            connection,
            "SELECT station_sequence FROM outbox_messages WHERE operation_type = 'PRODUCTION_EVENT_CREATED';"));
    }

    [TestMethod]
    public async Task UpgradeFromFirstMigrationPreservesDataAndAddsImmutability()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync([SqliteMigrationCatalog.All[0]]);
        await database.Catalogs().UpsertSupplierAsync(Supplier());

        LocalDatabaseMigrationResult result = await database.Migrator.MigrateAsync();

        Assert.AreEqual(19, result.AppliedCount);
        Assert.AreEqual(1, (await database.Catalogs().ListActiveSuppliersAsync(OrganizationId)).Count);
        await using SqliteConnection connection = await database.Factory.OpenAsync();
        Assert.AreEqual(1L, await ScalarLongAsync(
            connection,
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger' AND name = 'production_events_reject_update';"));
    }

    [TestMethod]
    public async Task UpgradeFromSprint3PreservesProductionAndKeepsGoldOutOfDesktop()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync(SqliteMigrationCatalog.All.Take(11).ToArray());
        await SeedContextAsync(database);
        await database.Events().AppendWithOutboxAsync(
            Added(EventId(1), 1),
            Outbox(EventId(10), EventId(1)));

        LocalDatabaseMigrationResult result = await database.Migrator.MigrateAsync();

        Assert.AreEqual(20L, result.CurrentVersion);
        Assert.AreEqual(9, result.AppliedCount);
        await using SqliteConnection connection = await database.Factory.OpenAsync();
        Assert.AreEqual(1L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM cached_shipments;"));
        Assert.AreEqual(1L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM production_events;"));
        Assert.AreEqual(1L, await ScalarLongAsync(connection, """
            SELECT COUNT(*) FROM sqlite_master
            WHERE type = 'table' AND name = 'production_sweeps';
            """));
        Assert.AreEqual(1L, await ScalarLongAsync(connection, """
            SELECT COUNT(*) FROM sqlite_master
            WHERE type = 'table' AND name = 'mercury_movements';
            """));
        Assert.AreEqual(0L, await ScalarLongAsync(connection, """
            SELECT COUNT(*) FROM sqlite_master
            WHERE type = 'table' AND lower(name) LIKE '%gold%';
            """));
        Assert.AreEqual(0L, await ScalarLongAsync(connection, """
            SELECT COUNT(*)
            FROM pragma_table_list() AS tables
            JOIN pragma_table_info(tables.name) AS columns
            WHERE lower(columns.name) LIKE '%gold%';
            """));
    }

    [TestMethod]
    public async Task SweepEventsCannotOverlapAndMercuryBelongsToARastra()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedContextAsync(database);
        await database.Events().AppendWithOutboxAsync(
            Added(EventId(1), 1),
            Outbox(EventId(10), EventId(1)));
        await using SqliteConnection connection = await database.Factory.OpenAsync();

        const string rastraId = "46000000-0000-4000-8000-000000000001";
        const string molinoId = "46000000-0000-4000-8000-000000000002";
        const string sweepId = "47000000-0000-4000-8000-000000000001";
        const string secondSweepId = "47000000-0000-4000-8000-000000000002";
        await ExecuteWithoutParametersAsync(connection, $"""
            INSERT INTO cached_line_components(
                id, organization_id, line_id, component_type_code, code, name,
                display_order, is_active, updated_at_utc)
            VALUES
                ('{rastraId}', '{OrganizationId:D}', '{LineId:D}', 'RASTRA',
                 'RASTRA_1', 'Rastra 1', 1, 1, '{StartedAt:O}'),
                ('{molinoId}', '{OrganizationId:D}', '{LineId:D}', 'MOLINO',
                 'MOLINO_1', 'Molino 1', 2, 1, '{StartedAt:O}');

            INSERT INTO production_sweeps(
                id, organization_id, plant_id, station_id, line_id, feed_cycle_id,
                shipment_id, client_sequence, cajuela_count, swept_at_utc,
                recorded_at_utc, recorded_by_profile_id, is_final)
            VALUES ('{sweepId}', '{OrganizationId:D}', '{PlantId:D}', '{StationId:D}',
                '{LineId:D}', '{CycleId:D}', '{ShipmentId:D}', 200, 1,
                '{StartedAt.AddMinutes(1):O}', '{StartedAt.AddMinutes(1):O}',
                '{ActorProfileId:D}', 0);

            INSERT INTO sweep_production_events(
                organization_id, sweep_id, production_event_id, shipment_id,
                line_id, feed_cycle_id)
            VALUES ('{OrganizationId:D}', '{sweepId}', '{EventId(1):D}',
                '{ShipmentId:D}', '{LineId:D}', '{CycleId:D}');

            INSERT INTO mercury_movements(
                id, organization_id, plant_id, station_id, line_id, feed_cycle_id,
                shipment_id, line_component_id, sweep_id, client_sequence,
                movement_kind, amount_centigrams, occurred_at_utc, recorded_at_utc,
                recorded_by_profile_id)
            VALUES ('48000000-0000-4000-8000-000000000001', '{OrganizationId:D}',
                '{PlantId:D}', '{StationId:D}', '{LineId:D}', '{CycleId:D}',
                '{ShipmentId:D}', '{rastraId}', '{sweepId}', 201, 'RECOVERY', NULL,
                '{StartedAt.AddMinutes(1):O}', '{StartedAt.AddMinutes(1):O}',
                '{ActorProfileId:D}');
            """);

        Assert.AreEqual(1L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM sweep_production_events;"));
        Assert.AreEqual(1L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM mercury_movements WHERE amount_centigrams IS NULL;"));

        await ExecuteWithoutParametersAsync(connection, $"""
            INSERT INTO production_sweeps(
                id, organization_id, plant_id, station_id, line_id, feed_cycle_id,
                shipment_id, client_sequence, cajuela_count, swept_at_utc,
                recorded_at_utc, recorded_by_profile_id, is_final)
            VALUES ('{secondSweepId}', '{OrganizationId:D}', '{PlantId:D}', '{StationId:D}',
                '{LineId:D}', '{CycleId:D}', '{ShipmentId:D}', 202, 1,
                '{StartedAt.AddMinutes(2):O}', '{StartedAt.AddMinutes(2):O}',
                '{ActorProfileId:D}', 0);
            """);

        await Assert.ThrowsExactlyAsync<SqliteException>(() => ExecuteWithoutParametersAsync(
            connection,
            $"""
                INSERT INTO sweep_production_events(
                    organization_id, sweep_id, production_event_id, shipment_id,
                    line_id, feed_cycle_id)
                VALUES ('{OrganizationId:D}', '{secondSweepId}', '{EventId(1):D}',
                    '{ShipmentId:D}', '{LineId:D}', '{CycleId:D}');
                """));

        await Assert.ThrowsExactlyAsync<SqliteException>(() => ExecuteWithoutParametersAsync(
            connection,
            $"""
                INSERT INTO mercury_movements(
                    id, organization_id, plant_id, station_id, line_id, feed_cycle_id,
                    shipment_id, line_component_id, client_sequence, movement_kind,
                    amount_centigrams, occurred_at_utc, recorded_at_utc,
                    recorded_by_profile_id)
                VALUES ('48000000-0000-4000-8000-000000000002', '{OrganizationId:D}',
                    '{PlantId:D}', '{StationId:D}', '{LineId:D}', '{CycleId:D}',
                    '{ShipmentId:D}', '{molinoId}', 203, 'INITIAL_LOAD', 100,
                    '{StartedAt.AddMinutes(2):O}', '{StartedAt.AddMinutes(2):O}',
                    '{ActorProfileId:D}');
                """));
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
    public async Task AnonymousInputMetricsArePersistentReadableAndImmutable()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        var metric = new LocalOperationInputMetric(
            EventId(90),
            OperationInputAction.RegisterCajuela,
            "KEYBOARD",
            OperationInputMetricOutcome.Suppressed,
            1.25,
            42,
            false,
            "DEBOUNCE",
            StartedAt,
            StartedAt.AddMilliseconds(2));

        await database.Metrics().AppendAsync(metric);
        LocalOperationInputMetric restored = (await database.Metrics().ListRecentAsync(10)).Single();

        Assert.AreEqual(metric, restored);
        await using SqliteConnection connection = await database.Factory.OpenAsync();
        Assert.AreEqual(0L, await ScalarLongAsync(connection, """
            SELECT COUNT(*) FROM pragma_table_info('operation_input_metrics')
            WHERE lower(name) GLOB '*worker*' OR lower(name) GLOB '*shipment*'
               OR lower(name) GLOB '*controller*' OR lower(name) GLOB '*event*'
               OR lower(name) GLOB '*supplier*';
            """));
        await Assert.ThrowsExactlyAsync<SqliteException>(() => ExecuteWithoutParametersAsync(
            connection,
            "UPDATE operation_input_metrics SET latency_ms = 2 WHERE id = '50000000-0000-4000-8000-000000000090';"));
        await Assert.ThrowsExactlyAsync<SqliteException>(() => ExecuteWithoutParametersAsync(
            connection,
            "DELETE FROM operation_input_metrics;"));
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
        Assert.AreEqual(20L, await ScalarLongAsync(copy, "SELECT COUNT(*) FROM local_schema_migrations;"));
    }

    [TestMethod]
    public async Task LocalHealthReportsIntegrityPendingMessagesAndClockRollback()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedSelectableCatalogsAsync(database);
        var time = new MutableTimeProvider(StartedAt);
        LocalOperationContext operation = await StartOperationAsync(database.OperationService(time));
        time.SetUtcNow(StartedAt.AddMinutes(1));
        await database.RegisterHandler(time).ExecuteAsync(database.RegisterHandler(time).CreateCommand(StationId));
        var diagnostics = new SqliteDatabaseDiagnostics(
            database.Factory,
            time,
            Options.Create(new LocalRecoveryOptions()));

        LocalDatabaseHealth healthy = await diagnostics.InspectAsync();

        Assert.AreEqual(LocalDatabaseHealthState.Healthy, healthy.State);
        Assert.AreEqual(2, healthy.PendingOutboxCount);
        Assert.AreEqual(operation.Session!.ShipmentId, (await database.Sessions().LoadAsync(StationId))!.ShipmentId);

        time.SetUtcNow(StartedAt.AddMinutes(-10));
        LocalDatabaseHealth rolledBack = await diagnostics.InspectAsync();

        Assert.AreEqual(LocalDatabaseHealthState.Unavailable, rolledBack.State);
        Assert.AreEqual(LocalDatabaseHealthIssue.ClockRollback, rolledBack.Issue);
    }

    [TestMethod]
    public async Task BackwardClockRejectsNewEventWithoutChangingCounterOrOutbox()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedSelectableCatalogsAsync(database);
        var time = new MutableTimeProvider(StartedAt);
        LocalOperationContext operation = await StartOperationAsync(database.OperationService(time));
        time.SetUtcNow(StartedAt.AddMinutes(1));
        RegisterCajuelaHandler handler = database.RegisterHandler(time);
        await handler.ExecuteAsync(handler.CreateCommand(StationId));
        time.SetUtcNow(StartedAt.AddMinutes(-10));

        await Assert.ThrowsExactlyAsync<LocalClockRollbackException>(
            () => handler.ExecuteAsync(handler.CreateCommand(StationId)));

        Assert.AreEqual(1, await database.Cajuelas().GetTotalAsync(LineId, operation.Session!.ShipmentId));
        Assert.AreEqual(2, (await database.Outbox().ListPendingAsync(10)).Count);
    }

    [TestMethod]
    public async Task CommittedRegistrationSurvivesAbruptProcessStyleRestart()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedSelectableCatalogsAsync(database);
        var time = new MutableTimeProvider(StartedAt);
        LocalOperationContext operation = await StartOperationAsync(database.OperationService(time));
        time.SetUtcNow(StartedAt.AddSeconds(1));
        await database.RegisterHandler(time).ExecuteAsync(database.RegisterHandler(time).CreateCommand(StationId));

        SqliteConnection.ClearAllPools();
        var restartedCajuelas = new SqliteCajuelaRepository(database.Factory);
        var restartedOutbox = new SqliteOutboxRepository(database.Factory);

        Assert.AreEqual(1, await restartedCajuelas.GetTotalAsync(LineId, operation.Session!.ShipmentId));
        Assert.AreEqual(2, (await restartedOutbox.ListPendingAsync(10)).Count);
        await using SqliteConnection connection = await database.Factory.OpenAsync();
        Assert.AreEqual("ok", await ScalarTextAsync(connection, "PRAGMA integrity_check;"), ignoreCase: true);
    }

    [TestMethod]
    public async Task CorruptDatabaseIsReportedWithoutReplacingTheOriginalFile()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        SqliteConnection.ClearAllPools();
        byte[] corruptContent = "not-a-sqlite-database"u8.ToArray();
        await File.WriteAllBytesAsync(database.Factory.DatabasePath, corruptContent);
        var diagnostics = new SqliteDatabaseDiagnostics(
            database.Factory,
            new MutableTimeProvider(StartedAt),
            Options.Create(new LocalRecoveryOptions()));

        LocalDatabaseHealth result = await diagnostics.InspectAsync();

        Assert.AreEqual(LocalDatabaseHealthState.Unavailable, result.State);
        Assert.AreEqual(LocalDatabaseHealthIssue.Corrupt, result.Issue);
        SqliteConnection.ClearAllPools();
        CollectionAssert.AreEqual(corruptContent, await File.ReadAllBytesAsync(database.Factory.DatabasePath));
    }

    [TestMethod]
    public async Task ConcurrentWriterLockIsClassifiedAndLeavesDatabaseIntact()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await using SqliteConnection blocker = await database.Factory.OpenAsync();
        await using SqliteCommand begin = blocker.CreateCommand();
        begin.CommandText = "BEGIN IMMEDIATE;";
        await begin.ExecuteNonQueryAsync();
        await using SqliteConnection contender = await database.Factory.OpenAsync();
        await using SqliteCommand write = contender.CreateCommand();
        write.CommandText = "BEGIN IMMEDIATE;";

        SqliteException exception = await Assert.ThrowsExactlyAsync<SqliteException>(
            () => write.ExecuteNonQueryAsync());
        LocalStorageFailure failure = LocalStorageFailureClassifier.Classify(exception);

        Assert.AreEqual(LocalStorageFailureKind.Locked, failure.Kind);
        await using SqliteCommand rollback = blocker.CreateCommand();
        rollback.CommandText = "ROLLBACK;";
        await rollback.ExecuteNonQueryAsync();
        Assert.AreEqual("ok", await ScalarTextAsync(blocker, "PRAGMA integrity_check;"), ignoreCase: true);
    }

    [TestMethod]
    public async Task SqliteFullFailureIsClassifiedWithoutPartialOperationalWrite()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await using SqliteConnection connection = await database.Factory.OpenAsync();
        await using SqliteCommand limit = connection.CreateCommand();
        limit.CommandText = "CREATE TABLE simulated_fill(data BLOB);";
        await limit.ExecuteNonQueryAsync();
        long pages = await ScalarLongAsync(connection, "PRAGMA page_count;");
        limit.CommandText = $"PRAGMA max_page_count = {pages};";
        await limit.ExecuteNonQueryAsync();
        await using SqliteCommand fill = connection.CreateCommand();
        fill.CommandText = "INSERT INTO simulated_fill(data) VALUES (zeroblob(10485760));";

        SqliteException exception = await Assert.ThrowsExactlyAsync<SqliteException>(
            () => fill.ExecuteNonQueryAsync());

        Assert.AreEqual(LocalStorageFailureKind.DiskFull, LocalStorageFailureClassifier.Classify(exception).Kind);
        Assert.AreEqual(0L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM production_events;"));
        Assert.AreEqual(0L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM outbox_messages;"));
    }

    [TestMethod]
    public async Task CounterMigrationRebuildsReadModelFromExistingEvents()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync(SqliteMigrationCatalog.All.Take(2).ToArray());
        await SeedContextAsync(database, seedStationLineScope: false);
        await InsertLegacyEventWithOutboxAsync(database.Factory);

        LocalDatabaseMigrationResult result = await database.Migrator.MigrateAsync();

        Assert.AreEqual(18, result.AppliedCount);
        Assert.AreEqual(1, await database.Cajuelas().GetTotalAsync(LineId, ShipmentId));
        await using SqliteConnection connection = await database.Factory.OpenAsync();
        Assert.AreEqual(1L, await ScalarLongAsync(
            connection,
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'production_event_corrections';"));
    }

    [TestMethod]
    public async Task OutboxClaimRetriesWithLeaseAndStoresCentralReceipt()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedContextAsync(database);
        var capturedAuthorization = new OutboxAuthorizationEvidence(
            ActorProfileId, 4, StartedAt.AddHours(-1), StartedAt.AddHours(24), "VALID");
        PendingOutboxMessage message = Outbox(EventId(10), EventId(1)) with
        {
            Authorization = capturedAuthorization,
        };
        await database.Events().AppendWithOutboxAsync(Added(EventId(1), 1), message);
        var currentAuthorization = new OutboxAuthorizationEvidence(
            Guid.NewGuid(), 9, StartedAt, StartedAt.AddHours(48), "VALID");
        Guid firstClaim = Guid.NewGuid();

        IReadOnlyList<ClaimedOutboxMessage> first = await database.Outbox().ClaimAsync(
            StationId, firstClaim, 10, StartedAt.AddMinutes(2), StartedAt.AddMinutes(3), currentAuthorization);

        Assert.AreEqual(1, first.Count);
        Assert.AreEqual(1L, first[0].StationSequence);
        Assert.AreEqual(1, first[0].AttemptCount);
        Assert.AreEqual(ActorProfileId, first[0].Authorization.ActorProfileId);
        await database.Outbox().CompleteClaimAsync(
            firstClaim,
            [new(message.Id, "RETRY_LATER", "NETWORK_UNAVAILABLE", null)],
            StartedAt.AddMinutes(2),
            _ => TimeSpan.FromSeconds(10));
        Assert.AreEqual(0, (await database.Outbox().ClaimAsync(
            StationId, Guid.NewGuid(), 10, StartedAt.AddMinutes(2).AddSeconds(9),
            StartedAt.AddMinutes(4), currentAuthorization)).Count);

        Guid secondClaim = Guid.NewGuid();
        IReadOnlyList<ClaimedOutboxMessage> second = await database.Outbox().ClaimAsync(
            StationId, secondClaim, 10, StartedAt.AddMinutes(2).AddSeconds(10),
            StartedAt.AddMinutes(4), currentAuthorization);
        Guid receiptId = Guid.NewGuid();
        Assert.AreEqual(2, second[0].AttemptCount);
        await database.Outbox().CompleteClaimAsync(
            secondClaim,
            [new(message.Id, "APPLIED", "APPLIED", receiptId)],
            StartedAt.AddMinutes(2).AddSeconds(11),
            _ => TimeSpan.Zero);

        await using SqliteConnection connection = await database.Factory.OpenAsync();
        Assert.AreEqual("SYNCED", await ScalarTextAsync(
            connection, "SELECT state FROM outbox_messages WHERE id = '50000000-0000-4000-8000-000000000010';"));
        Assert.AreEqual(receiptId.ToString("D"), await ScalarTextAsync(
            connection, "SELECT central_receipt_id FROM outbox_messages WHERE id = '50000000-0000-4000-8000-000000000010';"));
    }

    [TestMethod]
    [TestCategory("SyncChaos")]
    public async Task ExpiredOutboxLeaseIsRecoveredAfterRestart()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedContextAsync(database);
        await database.Events().AppendWithOutboxAsync(Added(EventId(1), 1), Outbox(EventId(10), EventId(1)));
        var authorization = new OutboxAuthorizationEvidence(
            ActorProfileId, 1, StartedAt.AddHours(-1), StartedAt.AddHours(24), "VALID");
        await database.Outbox().ClaimAsync(
            StationId, Guid.NewGuid(), 10, StartedAt, StartedAt.AddMinutes(1), authorization);

        IReadOnlyList<ClaimedOutboxMessage> recovered = await database.Outbox().ClaimAsync(
            StationId, Guid.NewGuid(), 10, StartedAt.AddMinutes(1), StartedAt.AddMinutes(2), authorization);

        Assert.AreEqual(1, recovered.Count);
        Assert.AreEqual(2, recovered[0].AttemptCount);
    }

    [TestMethod]
    public async Task DashboardSnapshotCombinesActiveContextCounterReliefAndPendingOutbox()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedSelectableCatalogsAsync(database);
        var time = new MutableTimeProvider(StartedAt);
        LocalOperationService operations = database.OperationService(time);
        LocalOperationContext started = await StartOperationAsync(operations);
        time.SetUtcNow(StartedAt.AddHours(1));
        PreparedResponsibleRelief relief = await operations.PrepareReliefAsync(
            SecondWorkerId,
            Authority());
        await operations.ConfirmReliefAsync(relief);
        time.SetUtcNow(StartedAt.AddHours(1).AddMinutes(1));
        await database.RegisterHandler(time).ExecuteAsync(
            database.RegisterHandler(time).CreateCommand(StationId));

        LocalOperationDashboardSnapshot snapshot = await database.Dashboard().GetAsync(StationId);

        Assert.IsTrue(snapshot.IsReady);
        Assert.AreEqual(started.Session!.ShipmentId, snapshot.Session!.ShipmentId);
        Assert.AreEqual("Línea 1", snapshot.LineName);
        Assert.AreEqual("La Esperanza", snapshot.SupplierName);
        Assert.AreEqual("María", snapshot.ResponsibleName);
        Assert.AreEqual("Juan", snapshot.PreviousResponsibleName);
        Assert.AreEqual(1, snapshot.Total);
        Assert.AreEqual(3, snapshot.PendingOutboxCount);

        var authorization = new OutboxAuthorizationEvidence(
            ActorProfileId,
            1,
            StartedAt.AddHours(-1),
            StartedAt.AddHours(24),
            "VALID");
        Guid claimId = Guid.NewGuid();
        IReadOnlyList<ClaimedOutboxMessage> claimed = await database.Outbox().ClaimAsync(
            StationId,
            claimId,
            10,
            StartedAt.AddHours(1).AddMinutes(2),
            StartedAt.AddHours(1).AddMinutes(3),
            authorization);
        Assert.AreEqual(3, claimed.Count);
        await database.Outbox().CompleteClaimAsync(
            claimId,
            [
                new(claimed[0].Message.Id, "APPLIED", "APPLIED", Guid.NewGuid()),
                new(claimed[1].Message.Id, "FAILED_REVIEW", "INVALID_EVENT", Guid.NewGuid()),
                new(claimed[2].Message.Id, "RETRY_LATER", "REQUEST_TIMEOUT", null),
            ],
            StartedAt.AddHours(1).AddMinutes(2),
            _ => TimeSpan.FromSeconds(10));

        LocalOperationDashboardSnapshot afterSync = await database.Dashboard().GetAsync(StationId);
        Assert.AreEqual(1, afterSync.PendingOutboxCount);
        Assert.AreEqual(1, afterSync.FailedReviewOutboxCount);
        Assert.AreEqual(1, afterSync.SyncedOutboxCount);
    }

    [TestMethod]
    public async Task DashboardWithoutActiveCycleUsesPilotLineAndBlocksRegistrationState()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedSelectableCatalogsAsync(database);

        LocalOperationDashboardSnapshot snapshot = await database.Dashboard().GetAsync(StationId);

        Assert.IsFalse(snapshot.IsReady);
        Assert.IsNull(snapshot.Session);
        Assert.AreEqual("Línea 1", snapshot.LineName);
        Assert.AreEqual(0, snapshot.Total);
        Assert.AreEqual(0, snapshot.PendingOutboxCount);
    }

    [TestMethod]
    public async Task StationCatalogAndDashboardExcludeLinesAssignedToAnotherStation()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        SqliteCatalogRepository catalogs = database.Catalogs();
        await catalogs.UpsertLineAsync(new CachedProductionLine(
            LineId, OrganizationId, PlantId, "Línea 1", true, StartedAt));
        await catalogs.UpsertLineAsync(new CachedProductionLine(
            SecondLineId, OrganizationId, PlantId, "Línea 2", true, StartedAt));
        await SeedStationLineScopeAsync(database, StationId, LineId);
        await SeedStationLineScopeAsync(database, SecondStationId, SecondLineId);

        IReadOnlyList<CachedProductionLine> firstStationLines = await catalogs.ListActiveLinesAsync(
            OrganizationId,
            PlantId,
            StationId);
        IReadOnlyList<CachedProductionLine> secondStationLines = await catalogs.ListActiveLinesAsync(
            OrganizationId,
            PlantId,
            SecondStationId);
        IReadOnlyList<LocalOperationDashboardSnapshot> firstDashboard = await database.Dashboard()
            .ListAsync(StationId);

        Assert.HasCount(1, firstStationLines);
        Assert.AreEqual(LineId, firstStationLines[0].Id);
        Assert.HasCount(1, secondStationLines);
        Assert.AreEqual(SecondLineId, secondStationLines[0].Id);
        Assert.HasCount(1, firstDashboard);
        Assert.AreEqual(LineId, firstDashboard[0].LineId);
    }

    [TestMethod]
    public async Task IncrementalPullAppliesPageAndCursorAtomically()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        var repository = new SqliteSyncChangeRepository(database.Factory);
        Guid supplierId = Guid.NewGuid();
        using JsonDocument supplier = JsonDocument.Parse($$"""
            {"id":"{{supplierId:D}}","organization_id":"{{OrganizationId:D}}",
             "name":"Proveedor incremental","is_active":true,"updated_at":"{{StartedAt:O}}"}
            """);
        var first = new SyncPullPage(
            1, null, "cursor-1", false, StartedAt,
            [new SyncChange(Guid.NewGuid(), 1, "SUPPLIER", supplierId, 1, "UPSERT",
                StartedAt, 1, supplier.RootElement.Clone())]);

        await repository.ApplyPageAsync(first);

        Assert.AreEqual("cursor-1", await repository.GetCursorAsync());
        CachedSupplier cached = (await database.Catalogs().FindSupplierAsync(supplierId))!;
        Assert.AreEqual("Proveedor incremental", cached.Name);

        using JsonDocument invalid = JsonDocument.Parse($$"""
            {"id":"{{Guid.NewGuid():D}}","organization_id":"{{OrganizationId:D}}","is_active":true}
            """);
        var second = new SyncPullPage(
            1, "cursor-1", "cursor-2", false, StartedAt.AddMinutes(1),
            [new SyncChange(Guid.NewGuid(), 2, "SUPPLIER", Guid.NewGuid(), 2, "UPSERT",
                StartedAt.AddMinutes(1), 1, invalid.RootElement.Clone())]);

        await Assert.ThrowsExactlyAsync<InvalidOperationException>(() => repository.ApplyPageAsync(second));
        Assert.AreEqual("cursor-1", await repository.GetCursorAsync());
    }

    [TestMethod]
    public async Task IncrementalPullProjectsLineComponentsForMercury()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await database.Catalogs().UpsertLineAsync(new CachedProductionLine(
            LineId, OrganizationId, PlantId, "Línea 1", true, StartedAt));
        var repository = new SqliteSyncChangeRepository(database.Factory);
        Guid rastraId = Guid.Parse("46000000-0000-4000-8000-000000000001");
        using JsonDocument rastra = JsonDocument.Parse($$"""
            {"id":"{{rastraId:D}}","organization_id":"{{OrganizationId:D}}",
             "production_line_id":"{{LineId:D}}","code":"RASTRA_1","name":"Rastra 1",
             "display_order":2,"is_active":true,"updated_at":"{{StartedAt:O}}"}
            """);
        var page = new SyncPullPage(
            1, null, "cursor-component", false, StartedAt,
            [new SyncChange(Guid.NewGuid(), 1, "LINE_COMPONENT", rastraId, 1, "UPSERT",
                StartedAt, 1, rastra.RootElement.Clone())]);

        await repository.ApplyPageAsync(page);

        IReadOnlyList<CachedLineComponent> rastras = await database.Mercury()
            .ListRastrasAsync(OrganizationId, LineId);
        Assert.HasCount(1, rastras);
        Assert.AreEqual(rastraId, rastras[0].Id);
        Assert.AreEqual("Rastra 1", rastras[0].Name);
    }

    [TestMethod]
    public async Task IncrementalPullReconstructsRemoteShipmentSweepAndMercury()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedSelectableCatalogsAsync(database);
        Guid rastraId = Guid.Parse("46000000-0000-4000-8000-000000000001");
        await SeedRastraAsync(database, rastraId);
        Guid shipmentId = Guid.NewGuid();
        Guid feedCycleId = Guid.NewGuid();
        Guid assignmentId = Guid.NewGuid();
        Guid eventId = Guid.NewGuid();
        Guid sweepId = Guid.NewGuid();
        Guid movementId = Guid.NewGuid();
        DateTimeOffset completedAt = StartedAt.AddMinutes(10);
        var changes = new List<SyncChange>();

        void Add(string type, Guid id, string json)
        {
            using JsonDocument document = JsonDocument.Parse(json);
            long sequence = changes.Count + 1;
            changes.Add(new SyncChange(Guid.NewGuid(), sequence, type, id, sequence,
                "UPSERT", completedAt, 1, document.RootElement.Clone()));
        }

        Add("SHIPMENT", shipmentId, $$"""
            {"id":"{{shipmentId:D}}","organization_id":"{{OrganizationId:D}}",
             "plant_id":"{{PlantId:D}}","station_id":"{{SecondStationId:D}}",
             "production_line_id":"{{LineId:D}}","supplier_id":"{{SupplierId:D}}",
             "feed_cycle_id":"{{feedCycleId:D}}","started_by_profile_id":"{{ActorProfileId:D}}",
             "started_at_utc":"{{StartedAt:O}}","completed_at_utc":"{{completedAt:O}}",
             "status":"COMPLETED"}
            """);
        Add("RESPONSIBILITY_ASSIGNMENT", assignmentId, $$"""
            {"id":"{{assignmentId:D}}","organization_id":"{{OrganizationId:D}}",
             "shipment_id":"{{shipmentId:D}}","worker_id":"{{WorkerId:D}}",
             "assigned_by_profile_id":"{{ActorProfileId:D}}","started_at_utc":"{{StartedAt:O}}",
             "ended_at_utc":"{{completedAt:O}}"}
            """);
        Add("PRODUCTION_EVENT", eventId, $$"""
            {"id":"{{eventId:D}}","organization_id":"{{OrganizationId:D}}",
             "plant_id":"{{PlantId:D}}","station_id":"{{SecondStationId:D}}",
             "production_line_id":"{{LineId:D}}","feed_cycle_id":"{{feedCycleId:D}}",
             "shipment_id":"{{shipmentId:D}}","responsible_worker_id":"{{WorkerId:D}}",
             "event_type":"CAJUELA_ADDED","work_period":"DAY",
             "occurred_at_utc":"{{StartedAt.AddMinutes(1):O}}",
             "recorded_at_utc":"{{StartedAt.AddMinutes(1):O}}","client_sequence":1,
             "reverses_client_event_id":null}
            """);
        Add("PRODUCTION_SWEEP", sweepId, $$"""
            {"id":"{{sweepId:D}}","organization_id":"{{OrganizationId:D}}",
             "plant_id":"{{PlantId:D}}","station_id":"{{SecondStationId:D}}",
             "production_line_id":"{{LineId:D}}","feed_cycle_id":"{{feedCycleId:D}}",
             "shipment_id":"{{shipmentId:D}}","client_sequence":2,"cajuela_count":1,
             "swept_at_utc":"{{StartedAt.AddMinutes(2):O}}",
             "recorded_at_utc":"{{StartedAt.AddMinutes(2):O}}",
             "recorded_by_profile_id":"{{ActorProfileId:D}}","is_final":true,"notes":null,
             "event_ids":["{{eventId:D}}"]}
            """);
        Add("MERCURY_MOVEMENT", movementId, $$"""
            {"id":"{{movementId:D}}","organization_id":"{{OrganizationId:D}}",
             "plant_id":"{{PlantId:D}}","station_id":"{{SecondStationId:D}}",
             "production_line_id":"{{LineId:D}}","feed_cycle_id":"{{feedCycleId:D}}",
             "shipment_id":"{{shipmentId:D}}","line_component_id":"{{rastraId:D}}",
             "sweep_id":"{{sweepId:D}}","client_sequence":3,
             "movement_kind":"SWEEP_INPUT","amount_grams":12.30,"unit_code":"g",
             "occurred_at_utc":"{{StartedAt.AddMinutes(3):O}}",
             "recorded_at_utc":"{{StartedAt.AddMinutes(3):O}}",
             "recorded_by_profile_id":"{{ActorProfileId:D}}",
             "supersedes_movement_id":null,"notes":null}
            """);

        await new SqliteSyncChangeRepository(database.Factory).ApplyPageAsync(
            new SyncPullPage(1, null, "cursor-complete", false, completedAt, changes));

        await using SqliteConnection connection = await database.Factory.OpenAsync();
        Assert.AreEqual(1L, await ScalarLongAsync(connection, "SELECT total FROM production_counters;"));
        Assert.AreEqual(1L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM production_sweeps;"));
        Assert.AreEqual(1L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM sweep_production_events;"));
        Assert.AreEqual(1230L, await ScalarLongAsync(connection, "SELECT amount_centigrams FROM mercury_movements;"));
        IReadOnlyList<LocalCompletedShipmentAudit> audit = await database.Audit().ListCompletedShipmentsAsync();
        Assert.HasCount(1, audit);
        Assert.AreEqual(1, audit[0].TotalCajuelas);
        Assert.AreEqual(1, audit[0].SweepCount);
    }

    [TestMethod]
    public async Task MigrationFourteenBackfillsPreviouslySynchronizedRastras()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync(SqliteMigrationCatalog.All.Take(13).ToArray());
        await database.Catalogs().UpsertLineAsync(new CachedProductionLine(
            LineId, OrganizationId, PlantId, "Línea 1", true, StartedAt));
        Guid rastraId = Guid.Parse("46000000-0000-4000-8000-000000000001");
        await using (SqliteConnection connection = await database.Factory.OpenAsync())
        await using (SqliteCommand command = connection.CreateCommand())
        {
            command.CommandText = """
                INSERT INTO sync_entity_cache(
                    entity_type, entity_id, entity_version, action,
                    payload_json, payload_hash, changed_at_utc)
                VALUES ('LINE_COMPONENT', $id, 1, 'UPSERT', $payload, 'hash', $changedAt);
                """;
            command.Parameters.AddWithValue("$id", rastraId.ToString("D"));
            command.Parameters.AddWithValue("$payload", $$"""
                {"id":"{{rastraId:D}}","organization_id":"{{OrganizationId:D}}",
                 "production_line_id":"{{LineId:D}}","code":"RASTRA_1","name":"Rastra 1",
                 "display_order":2,"is_active":true,"updated_at":"{{StartedAt:O}}"}
                """);
            command.Parameters.AddWithValue("$changedAt", StartedAt.ToString("O"));
            await command.ExecuteNonQueryAsync();
        }

        LocalDatabaseMigrationResult result = await database.Migrator.MigrateAsync();
        IReadOnlyList<CachedLineComponent> rastras = await database.Mercury()
            .ListRastrasAsync(OrganizationId, LineId);

        Assert.AreEqual(20L, result.CurrentVersion);
        Assert.AreEqual(7, result.AppliedCount);
        Assert.HasCount(1, rastras);
        Assert.AreEqual(rastraId, rastras[0].Id);
    }

    [TestMethod]
    public async Task DiagnosticsExposeClockAndSafeAdministrativeCorrection()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        var time = new MutableTimeProvider(StartedAt.AddSeconds(7));
        var repository = new SqliteSyncChangeRepository(database.Factory, time);
        using JsonDocument correction = JsonDocument.Parse("""
            {
              "administrator":"Administrador de prueba",
              "role_code":"ADMINISTRADOR",
              "reason_code":"CAMBIO_AUTORIZADO",
              "event_action":"business.mutation",
              "target_entity_type":"supplier",
              "occurred_at_utc":"2026-08-26T12:00:00Z",
              "changes":{"name":{"before":"Anterior","after":"Corregido"}}
            }
            """);
        var page = new SyncPullPage(
            1, null, "cursor-diagnostic", false, StartedAt,
            [new SyncChange(Guid.NewGuid(), 1, "ADMINISTRATIVE_CORRECTION", Guid.NewGuid(), 1,
                "CORRECTION_APPENDED", StartedAt, 1, correction.RootElement.Clone())]);

        await repository.ApplyPageAsync(page);
        LocalDatabaseHealth health = await new SqliteDatabaseDiagnostics(
            database.Factory, time, Options.Create(new LocalRecoveryOptions())).InspectAsync();

        Assert.AreEqual(-7d, health.ClockDeviationSeconds);
        Assert.AreEqual(time.GetUtcNow(), health.LastSynchronizationAt);
        Assert.AreEqual("AVAILABLE", health.SyncNetworkState);
        Assert.HasCount(1, health.Corrections!);
        Assert.AreEqual("Administrador de prueba", health.Corrections![0].Administrator);
        Assert.AreEqual("name: Anterior → Corregido", health.Corrections[0].Changes.Single());

        await repository.RecordPullFailureAsync("NETWORK_UNAVAILABLE", StartedAt.AddMinutes(1));
        LocalDatabaseHealth offline = await new SqliteDatabaseDiagnostics(
            database.Factory, time, Options.Create(new LocalRecoveryOptions())).InspectAsync();
        Assert.AreEqual("UNAVAILABLE", offline.SyncNetworkState);
        Assert.AreEqual("NETWORK_UNAVAILABLE", offline.LastSyncErrorCode);
    }

    [TestMethod]
    public async Task OneTenAndFiftyPulsesMatchEventsOutboxCounterAndTargetLatency()
    {
        foreach (int pulseCount in new[] { 1, 10, 50 })
        {
            await using var database = new TestDatabase();
            await database.Migrator.MigrateAsync();
            await SeedSelectableCatalogsAsync(database);
            var time = new MutableTimeProvider(StartedAt);
            LocalOperationContext operation = await StartOperationAsync(database.OperationService(time));
            RegisterCajuelaHandler handler = database.RegisterHandler(time);
            var results = new List<RegisterCajuelaResult>();

            for (int index = 0; index < pulseCount; index++)
            {
                time.SetUtcNow(StartedAt.AddMilliseconds(index + 1));
                results.Add(await handler.ExecuteAsync(handler.CreateCommand(StationId)));
            }

            Guid shipmentId = operation.Session!.ShipmentId;
            IReadOnlyList<ProductionEvent> events = await database.Events().ListAsync(LineId, shipmentId);
            double maximumElapsedMilliseconds = results.Max(result => result.Elapsed.TotalMilliseconds);
            Console.WriteLine(FormattableString.Invariant(
                $"Pulsaciones={pulseCount}; latencia máxima local={maximumElapsedMilliseconds:F2} ms."));
            Assert.AreEqual(pulseCount, events.Count, $"Eventos para {pulseCount} pulsaciones.");
            Assert.AreEqual(
                pulseCount,
                ProductionEventCounter.ForLineAndShipment(events, LineId, shipmentId),
                $"Contador derivado para {pulseCount} pulsaciones.");
            Assert.AreEqual(
                pulseCount,
                await database.Cajuelas().GetTotalAsync(LineId, shipmentId),
                $"Read model para {pulseCount} pulsaciones.");
            Assert.IsTrue(
                results.All(result => result.Elapsed < TimeSpan.FromMilliseconds(300)),
                $"Cada registro de {pulseCount} pulsaciones debe responder en menos de 300 ms; máximo: " +
                $"{maximumElapsedMilliseconds:F2} ms.");

            await using SqliteConnection connection = await database.Factory.OpenAsync();
            Assert.AreEqual(
                pulseCount,
                await ScalarLongAsync(
                    connection,
                    "SELECT COUNT(*) FROM outbox_messages WHERE operation_type = 'PRODUCTION_EVENT_CREATED';"));
            Assert.AreEqual(1L, await ScalarLongAsync(
                connection,
                "SELECT MIN(client_sequence) FROM production_events;"));
            Assert.AreEqual(pulseCount, await ScalarLongAsync(
                connection,
                "SELECT MAX(client_sequence) FROM production_events;"));
        }
    }

    [TestMethod]
    [TestCategory("SyncChaos")]
    public async Task RepeatingSameCommandDoesNotDuplicateEventOutboxOrCounter()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedSelectableCatalogsAsync(database);
        var time = new MutableTimeProvider(StartedAt);
        LocalOperationContext operation = await StartOperationAsync(database.OperationService(time));
        RegisterCajuelaHandler handler = database.RegisterHandler(time);
        RegisterCajuelaCommand command = handler.CreateCommand(StationId);

        RegisterCajuelaResult first = await handler.ExecuteAsync(command);
        time.SetUtcNow(StartedAt.AddMinutes(1));
        RegisterCajuelaResult retry = await handler.ExecuteAsync(command);

        Assert.IsFalse(first.WasDuplicate);
        Assert.IsTrue(retry.WasDuplicate);
        Assert.AreEqual(first.Event, retry.Event);
        Assert.AreEqual(1, retry.Total);
        Assert.AreEqual(1, await database.Cajuelas().GetTotalAsync(LineId, operation.Session!.ShipmentId));
        await using SqliteConnection connection = await database.Factory.OpenAsync();
        Assert.AreEqual(1L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM production_events;"));
        Assert.AreEqual(1L, await ScalarLongAsync(
            connection,
            "SELECT COUNT(*) FROM outbox_messages WHERE operation_type = 'PRODUCTION_EVENT_CREATED';"));
    }

    [TestMethod]
    public async Task InputOriginIsPreservedInTheImmutableEventOutboxEnvelope()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedSelectableCatalogsAsync(database);
        var time = new MutableTimeProvider(StartedAt);
        LocalOperationContext operation = await StartOperationAsync(database.OperationService(time));
        var input = new OperationInputCommand(
            EventId(91),
            OperationInputAction.RegisterCajuela,
            new OperationInputOrigin("KEYBOARD", "shared-keyboard", "Add", 1, false),
            StartedAt.AddSeconds(1));
        RegisterCajuelaCommand command = RegisterCajuelaHandler.CreateCommand(StationId, input);

        RegisterCajuelaResult result = await database.RegisterHandler(time).ExecuteAsync(command);

        Assert.AreEqual(input.CommandId, result.Event.ClientEventId);
        await using SqliteConnection connection = await database.Factory.OpenAsync();
        string payload = await ScalarTextAsync(
            connection,
            $"SELECT payload_json FROM outbox_messages WHERE aggregate_id = '{result.Event.ClientEventId:D}';");
        using JsonDocument document = JsonDocument.Parse(payload);
        Assert.AreEqual(2, document.RootElement.GetProperty("schemaVersion").GetInt32());
        Assert.AreEqual("KEYBOARD", document.RootElement.GetProperty("inputSourceKind").GetString());
        Assert.AreEqual("shared-keyboard", document.RootElement.GetProperty("inputControllerId").GetString());
        Assert.AreEqual("Add", document.RootElement.GetProperty("inputSignalCode").GetString());
        Assert.AreEqual(1, document.RootElement.GetProperty("inputLineSlot").GetInt32());
        Assert.IsFalse(document.RootElement.GetProperty("inputWasRepeat").GetBoolean());
    }

    [TestMethod]
    public async Task ReusedCommandIdWithDifferentContentIsRejected()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedSelectableCatalogsAsync(database);
        var time = new MutableTimeProvider(StartedAt);
        await StartOperationAsync(database.OperationService(time));
        RegisterCajuelaHandler handler = database.RegisterHandler(time);
        RegisterCajuelaCommand original = handler.CreateCommand(StationId);
        await handler.ExecuteAsync(original);
        var conflicting = original with { OccurredAt = original.OccurredAt.AddSeconds(1) };

        await Assert.ThrowsExactlyAsync<InvalidOperationException>(() => handler.ExecuteAsync(conflicting));

        await using SqliteConnection connection = await database.Factory.OpenAsync();
        Assert.AreEqual(1L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM production_events;"));
        Assert.AreEqual(1L, await ScalarLongAsync(connection, "SELECT total FROM production_counters;"));
    }

    [TestMethod]
    public async Task RegisterRequiresActiveContextAndRejectsCompletedShipment()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedSelectableCatalogsAsync(database);
        var time = new MutableTimeProvider(StartedAt);
        RegisterCajuelaHandler handler = database.RegisterHandler(time);

        await Assert.ThrowsExactlyAsync<InvalidOperationException>(
            () => handler.ExecuteAsync(handler.CreateCommand(StationId)));

        await StartOperationAsync(database.OperationService(time));
        time.SetUtcNow(StartedAt.AddHours(1));
        LocalOperationService operation = database.OperationService(time);
        PreparedOperationCompletion completion = await operation.PrepareCompletionAsync(Authority());
        await operation.ConfirmCompletionAsync(completion);
        await Assert.ThrowsExactlyAsync<InvalidOperationException>(
            () => handler.ExecuteAsync(handler.CreateCommand(StationId)));

        await using SqliteConnection connection = await database.Factory.OpenAsync();
        Assert.AreEqual(0L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM production_events;"));
        Assert.AreEqual(0L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM production_counters;"));
    }

    [TestMethod]
    public async Task RegisterRejectsSessionWithoutCurrentResponsibilityAssignment()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedContextAsync(database);
        await database.Sessions().SaveAsync(new LocalOperationalSession(
            StationId,
            OrganizationId,
            PlantId,
            LineId,
            ShipmentId,
            CycleId,
            WorkerId,
            StartedAt,
            StartedAt,
            LineFeedCycleStatus.Active));
        var time = new MutableTimeProvider(StartedAt);
        RegisterCajuelaHandler handler = database.RegisterHandler(time);

        await Assert.ThrowsExactlyAsync<InvalidOperationException>(
            () => handler.ExecuteAsync(handler.CreateCommand(StationId)));

        await using SqliteConnection connection = await database.Factory.OpenAsync();
        Assert.AreEqual(0L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM production_events;"));
        Assert.AreEqual(0L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM production_counters;"));
    }

    [TestMethod]
    public async Task OutboxFailureRollsBackCajuelaEventAndCounter()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedSelectableCatalogsAsync(database);
        var time = new MutableTimeProvider(StartedAt);
        await StartOperationAsync(database.OperationService(time));
        await using (SqliteConnection connection = await database.Factory.OpenAsync())
        {
            await using SqliteCommand trigger = connection.CreateCommand();
            trigger.CommandText = """
                CREATE TRIGGER reject_production_event_outbox
                BEFORE INSERT ON outbox_messages
                WHEN NEW.operation_type = 'PRODUCTION_EVENT_CREATED'
                BEGIN
                    SELECT RAISE(ABORT, 'simulated outbox failure');
                END;
                """;
            await trigger.ExecuteNonQueryAsync();
        }

        RegisterCajuelaHandler handler = database.RegisterHandler(time);
        await Assert.ThrowsExactlyAsync<SqliteException>(
            () => handler.ExecuteAsync(handler.CreateCommand(StationId)));

        await using SqliteConnection verification = await database.Factory.OpenAsync();
        Assert.AreEqual(0L, await ScalarLongAsync(verification, "SELECT COUNT(*) FROM production_events;"));
        Assert.AreEqual(0L, await ScalarLongAsync(verification, "SELECT COUNT(*) FROM production_counters;"));
        Assert.AreEqual(0L, await ScalarLongAsync(
            verification,
            "SELECT COUNT(*) FROM outbox_messages WHERE operation_type = 'PRODUCTION_EVENT_CREATED';"));
    }

    [TestMethod]
    public async Task DoubleConfirmationReversesLastCajuelaWithImmutableAudit()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedSelectableCatalogsAsync(database);
        var time = new MutableTimeProvider(StartedAt);
        LocalOperationContext operation = await StartOperationAsync(database.OperationService(time));
        RegisterCajuelaHandler register = database.RegisterHandler(time);
        IReadOnlyList<RegisterCajuelaResult> registered = await RegisterManyAsync(register, time, 3);
        RevertLastCajuelaHandler reverse = database.RevertHandler(time);

        PreparedCajuelaReversal prepared = await reverse.PrepareAsync(StationId);

        Assert.AreEqual(registered[^1].Event, prepared.TargetEvent);
        Assert.AreEqual(3, prepared.TotalBeforeCorrection);
        await using (SqliteConnection before = await database.Factory.OpenAsync())
        {
            Assert.AreEqual(3L, await ScalarLongAsync(before, "SELECT COUNT(*) FROM production_events;"));
            Assert.AreEqual(0L, await ScalarLongAsync(before, "SELECT COUNT(*) FROM production_event_corrections;"));
        }

        time.SetUtcNow(StartedAt.AddSeconds(1));
        RevertLastCajuelaResult result = await reverse.ConfirmAsync(
            prepared,
            new OperationInputOrigin("KEYBOARD", "shared-keyboard", "Enter", 1, false));

        Assert.AreEqual(ProductionEventType.CajuelaReversed, result.Event.Type);
        Assert.AreEqual(registered[^1].Event.ClientEventId, result.TargetClientEventId);
        Assert.AreEqual(RevertLastCajuelaHandler.ImmediateInputErrorReason, result.ReasonCode);
        Assert.AreEqual(2, result.Total);
        Assert.IsFalse(result.WasDuplicate);
        IReadOnlyList<ProductionEvent> events = await database.Events().ListAsync(
            LineId,
            operation.Session!.ShipmentId);
        Assert.AreEqual(4, events.Count);
        Assert.AreEqual(2, ProductionEventCounter.ForLineAndShipment(
            events,
            LineId,
            operation.Session.ShipmentId));
        Assert.AreEqual(2, await database.Cajuelas().GetTotalAsync(LineId, operation.Session.ShipmentId));

        await using SqliteConnection connection = await database.Factory.OpenAsync();
        Assert.AreEqual(1L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM production_event_corrections;"));
        Assert.AreEqual(
            RevertLastCajuelaHandler.ImmediateInputErrorReason,
            await ScalarTextAsync(connection, "SELECT reason_code FROM production_event_corrections;"));
        string payload = await ScalarTextAsync(
            connection,
            $"SELECT payload_json FROM outbox_messages WHERE aggregate_id = '{result.Event.ClientEventId:D}';");
        using JsonDocument payloadDocument = JsonDocument.Parse(payload);
        Assert.AreEqual(
            RevertLastCajuelaHandler.ImmediateInputErrorReason,
            payloadDocument.RootElement.GetProperty("reasonCode").GetString());
        Assert.AreEqual(
            "KEYBOARD",
            payloadDocument.RootElement.GetProperty("inputSourceKind").GetString());
        Assert.AreEqual(
            "Enter",
            payloadDocument.RootElement.GetProperty("inputSignalCode").GetString());
        await Assert.ThrowsExactlyAsync<SqliteException>(
            () => ExecuteWithoutParametersAsync(
                connection,
                "UPDATE production_event_corrections SET reason_code = 'IMMEDIATE_INPUT_ERROR';"));
        await Assert.ThrowsExactlyAsync<SqliteException>(
            () => ExecuteWithoutParametersAsync(connection, "DELETE FROM production_event_corrections;"));
        Assert.AreEqual(4L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM production_events;"));
    }

    [TestMethod]
    public async Task RepeatingSameConfirmationDoesNotDuplicateReversalOrAudit()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedSelectableCatalogsAsync(database);
        var time = new MutableTimeProvider(StartedAt);
        LocalOperationContext operation = await StartOperationAsync(database.OperationService(time));
        await RegisterManyAsync(database.RegisterHandler(time), time, 1);
        RevertLastCajuelaHandler reverse = database.RevertHandler(time);
        PreparedCajuelaReversal prepared = await reverse.PrepareAsync(StationId);
        time.SetUtcNow(StartedAt.AddSeconds(1));

        RevertLastCajuelaResult first = await reverse.ConfirmAsync(prepared);
        time.SetUtcNow(StartedAt.AddSeconds(2));
        RevertLastCajuelaResult retry = await reverse.ConfirmAsync(prepared);

        Assert.IsFalse(first.WasDuplicate);
        Assert.IsTrue(retry.WasDuplicate);
        Assert.AreEqual(first.Event, retry.Event);
        Assert.AreEqual(0, retry.Total);
        Assert.AreEqual(0, await database.Cajuelas().GetTotalAsync(LineId, operation.Session!.ShipmentId));
        await using SqliteConnection connection = await database.Factory.OpenAsync();
        Assert.AreEqual(2L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM production_events;"));
        Assert.AreEqual(1L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM production_event_corrections;"));
        Assert.AreEqual(2L, await ScalarLongAsync(
            connection,
            "SELECT COUNT(*) FROM outbox_messages WHERE operation_type = 'PRODUCTION_EVENT_CREATED';"));
    }

    [TestMethod]
    public async Task NewCajuelaInvalidatesPreparedCorrectionWithoutPartialChanges()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedSelectableCatalogsAsync(database);
        var time = new MutableTimeProvider(StartedAt);
        LocalOperationContext operation = await StartOperationAsync(database.OperationService(time));
        RegisterCajuelaHandler register = database.RegisterHandler(time);
        await RegisterManyAsync(register, time, 1);
        RevertLastCajuelaHandler reverse = database.RevertHandler(time);
        PreparedCajuelaReversal stale = await reverse.PrepareAsync(StationId);
        await RegisterManyAsync(register, time, 1, millisecondOffset: 10);

        await Assert.ThrowsExactlyAsync<InvalidOperationException>(() => reverse.ConfirmAsync(stale));

        Assert.AreEqual(2, await database.Cajuelas().GetTotalAsync(LineId, operation.Session!.ShipmentId));
        await using SqliteConnection connection = await database.Factory.OpenAsync();
        Assert.AreEqual(2L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM production_events;"));
        Assert.AreEqual(0L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM production_event_corrections;"));
    }

    [TestMethod]
    public async Task CorrectionRequiresEventAndOpenUnchangedCycle()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedSelectableCatalogsAsync(database);
        var time = new MutableTimeProvider(StartedAt);
        LocalOperationService operation = database.OperationService(time);
        await StartOperationAsync(operation);
        RevertLastCajuelaHandler reverse = database.RevertHandler(time);
        await Assert.ThrowsExactlyAsync<InvalidOperationException>(() => reverse.PrepareAsync(StationId));

        await RegisterManyAsync(database.RegisterHandler(time), time, 1);
        PreparedCajuelaReversal prepared = await reverse.PrepareAsync(StationId);
        time.SetUtcNow(StartedAt.AddMinutes(1));
        PreparedOperationCompletion completion = await operation.PrepareCompletionAsync(Authority());
        await operation.ConfirmCompletionAsync(completion);

        await Assert.ThrowsExactlyAsync<InvalidOperationException>(() => reverse.ConfirmAsync(prepared));

        await using SqliteConnection connection = await database.Factory.OpenAsync();
        Assert.AreEqual(1L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM production_events;"));
        Assert.AreEqual(0L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM production_event_corrections;"));
    }

    [TestMethod]
    public async Task ConsecutiveCorrectionsReverseLatestRemainingCajuelaOnly()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedSelectableCatalogsAsync(database);
        var time = new MutableTimeProvider(StartedAt);
        LocalOperationContext operation = await StartOperationAsync(database.OperationService(time));
        IReadOnlyList<RegisterCajuelaResult> registered = await RegisterManyAsync(
            database.RegisterHandler(time),
            time,
            2);
        RevertLastCajuelaHandler reverse = database.RevertHandler(time);

        PreparedCajuelaReversal second = await reverse.PrepareAsync(StationId);
        RevertLastCajuelaResult reversedSecond = await reverse.ConfirmAsync(second);
        PreparedCajuelaReversal first = await reverse.PrepareAsync(StationId);
        RevertLastCajuelaResult reversedFirst = await reverse.ConfirmAsync(first);

        Assert.AreEqual(registered[1].Event.ClientEventId, reversedSecond.TargetClientEventId);
        Assert.AreEqual(registered[0].Event.ClientEventId, reversedFirst.TargetClientEventId);
        Assert.AreEqual(0, reversedFirst.Total);
        IReadOnlyList<ProductionEvent> events = await database.Events().ListAsync(
            LineId,
            operation.Session!.ShipmentId);
        Assert.AreEqual(0, ProductionEventCounter.ForLineAndShipment(
            events,
            LineId,
            operation.Session.ShipmentId));
        await using SqliteConnection connection = await database.Factory.OpenAsync();
        Assert.AreEqual(4L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM production_events;"));
        Assert.AreEqual(2L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM production_event_corrections;"));
    }

    [TestMethod]
    public async Task ReversalOutboxFailureRollsBackEventCounterAndAudit()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedSelectableCatalogsAsync(database);
        var time = new MutableTimeProvider(StartedAt);
        LocalOperationContext operation = await StartOperationAsync(database.OperationService(time));
        await RegisterManyAsync(database.RegisterHandler(time), time, 1);
        RevertLastCajuelaHandler reverse = database.RevertHandler(time);
        PreparedCajuelaReversal prepared = await reverse.PrepareAsync(StationId);
        await using (SqliteConnection connection = await database.Factory.OpenAsync())
        {
            await using SqliteCommand trigger = connection.CreateCommand();
            trigger.CommandText = $"""
                CREATE TRIGGER reject_reversal_outbox
                BEFORE INSERT ON outbox_messages
                WHEN NEW.aggregate_id = '{prepared.ReversalEventId:D}'
                BEGIN
                    SELECT RAISE(ABORT, 'simulated reversal outbox failure');
                END;
                """;
            await trigger.ExecuteNonQueryAsync();
        }

        await Assert.ThrowsExactlyAsync<SqliteException>(() => reverse.ConfirmAsync(prepared));

        Assert.AreEqual(1, await database.Cajuelas().GetTotalAsync(LineId, operation.Session!.ShipmentId));
        await using SqliteConnection verification = await database.Factory.OpenAsync();
        Assert.AreEqual(1L, await ScalarLongAsync(verification, "SELECT COUNT(*) FROM production_events;"));
        Assert.AreEqual(0L, await ScalarLongAsync(verification, "SELECT COUNT(*) FROM production_event_corrections;"));
    }

    [TestMethod]
    public async Task ImmediateCorrectionReasonCannotBeReplacedByFreeText()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedSelectableCatalogsAsync(database);
        var time = new MutableTimeProvider(StartedAt);
        await StartOperationAsync(database.OperationService(time));
        await RegisterManyAsync(database.RegisterHandler(time), time, 1);
        RevertLastCajuelaHandler reverse = database.RevertHandler(time);
        PreparedCajuelaReversal prepared = await reverse.PrepareAsync(StationId);

        await Assert.ThrowsExactlyAsync<InvalidOperationException>(
            () => reverse.ConfirmAsync(prepared with { ReasonCode = "texto libre" }));

        await using SqliteConnection connection = await database.Factory.OpenAsync();
        Assert.AreEqual(1L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM production_events;"));
        Assert.AreEqual(0L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM production_event_corrections;"));
    }

    [TestMethod]
    public async Task PreparingStartKeepsDatabaseUnchangedUntilAtomicConfirmation()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedSelectableCatalogsAsync(database);
        var time = new MutableTimeProvider(StartedAt);
        LocalOperationService service = database.OperationService(time);

        PreparedOperationStart prepared = await service.PrepareStartAsync(
            LineId,
            SupplierId,
            WorkerId,
            Authority());

        Assert.IsNull(await database.Sessions().LoadAsync(StationId));
        Assert.AreEqual(0, (await database.Outbox().ListPendingAsync(10)).Count);
        LocalOperationContext confirmed = await service.ConfirmStartAsync(prepared);

        Assert.IsTrue(confirmed.CanRegisterCajuela);
        Assert.AreEqual(WorkPeriod.Day, confirmed.CurrentWorkPeriod);
        Assert.AreEqual(WorkerId, confirmed.Session?.ResponsibleWorkerId);
        await using SqliteConnection connection = await database.Factory.OpenAsync();
        Assert.AreEqual(1L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM cached_shipments;"));
        Assert.AreEqual(1L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM responsibility_assignments;"));
        Assert.AreEqual(1L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM operational_sessions;"));
        IReadOnlyList<StoredOutboxMessage> pending = await database.Outbox().ListPendingAsync(10);
        Assert.AreEqual(1, pending.Count);
        Assert.AreEqual("OPERATION_STARTED", pending[0].Message.OperationType);
        using JsonDocument payload = JsonDocument.Parse(pending[0].Message.PayloadJson);
        Assert.AreEqual(
            ActorProfileId.ToString("D"),
            payload.RootElement.GetProperty("actorProfileId").GetString());
    }

    [TestMethod]
    public async Task SameStationCanKeepFourDifferentLinesActiveWithoutMixingTheirContexts()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedSelectableCatalogsAsync(database);
        CachedProductionLine[] additionalLines =
        [
            new(SecondLineId, OrganizationId, PlantId, "Línea 2", true, StartedAt),
            new(ThirdLineId, OrganizationId, PlantId, "Línea 3", true, StartedAt),
            new(FourthLineId, OrganizationId, PlantId, "Línea 4", true, StartedAt),
        ];
        foreach (CachedProductionLine line in additionalLines)
        {
            await database.Catalogs().UpsertLineAsync(line);
            await SeedStationLineScopeAsync(database, StationId, line.Id);
        }

        var time = new MutableTimeProvider(StartedAt);
        LocalOperationService service = database.OperationService(time);
        Guid[] lineIds = [LineId, SecondLineId, ThirdLineId, FourthLineId];
        foreach (Guid lineId in lineIds)
        {
            PreparedOperationStart prepared = await service.PrepareStartAsync(
                lineId,
                SupplierId,
                WorkerId,
                Authority());
            await service.ConfirmStartAsync(prepared);
            time.SetUtcNow(time.GetUtcNow().AddSeconds(1));
        }

        IReadOnlyList<LocalOperationContext> contexts = await service.GetContextsAsync(StationId);

        Assert.HasCount(4, contexts);
        CollectionAssert.AreEquivalent(
            lineIds,
            contexts.Select(context => context.Session!.LineId).ToArray());
        Assert.AreEqual(4, contexts.Select(context => context.Session!.ShipmentId).Distinct().Count());
        await Assert.ThrowsExactlyAsync<InvalidOperationException>(() => service.PrepareStartAsync(
            LineId,
            SupplierId,
            SecondWorkerId,
            Authority()));
    }

    [TestMethod]
    public async Task PreparingReliefKeepsPreviousResponsibleUntilConfirmation()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedSelectableCatalogsAsync(database);
        var time = new MutableTimeProvider(StartedAt);
        LocalOperationService service = database.OperationService(time);
        LocalOperationContext started = await StartOperationAsync(service);

        PreparedResponsibleRelief prepared = await service.PrepareReliefAsync(
            SecondWorkerId,
            Authority());

        Assert.AreEqual(WorkerId, (await database.Sessions().LoadAsync(StationId))?.ResponsibleWorkerId);
        time.SetUtcNow(StartedAt.AddHours(1));
        LocalOperationContext relieved = await service.ConfirmReliefAsync(prepared);

        Assert.AreEqual(started.Session?.ShipmentId, relieved.Session?.ShipmentId);
        Assert.AreEqual(SecondWorkerId, relieved.Session?.ResponsibleWorkerId);
        Assert.IsTrue(relieved.CanRegisterCajuela);
        await using SqliteConnection connection = await database.Factory.OpenAsync();
        Assert.AreEqual(2L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM responsibility_assignments;"));
        Assert.AreEqual(1L, await ScalarLongAsync(
            connection,
            "SELECT COUNT(*) FROM responsibility_assignments WHERE unassigned_at_utc IS NULL;"));
        Assert.AreEqual(2, (await database.Outbox().ListPendingAsync(10)).Count);
    }

    [TestMethod]
    public async Task WorkPeriodChangesWithoutMutatingActiveOperation()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedSelectableCatalogsAsync(database);
        var time = new MutableTimeProvider(StartedAt);
        LocalOperationService service = database.OperationService(time);
        LocalOperationContext started = await StartOperationAsync(service);
        DateTimeOffset originalUpdatedAt = started.Session!.UpdatedAt;

        time.SetUtcNow(new DateTimeOffset(2026, 8, 27, 0, 0, 0, TimeSpan.Zero));
        LocalOperationContext current = await service.GetContextAsync(StationId);

        Assert.AreEqual(WorkPeriod.Night, current.CurrentWorkPeriod);
        Assert.AreEqual(originalUpdatedAt, current.Session?.UpdatedAt);
        Assert.IsTrue(current.CanRegisterCajuela);
    }

    [TestMethod]
    public async Task CompletionClosesAssignmentAndBlocksFeedingWithoutDeletingHistory()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedSelectableCatalogsAsync(database);
        var time = new MutableTimeProvider(StartedAt);
        LocalOperationService service = database.OperationService(time);
        await StartOperationAsync(service);
        time.SetUtcNow(StartedAt.AddHours(2));
        PreparedOperationCompletion prepared = await service.PrepareCompletionAsync(Authority());

        LocalOperationContext completed = await service.ConfirmCompletionAsync(prepared);

        Assert.IsFalse(completed.CanRegisterCajuela);
        await Assert.ThrowsExactlyAsync<InvalidOperationException>(
            () => service.RequireActiveContextAsync(StationId));
        await using SqliteConnection connection = await database.Factory.OpenAsync();
        Assert.AreEqual(1L, await ScalarLongAsync(
            connection,
            "SELECT COUNT(*) FROM cached_shipments WHERE status = 'COMPLETED';"));
        Assert.AreEqual(0L, await ScalarLongAsync(
            connection,
            "SELECT COUNT(*) FROM responsibility_assignments WHERE unassigned_at_utc IS NULL;"));
        Assert.AreEqual(1L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM responsibility_assignments;"));
        Assert.AreEqual(2, (await database.Outbox().ListPendingAsync(10)).Count);
    }

    [TestMethod]
    public async Task StaleReliefCannotOverwriteConfirmedContextAndRollsBackCompletely()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedSelectableCatalogsAsync(database);
        var time = new MutableTimeProvider(StartedAt);
        LocalOperationService service = database.OperationService(time);
        await StartOperationAsync(service);
        PreparedResponsibleRelief first = await service.PrepareReliefAsync(SecondWorkerId, Authority());
        PreparedResponsibleRelief stale = await service.PrepareReliefAsync(ThirdWorkerId, Authority());
        time.SetUtcNow(StartedAt.AddHours(1));
        await service.ConfirmReliefAsync(first);
        time.SetUtcNow(StartedAt.AddHours(2));

        await Assert.ThrowsExactlyAsync<InvalidOperationException>(() => service.ConfirmReliefAsync(stale));

        Assert.AreEqual(SecondWorkerId, (await database.Sessions().LoadAsync(StationId))?.ResponsibleWorkerId);
        await using SqliteConnection connection = await database.Factory.OpenAsync();
        Assert.AreEqual(2L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM responsibility_assignments;"));
        Assert.AreEqual(2, (await database.Outbox().ListPendingAsync(10)).Count);
    }

    [TestMethod]
    public async Task CatalogChangeAfterPreparationRejectsConfirmationWithoutPartialRows()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedSelectableCatalogsAsync(database);
        var time = new MutableTimeProvider(StartedAt);
        LocalOperationService service = database.OperationService(time);
        PreparedOperationStart prepared = await service.PrepareStartAsync(
            LineId,
            SupplierId,
            WorkerId,
            Authority());
        await database.Catalogs().UpsertSupplierAsync(Supplier() with { IsActive = false });

        await Assert.ThrowsExactlyAsync<InvalidOperationException>(() => service.ConfirmStartAsync(prepared));

        await using SqliteConnection connection = await database.Factory.OpenAsync();
        Assert.AreEqual(0L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM cached_shipments;"));
        Assert.AreEqual(0L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM responsibility_assignments;"));
        Assert.AreEqual(0L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM operational_sessions;"));
        Assert.AreEqual(0L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM outbox_messages;"));
    }

    [TestMethod]
    public async Task ActiveContextSurvivesServiceRestartAndBlocksAnotherPreparation()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedSelectableCatalogsAsync(database);
        var time = new MutableTimeProvider(StartedAt);
        LocalOperationContext started = await StartOperationAsync(database.OperationService(time));

        LocalOperationService restarted = database.OperationService(time);
        LocalOperationContext restored = await restarted.GetContextAsync(StationId);

        Assert.AreEqual(started.Session, restored.Session);
        Assert.IsTrue(restored.CanRegisterCajuela);
        await Assert.ThrowsExactlyAsync<InvalidOperationException>(
            () => restarted.PrepareStartAsync(
                LineId,
                SupplierId,
                SecondWorkerId,
                Authority()));
        Assert.AreEqual(1, (await database.Outbox().ListPendingAsync(10)).Count);
    }

    [TestMethod]
    [DataRow(50, false)]
    [DataRow(30, true)]
    [DataRow(60, false)]
    public async Task ProductionSweepPersistsExactEventsAndIsIdempotent(
        int quantity,
        bool isFinal)
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedSelectableCatalogsAsync(database);
        var time = new MutableTimeProvider(StartedAt);
        await StartOperationAsync(database.OperationService(time));
        await RegisterManyAsync(database.RegisterHandler(time), time, quantity);
        SqliteProductionSweepRepository repository = database.Sweeps();

        LocalSweepPreparation preparation = await repository.PrepareAsync(StationId, LineId);
        DateTimeOffset sweptAt = time.GetUtcNow().AddMilliseconds(1);
        ProductionSweep sweep = ProductionSweep.Record(
            Guid.NewGuid(),
            preparation.UnsweptEvents,
            ActorProfileId,
            sweptAt,
            sweptAt,
            isFinal);

        LocalSweepRegistration first = await repository.RecordAsync(sweep);
        LocalSweepRegistration retry = await repository.RecordAsync(sweep);
        LocalSweepPreparation after = await repository.PrepareAsync(StationId, LineId);

        Assert.AreEqual(quantity, preparation.UnsweptEvents.Count);
        Assert.AreEqual(quantity, preparation.TotalCajuelas);
        Assert.AreEqual(quantity, first.CumulativeSweptTotal);
        Assert.IsFalse(first.WasDuplicate);
        Assert.IsTrue(retry.WasDuplicate);
        Assert.AreEqual(0, after.UnsweptEvents.Count);
        Assert.AreEqual(quantity, after.LastSweepCumulativeTotal);
        Assert.AreEqual(SweepMercuryStatus.Pending, sweep.MercuryStatus);
        LocalOperationDashboardSnapshot dashboard = await database.Dashboard().GetAsync(StationId);
        Assert.AreEqual(1, dashboard.SweepCount);

        await using SqliteConnection connection = await database.Factory.OpenAsync();
        Assert.AreEqual(1L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM production_sweeps;"));
        Assert.AreEqual(quantity, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM sweep_production_events;"));
        Assert.AreEqual(isFinal ? 1L : 0L, await ScalarLongAsync(
            connection,
            "SELECT is_final FROM production_sweeps LIMIT 1;"));
        Assert.AreEqual(0L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM mercury_movements;"));
        Assert.AreEqual(1L, await ScalarLongAsync(connection,
            "SELECT COUNT(*) FROM outbox_messages WHERE operation_type = 'PRODUCTION_SWEEP_RECORDED';"));
    }

    [TestMethod]
    public async Task MercuryMeasurementsPreserveLegacyHistoryPendingAndCorrections()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedSelectableCatalogsAsync(database);
        Guid rastraId = Guid.Parse("46000000-0000-4000-8000-000000000001");
        await SeedRastraAsync(database, rastraId);
        var time = new MutableTimeProvider(StartedAt);
        LocalOperationService operations = database.OperationService(time);
        LocalOperationContext operation = await StartOperationAsync(operations);
        await RegisterManyAsync(database.RegisterHandler(time), time, 3);
        LocalSweepPreparation preparation = await database.Sweeps().PrepareAsync(StationId, LineId);
        DateTimeOffset sweptAt = time.GetUtcNow().AddSeconds(1);
        ProductionSweep sweep = ProductionSweep.Record(
            Guid.NewGuid(), preparation.UnsweptEvents, ActorProfileId, sweptAt, sweptAt, false);
        await database.Sweeps().RecordAsync(sweep);
        SqliteMercuryRepository repository = database.Mercury();

        Guid shipmentId = operation.Session!.ShipmentId;
        await repository.RecordAsync(Mercury(
            Guid.NewGuid(), shipmentId, rastraId, MercuryMovementKind.InitialLoad, 400.7m));
        await repository.RecordAsync(Mercury(
            Guid.NewGuid(), shipmentId, rastraId, MercuryMovementKind.Reload, 10m, replaceCurrent: false));
        LocalMercuryMovement pending = await repository.RecordAsync(Mercury(
            Guid.NewGuid(), shipmentId, rastraId, MercuryMovementKind.SweepInput, null, sweep.Id));
        LocalMercuryMovement correction = await repository.RecordAsync(Mercury(
            Guid.NewGuid(), shipmentId, rastraId, MercuryMovementKind.SweepInput, 400.7m, sweep.Id));
        await repository.RecordAsync(Mercury(
            Guid.NewGuid(), shipmentId, rastraId, MercuryMovementKind.SweepRemainder, 281m, sweep.Id));

        IReadOnlyList<CachedLineComponent> rastras = await repository.ListRastrasAsync(
            OrganizationId, LineId);
        IReadOnlyList<LocalMercurySweepTarget> sweeps = await repository.ListSweepsAsync(shipmentId);
        IReadOnlyList<LocalMercuryMovement> current = await repository.ListCurrentAsync(shipmentId);

        Assert.HasCount(1, rastras);
        Assert.HasCount(1, sweeps);
        Assert.HasCount(4, current);
        Assert.AreEqual(pending.Id, correction.SupersedesMovementId);
        Assert.AreEqual(400.7m, current.Single(item => item.Kind == MercuryMovementKind.SweepInput).AmountGrams);
        Assert.AreEqual(281m, current.Single(item => item.Kind == MercuryMovementKind.SweepRemainder).AmountGrams);
        Assert.AreEqual(10m, current.Single(item => item.Kind == MercuryMovementKind.Reload).AmountGrams);
        await using SqliteConnection connection = await database.Factory.OpenAsync();
        Assert.AreEqual(5L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM mercury_movements;"));
        Assert.AreEqual(5L, await ScalarLongAsync(
            connection, "SELECT COUNT(DISTINCT client_sequence) FROM mercury_movements;"));
        Assert.AreEqual(3L, await ScalarLongAsync(connection,
            "SELECT COUNT(*) FROM outbox_messages WHERE operation_type = 'MERCURY_MOVEMENT_RECORDED';"));
        time.SetUtcNow(StartedAt.AddHours(2));
        PreparedOperationCompletion completion = await operations.PrepareCompletionAsync(
            LineId, Authority());
        await operations.ConfirmCompletionAsync(completion);
        IReadOnlyList<LocalCompletedShipmentAudit> audit = await database.Audit()
            .ListCompletedShipmentsAsync();
        Assert.AreEqual(1, audit[0].MercuryRecordedSweepCount);
    }

    [TestMethod]
    public async Task AuditGroupsCompletedShipmentSweepCorrectionAndResponsibility()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedSelectableCatalogsAsync(database);
        var time = new MutableTimeProvider(StartedAt);
        LocalOperationService operations = database.OperationService(time);
        await StartOperationAsync(operations);
        await RegisterManyAsync(database.RegisterHandler(time), time, 3);
        PreparedCajuelaReversal correction = await database.RevertHandler(time)
            .PrepareAsync(StationId, LineId);
        await database.RevertHandler(time).ConfirmAsync(correction);
        LocalSweepPreparation sweepPreparation = await database.Sweeps()
            .PrepareAsync(StationId, LineId);
        DateTimeOffset sweepTime = time.GetUtcNow().AddSeconds(1);
        await database.Sweeps().RecordAsync(ProductionSweep.Record(
            Guid.NewGuid(),
            sweepPreparation.UnsweptEvents,
            ActorProfileId,
            sweepTime,
            sweepTime,
            isFinal: true));
        time.SetUtcNow(sweepTime.AddSeconds(1));
        PreparedOperationCompletion completion = await operations.PrepareCompletionAsync(
            LineId,
            Authority());
        await operations.ConfirmCompletionAsync(completion);

        IReadOnlyList<LocalCompletedShipmentAudit> shipments = await database.Audit()
            .ListCompletedShipmentsAsync();
        IReadOnlyList<LocalCajuelaCorrectionAudit> corrections = await database.Audit()
            .ListCajuelaCorrectionsAsync();

        Assert.HasCount(1, shipments);
        Assert.AreEqual("Línea 1", shipments[0].LineName);
        Assert.AreEqual("La Esperanza", shipments[0].SupplierName);
        Assert.AreEqual(2, shipments[0].TotalCajuelas);
        Assert.AreEqual(1, shipments[0].SweepCount);
        Assert.AreEqual(2, shipments[0].SweptCajuelas);
        Assert.AreEqual(1, shipments[0].CorrectionCount);
        Assert.AreEqual(0, shipments[0].MercuryRecordedSweepCount);
        Assert.HasCount(1, shipments[0].Responsibilities);
        Assert.IsNotNull(shipments[0].Responsibilities[0].UnassignedAt);
        Assert.HasCount(1, corrections);
        Assert.AreEqual("Juan", corrections[0].ActorName);
        Assert.AreEqual(3, corrections[0].TotalBefore);
        Assert.AreEqual(2, corrections[0].TotalAfter);
        Assert.IsFalse(corrections[0].RequiredPlantManager);
    }

    [TestMethod]
    [TestCategory("SyncChaos")]
    public async Task OfflineShiftPreservesTwoShipmentsReliefs120CajuelasReversalsAndRestarts()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedSelectableCatalogsAsync(database);
        DateTimeOffset dayStart = new(2026, 8, 27, 23, 50, 0, TimeSpan.Zero);
        var time = new MutableTimeProvider(dayStart);
        LocalOperationService operations = database.OperationService(time);
        LocalOperationContext first = await StartOperationAsync(operations);
        RegisterCajuelaHandler register = database.RegisterHandler(time);
        RevertLastCajuelaHandler reverse = database.RevertHandler(time);
        var expectedFirstLedger = new List<ProductionEvent>();

        for (int index = 0; index < 30; index++)
        {
            time.SetUtcNow(dayStart.AddSeconds(index + 1));
            expectedFirstLedger.Add((await register.ExecuteAsync(register.CreateCommand(StationId))).Event);
        }

        operations = database.OperationService(time);
        register = database.RegisterHandler(time);
        reverse = database.RevertHandler(time);
        LocalOperationContext restoredFirst = await operations.GetContextAsync(StationId);
        Assert.AreEqual(first.Session, restoredFirst.Session);

        time.SetUtcNow(new DateTimeOffset(2026, 8, 28, 0, 0, 0, TimeSpan.Zero));
        PreparedResponsibleRelief firstRelief = await operations.PrepareReliefAsync(
            SecondWorkerId,
            Authority());
        LocalOperationContext firstRelieved = await operations.ConfirmReliefAsync(firstRelief);
        Assert.AreEqual(first.Session!.ShipmentId, firstRelieved.Session!.ShipmentId);

        DateTimeOffset nightStart = time.GetUtcNow();
        for (int index = 0; index < 30; index++)
        {
            time.SetUtcNow(nightStart.AddSeconds(index + 1));
            expectedFirstLedger.Add((await register.ExecuteAsync(register.CreateCommand(StationId))).Event);
        }

        time.SetUtcNow(nightStart.AddMinutes(1));
        PreparedCajuelaReversal firstCorrection = await reverse.PrepareAsync(StationId);
        expectedFirstLedger.Add((await reverse.ConfirmAsync(firstCorrection)).Event);
        PreparedOperationCompletion firstCompletion = await operations.PrepareCompletionAsync(Authority());
        await operations.ConfirmCompletionAsync(firstCompletion);

        operations = database.OperationService(time);
        register = database.RegisterHandler(time);
        reverse = database.RevertHandler(time);
        Assert.IsFalse((await operations.GetContextAsync(StationId)).CanRegisterCajuela);

        time.SetUtcNow(nightStart.AddMinutes(2));
        PreparedOperationStart secondPrepared = await operations.PrepareStartAsync(
            LineId,
            SupplierId,
            ThirdWorkerId,
            Authority());
        LocalOperationContext second = await operations.ConfirmStartAsync(secondPrepared);
        var expectedSecondLedger = new List<ProductionEvent>();

        for (int index = 0; index < 30; index++)
        {
            time.SetUtcNow(nightStart.AddMinutes(2).AddSeconds(index + 1));
            expectedSecondLedger.Add((await register.ExecuteAsync(register.CreateCommand(StationId))).Event);
        }

        time.SetUtcNow(nightStart.AddMinutes(3));
        PreparedResponsibleRelief secondRelief = await operations.PrepareReliefAsync(
            WorkerId,
            Authority());
        LocalOperationContext secondRelieved = await operations.ConfirmReliefAsync(secondRelief);
        Assert.AreEqual(second.Session!.ShipmentId, secondRelieved.Session!.ShipmentId);

        for (int index = 0; index < 30; index++)
        {
            time.SetUtcNow(nightStart.AddMinutes(3).AddSeconds(index + 1));
            expectedSecondLedger.Add((await register.ExecuteAsync(register.CreateCommand(StationId))).Event);
        }

        time.SetUtcNow(nightStart.AddMinutes(4));
        for (int index = 0; index < 2; index++)
        {
            PreparedCajuelaReversal correction = await reverse.PrepareAsync(StationId);
            expectedSecondLedger.Add((await reverse.ConfirmAsync(correction)).Event);
            time.SetUtcNow(time.GetUtcNow().AddSeconds(1));
        }

        PreparedOperationCompletion secondCompletion = await operations.PrepareCompletionAsync(Authority());
        await operations.ConfirmCompletionAsync(secondCompletion);

        IReadOnlyList<ProductionEvent> persistedFirst = await database.Events().ListAsync(
            LineId,
            first.Session.ShipmentId);
        IReadOnlyList<ProductionEvent> persistedSecond = await database.Events().ListAsync(
            LineId,
            second.Session.ShipmentId);
        CollectionAssert.AreEqual(expectedFirstLedger, persistedFirst.ToArray());
        CollectionAssert.AreEqual(expectedSecondLedger, persistedSecond.ToArray());
        Assert.AreEqual(61, persistedFirst.Count);
        Assert.AreEqual(62, persistedSecond.Count);
        Assert.AreEqual(59, ProductionEventCounter.ForLineAndShipment(
            persistedFirst,
            LineId,
            first.Session.ShipmentId));
        Assert.AreEqual(58, ProductionEventCounter.ForLineAndShipment(
            persistedSecond,
            LineId,
            second.Session.ShipmentId));
        Assert.AreEqual(WorkPeriod.Day, persistedFirst[0].WorkPeriod);
        Assert.AreEqual(WorkPeriod.Night, persistedFirst[30].WorkPeriod);
        Assert.AreEqual(WorkerId, persistedFirst[29].Context.ResponsibleWorkerId);
        Assert.AreEqual(SecondWorkerId, persistedFirst[30].Context.ResponsibleWorkerId);
        Assert.AreEqual(ThirdWorkerId, persistedSecond[29].Context.ResponsibleWorkerId);
        Assert.AreEqual(WorkerId, persistedSecond[30].Context.ResponsibleWorkerId);

        await using SqliteConnection connection = await database.Factory.OpenAsync();
        Assert.AreEqual(120L, await ScalarLongAsync(
            connection,
            "SELECT COUNT(*) FROM production_events WHERE event_type = 'CAJUELA_ADDED';"));
        Assert.AreEqual(3L, await ScalarLongAsync(
            connection,
            "SELECT COUNT(*) FROM production_events WHERE event_type = 'CAJUELA_REVERSED';"));
        Assert.AreEqual(123L, await ScalarLongAsync(connection, "SELECT MAX(client_sequence) FROM production_events;"));
        Assert.AreEqual(2L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM cached_shipments;"));
        Assert.AreEqual(4L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM responsibility_assignments;"));
        Assert.AreEqual(0L, await ScalarLongAsync(
            connection,
            "SELECT COUNT(*) FROM responsibility_assignments WHERE unassigned_at_utc IS NULL;"));
        Assert.AreEqual(129L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM outbox_messages;"));
        Assert.AreEqual("ok", await ScalarTextAsync(connection, "PRAGMA integrity_check;"), ignoreCase: true);
    }

    [TestMethod]
    public void AuthorityFactoryRejectsOrganizationMismatch()
    {
        var state = new ProtectedStationState(
            new AuthTokens("access", "refresh", StartedAt.AddHours(1)),
            new ApiSession(
                ActorProfileId,
                OrganizationId,
                "JEFE_PLANTA",
                StartedAt.AddHours(1)),
            new StationAuthorization(
                StationId,
                PlantId,
                Guid.Parse("30000000-0000-4000-8000-000000000099"),
                "Estación 1",
                1,
                "verifier",
                StartedAt,
                StartedAt.AddHours(24)),
            [],
            OfflinePinState.Empty);

        Assert.ThrowsExactly<UnauthorizedAccessException>(() => OperationAuthority.From(state));
    }

    private static async Task SeedContextAsync(
        TestDatabase database,
        bool seedStationLineScope = true)
    {
        await SeedSelectableCatalogsAsync(database, seedStationLineScope);
        await database.Shipments().UpsertAsync(Shipment());
    }

    private static async Task SeedSelectableCatalogsAsync(
        TestDatabase database,
        bool seedStationLineScope = true)
    {
        SqliteCatalogRepository catalogs = database.Catalogs();
        await catalogs.UpsertSupplierAsync(Supplier());
        await SeedWorkerAsync(database, new CachedWorker(
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
        if (seedStationLineScope)
        {
            await SeedStationLineScopeAsync(database, StationId, LineId);
        }
        await SeedWorkerAsync(database, new CachedWorker(
            SecondWorkerId,
            OrganizationId,
            "María",
            true,
            StartedAt));
        await SeedWorkerAsync(database, new CachedWorker(
            ThirdWorkerId,
            OrganizationId,
            "Carlos",
            true,
            StartedAt));
    }

    private static async Task SeedWorkerAsync(TestDatabase database, CachedWorker worker)
    {
        await using SqliteConnection connection = await database.Factory.OpenAsync();
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO cached_workers(id, organization_id, name, is_active, updated_at_utc)
            VALUES ($id, $organizationId, $name, $isActive, $updatedAtUtc)
            ON CONFLICT(id) DO UPDATE SET
                organization_id = excluded.organization_id,
                name = excluded.name,
                is_active = excluded.is_active,
                updated_at_utc = excluded.updated_at_utc;
            """;
        command.Parameters.AddWithValue("$id", worker.Id.ToString("D"));
        command.Parameters.AddWithValue("$organizationId", worker.OrganizationId.ToString("D"));
        command.Parameters.AddWithValue("$name", worker.Name);
        command.Parameters.AddWithValue("$isActive", worker.IsActive ? 1 : 0);
        command.Parameters.AddWithValue("$updatedAtUtc", worker.UpdatedAt.ToUniversalTime().ToString("O"));
        await command.ExecuteNonQueryAsync();
    }

    private static async Task SeedStationLineScopeAsync(
        TestDatabase database,
        Guid stationId,
        Guid lineId)
    {
        await using SqliteConnection connection = await database.Factory.OpenAsync();
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO sync_entity_cache(
                entity_type, entity_id, entity_version, action,
                payload_json, payload_hash, changed_at_utc)
            VALUES (
                'STATION_LINE_SCOPE', $lineId, 1, 'UPSERT',
                json_object(
                    'organization_id', $organizationId,
                    'plant_id', $plantId,
                    'station_id', $stationId,
                    'production_line_id', $lineId,
                    'is_active', json('true')),
                $hash, $changedAtUtc);
            """;
        command.Parameters.AddWithValue("$organizationId", OrganizationId.ToString("D"));
        command.Parameters.AddWithValue("$plantId", PlantId.ToString("D"));
        command.Parameters.AddWithValue("$stationId", stationId.ToString("D"));
        command.Parameters.AddWithValue("$lineId", lineId.ToString("D"));
        command.Parameters.AddWithValue("$hash", $"scope-{stationId:D}-{lineId:D}");
        command.Parameters.AddWithValue("$changedAtUtc", StartedAt.ToString("O", CultureInfo.InvariantCulture));
        await command.ExecuteNonQueryAsync();
    }

    private static async Task<LocalOperationContext> StartOperationAsync(LocalOperationService service)
    {
        PreparedOperationStart prepared = await service.PrepareStartAsync(
            LineId,
            SupplierId,
            WorkerId,
            Authority());
        return await service.ConfirmStartAsync(prepared);
    }

    private static async Task<IReadOnlyList<RegisterCajuelaResult>> RegisterManyAsync(
        RegisterCajuelaHandler handler,
        MutableTimeProvider time,
        int count,
        int millisecondOffset = 0)
    {
        var results = new List<RegisterCajuelaResult>();
        for (int index = 0; index < count; index++)
        {
            time.SetUtcNow(StartedAt.AddMilliseconds(millisecondOffset + index + 1));
            results.Add(await handler.ExecuteAsync(handler.CreateCommand(StationId)));
        }

        return results;
    }

    private static OperationAuthority Authority() =>
        new(ActorProfileId, OrganizationId, PlantId, StationId, 1);

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
        new(
            id,
            "PRODUCTION_EVENT_CREATED",
            "production_event",
            aggregateId,
            $"{{\"schemaVersion\":2,\"stationId\":\"{StationId:D}\"}}",
            StartedAt);

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

    private static async Task<int> ExecuteWithoutParametersAsync(
        SqliteConnection connection,
        string sql)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = sql;
        return await command.ExecuteNonQueryAsync();
    }

    private static async Task InsertLegacyEventWithOutboxAsync(SqliteConnectionFactory factory)
    {
        ProductionEvent productionEvent = Added(EventId(1), 1);
        await using SqliteConnection connection = await factory.OpenAsync();
        using SqliteTransaction transaction = connection.BeginTransaction();
        await using SqliteCommand command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            INSERT INTO production_events(
                client_event_id, organization_id, plant_id, station_id, line_id,
                feed_cycle_id, shipment_id, responsible_worker_id, event_type,
                work_period, occurred_at_utc, recorded_at_utc, client_sequence,
                reverses_client_event_id)
            VALUES ($eventId, $organizationId, $plantId, $stationId, $lineId,
                $cycleId, $shipmentId, $workerId, 'CAJUELA_ADDED', 'DAY',
                $occurredAt, $recordedAt, 1, NULL);
            INSERT INTO outbox_messages(
                id, operation_type, aggregate_type, aggregate_id, payload_json,
                state, attempt_count, created_at_utc, updated_at_utc)
            VALUES ($outboxId, 'PRODUCTION_EVENT_CREATED', 'production_event', $eventId,
                $payload, 'PENDING', 0, $recordedAt, $recordedAt);
            """;
        command.Parameters.AddWithValue("$eventId", productionEvent.ClientEventId.ToString("D"));
        command.Parameters.AddWithValue("$organizationId", OrganizationId.ToString("D"));
        command.Parameters.AddWithValue("$plantId", PlantId.ToString("D"));
        command.Parameters.AddWithValue("$stationId", StationId.ToString("D"));
        command.Parameters.AddWithValue("$lineId", LineId.ToString("D"));
        command.Parameters.AddWithValue("$cycleId", CycleId.ToString("D"));
        command.Parameters.AddWithValue("$shipmentId", ShipmentId.ToString("D"));
        command.Parameters.AddWithValue("$workerId", WorkerId.ToString("D"));
        command.Parameters.AddWithValue("$occurredAt", productionEvent.OccurredAt.ToString("O"));
        command.Parameters.AddWithValue("$recordedAt", productionEvent.RecordedAt.ToString("O"));
        command.Parameters.AddWithValue("$outboxId", EventId(10).ToString("D"));
        command.Parameters.AddWithValue("$payload", Outbox(EventId(10), EventId(1)).PayloadJson);
        await command.ExecuteNonQueryAsync();
        transaction.Commit();
    }

    private static RecordLocalMercuryMovement Mercury(
        Guid id,
        Guid shipmentId,
        Guid rastraId,
        MercuryMovementKind kind,
        decimal? amount,
        Guid? sweepId = null,
        bool replaceCurrent = true)
    {
        DateTimeOffset occurredAt = StartedAt.AddHours(1);
        return new RecordLocalMercuryMovement(
            id,
            StationId,
            shipmentId,
            rastraId,
            sweepId,
            kind,
            amount,
            ActorProfileId,
            occurredAt,
            occurredAt,
            replaceCurrent);
    }

    private static async Task SeedRastraAsync(TestDatabase database, Guid rastraId)
    {
        await using SqliteConnection connection = await database.Factory.OpenAsync();
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO cached_line_components(
                id, organization_id, line_id, component_type_code, code, name,
                display_order, is_active, updated_at_utc)
            VALUES ($id, $organizationId, $lineId, 'RASTRA', 'RASTRA_1', 'Rastra 1',
                    1, 1, $updatedAt);
            """;
        command.Parameters.AddWithValue("$id", rastraId.ToString("D"));
        command.Parameters.AddWithValue("$organizationId", OrganizationId.ToString("D"));
        command.Parameters.AddWithValue("$lineId", LineId.ToString("D"));
        command.Parameters.AddWithValue("$updatedAt", StartedAt.ToString("O"));
        await command.ExecuteNonQueryAsync();
    }

    private static async Task SeedInventoryCatalogAsync(TestDatabase database)
    {
        await using SqliteConnection connection = await database.Factory.OpenAsync();
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = $"""
            INSERT INTO inventory_item_types(
                id, organization_id, code, name, is_custom, is_active, updated_at_utc)
            VALUES ('{InventoryItemTypeId:D}', '{OrganizationId:D}', 'HERRAMIENTA',
                'Herramienta', 0, 1, '{StartedAt:O}');

            INSERT INTO inventory_units(
                id, organization_id, code, name, decimal_places, is_custom, is_active,
                updated_at_utc)
            VALUES ('{InventoryUnitId:D}', '{OrganizationId:D}', 'UNIDAD', 'Unidad',
                0, 0, 1, '{StartedAt:O}');

            INSERT INTO inventory_items(
                id, organization_id, plant_id, item_type_id, unit_id, name,
                is_active, updated_at_utc)
            VALUES ('{InventoryItemId:D}', '{OrganizationId:D}', '{PlantId:D}',
                '{InventoryItemTypeId:D}', '{InventoryUnitId:D}', 'Cadena de rastra',
                1, '{StartedAt:O}');
            """;
        await command.ExecuteNonQueryAsync();
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

        public SqliteLocalOperationRepository Operations() => new(Factory);

        public SqliteCajuelaRepository Cajuelas() => new(Factory);

        public SqliteOperationDashboardRepository Dashboard() => new(Factory);

        public SqliteProductionSweepRepository Sweeps() => new(Factory);

        public SqliteMercuryRepository Mercury() => new(Factory);

        public SqliteAuditRepository Audit() => new(Factory);

        public SqliteOperationInputMetricStore Metrics() => new(Factory);

        public LocalOperationService OperationService(TimeProvider timeProvider) =>
            new(Catalogs(), Sessions(), Operations(), timeProvider);

        public RegisterCajuelaHandler RegisterHandler(TimeProvider timeProvider) =>
            new(Cajuelas(), timeProvider);

        public RevertLastCajuelaHandler RevertHandler(TimeProvider timeProvider) =>
            new(Cajuelas(), timeProvider);

        public ValueTask DisposeAsync()
        {
            DeleteRoot(Root);
            return ValueTask.CompletedTask;
        }
    }

    private sealed class MutableTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;

        public void SetUtcNow(DateTimeOffset value) => utcNow = value;
    }
}
