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
    private static readonly Guid LineId = Guid.Parse("43000000-0000-4000-8000-000000000001");
    private static readonly Guid SupplierId = Guid.Parse("42000000-0000-4000-8000-000000000001");
    private static readonly Guid ShipmentId = Guid.Parse("41000000-0000-4000-8000-000000000001");
    private static readonly Guid CycleId = Guid.Parse("44000000-0000-4000-8000-000000000001");
    private static readonly Guid WorkerId = Guid.Parse("45000000-0000-4000-8000-000000000001");
    private static readonly Guid SecondWorkerId = Guid.Parse("45000000-0000-4000-8000-000000000002");
    private static readonly Guid ThirdWorkerId = Guid.Parse("45000000-0000-4000-8000-000000000003");
    private static readonly Guid ActorProfileId = Guid.Parse("20000000-0000-4000-8000-000000000001");
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

        Assert.AreEqual(5L, result.CurrentVersion);
        Assert.AreEqual(5, result.AppliedCount);
        Assert.AreEqual("wal", result.JournalMode, ignoreCase: true);
        await using SqliteConnection connection = await database.Factory.OpenAsync();
        Assert.AreEqual(1L, await ScalarLongAsync(connection, "PRAGMA foreign_keys;"));
        Assert.AreEqual(2L, await ScalarLongAsync(connection, "PRAGMA synchronous;"));
        Assert.AreEqual("wal", await ScalarTextAsync(connection, "PRAGMA journal_mode;"), ignoreCase: true);
        Assert.AreEqual("ok", await ScalarTextAsync(connection, "PRAGMA integrity_check;"), ignoreCase: true);
        Assert.AreEqual(0L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM pragma_foreign_key_check;"));
        Assert.IsTrue(Version.Parse(await ScalarTextAsync(connection, "SELECT sqlite_version();")) >= new Version(3, 50, 2));
        Assert.AreEqual(5L, await ScalarLongAsync(connection, "SELECT COUNT(*) FROM local_schema_migrations;"));
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

        Assert.AreEqual(4, result.AppliedCount);
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
        Assert.AreEqual(5L, await ScalarLongAsync(copy, "SELECT COUNT(*) FROM local_schema_migrations;"));
    }

    [TestMethod]
    public async Task CounterMigrationRebuildsReadModelFromExistingEvents()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync(SqliteMigrationCatalog.All.Take(2).ToArray());
        await SeedContextAsync(database);
        await database.Events().AppendWithOutboxAsync(
            Added(EventId(1), 1),
            Outbox(EventId(10), EventId(1)));

        LocalDatabaseMigrationResult result = await database.Migrator.MigrateAsync();

        Assert.AreEqual(3, result.AppliedCount);
        Assert.AreEqual(1, await database.Cajuelas().GetTotalAsync(LineId, ShipmentId));
        await using SqliteConnection connection = await database.Factory.OpenAsync();
        Assert.AreEqual(1L, await ScalarLongAsync(
            connection,
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'production_event_corrections';"));
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
        await StartOperationAsync(database.OperationService(time));
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

    private static async Task SeedContextAsync(TestDatabase database)
    {
        await SeedSelectableCatalogsAsync(database);
        await database.Shipments().UpsertAsync(Shipment());
    }

    private static async Task SeedSelectableCatalogsAsync(TestDatabase database)
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
        await catalogs.UpsertWorkerAsync(new CachedWorker(
            SecondWorkerId,
            OrganizationId,
            "María",
            true,
            StartedAt));
        await catalogs.UpsertWorkerAsync(new CachedWorker(
            ThirdWorkerId,
            OrganizationId,
            "Carlos",
            true,
            StartedAt));
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

    private static async Task<int> ExecuteWithoutParametersAsync(
        SqliteConnection connection,
        string sql)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = sql;
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

        public SqliteLocalOperationRepository Operations() => new(Factory);

        public SqliteCajuelaRepository Cajuelas() => new(Factory);

        public SqliteOperationDashboardRepository Dashboard() => new(Factory);

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
