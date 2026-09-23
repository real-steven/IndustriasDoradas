using System.Diagnostics;
using System.Globalization;
using System.IO;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Configuration;
using IndustriasDoradas.Desktop.Infrastructure.LocalStorage;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Tests.Infrastructure;

[TestClass]
[TestCategory("SyncChaos")]
public sealed class SyncChaosVolumeTests
{
    private const int PendingCount = 10_000;
    private const long MaximumManagedGrowthBytes = 256L * 1024 * 1024;
    private static readonly TimeSpan MaximumElapsed = TimeSpan.FromMinutes(2);
    private static readonly DateTimeOffset Now = new(2026, 9, 22, 18, 0, 0, TimeSpan.Zero);
    private static readonly Guid StationId = Guid.Parse("34000000-0000-4000-8000-000000000001");
    private static readonly Guid ProfileId = Guid.Parse("a1000000-0000-4000-8000-000000000002");

    [TestMethod]
    public async Task TenThousandPendingMessagesDrainWithoutLossDuplicationOrConcurrentDoubleClaim()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        long memoryBefore = GC.GetTotalMemory(forceFullCollection: true);
        var elapsed = Stopwatch.StartNew();
        await SeedPendingAsync(database.Factory, PendingCount);
        SqliteOutboxRepository repository = database.Outbox();
        OutboxAuthorizationEvidence evidence = LegacyEvidence();

        Guid leftClaimId = Guid.NewGuid();
        Guid rightClaimId = Guid.NewGuid();
        Task<IReadOnlyList<ClaimedOutboxMessage>> leftTask = Task.Run(() => repository.ClaimAsync(
            StationId,
            leftClaimId,
            500,
            Now,
            Now.AddMinutes(1),
            evidence));
        Task<IReadOnlyList<ClaimedOutboxMessage>> rightTask = Task.Run(() => repository.ClaimAsync(
            StationId,
            rightClaimId,
            500,
            Now,
            Now.AddMinutes(1),
            evidence));
        await Task.WhenAll(leftTask, rightTask);
        IReadOnlyList<ClaimedOutboxMessage> left = await leftTask;
        IReadOnlyList<ClaimedOutboxMessage> right = await rightTask;

        Assert.HasCount(500, left);
        Assert.HasCount(500, right);
        Assert.AreEqual(1_000, left.Concat(right).Select(item => item.Message.Id).Distinct().Count());
        await CompleteAsync(repository, leftClaimId, left, Now);
        await CompleteAsync(repository, rightClaimId, right, Now);

        int processed = left.Count + right.Count;
        int batchNumber = 2;
        while (processed < PendingCount)
        {
            DateTimeOffset batchTime = Now.AddMilliseconds(++batchNumber);
            Guid claimId = Guid.NewGuid();
            IReadOnlyList<ClaimedOutboxMessage> claimed = await repository.ClaimAsync(
                StationId,
                claimId,
                500,
                batchTime,
                batchTime.AddMinutes(1),
                evidence);
            Assert.IsNotEmpty(claimed);
            await CompleteAsync(repository, claimId, claimed, batchTime);
            processed += claimed.Count;
        }

        elapsed.Stop();
        long memoryAfter = GC.GetTotalMemory(forceFullCollection: true);
        long managedGrowth = Math.Max(0, memoryAfter - memoryBefore);
        await using SqliteConnection connection = await database.Factory.OpenAsync();
        Assert.AreEqual(PendingCount, await ScalarAsync(
            connection,
            "SELECT COUNT(*) FROM outbox_messages WHERE state = 'SYNCED';"));
        Assert.AreEqual(PendingCount, await ScalarAsync(
            connection,
            "SELECT COUNT(DISTINCT central_receipt_id) FROM outbox_messages;"));
        Assert.AreEqual(0L, await ScalarAsync(
            connection,
            "SELECT COUNT(*) FROM outbox_messages WHERE state <> 'SYNCED';"));
        Assert.AreEqual("ok", await TextAsync(connection, "PRAGMA integrity_check;"), ignoreCase: true);
        Assert.IsTrue(elapsed.Elapsed < MaximumElapsed,
            $"Procesar {PendingCount} mensajes tomó {elapsed.Elapsed.TotalSeconds:F2} s.");
        Assert.IsTrue(managedGrowth < MaximumManagedGrowthBytes,
            $"El crecimiento administrado fue {managedGrowth / 1024d / 1024d:F2} MiB.");
        Console.WriteLine(FormattableString.Invariant(
            $"SYNC_CHAOS_VOLUME pending={PendingCount} elapsed_ms={elapsed.Elapsed.TotalMilliseconds:F0} managed_growth_bytes={managedGrowth} batch_size=500"));
    }

    [TestMethod]
    public async Task PartialBatchReturnsUnmentionedMessagesToPendingWithStableCause()
    {
        await using var database = new TestDatabase();
        await database.Migrator.MigrateAsync();
        await SeedPendingAsync(database.Factory, 3);
        SqliteOutboxRepository repository = database.Outbox();
        Guid claimId = Guid.NewGuid();
        IReadOnlyList<ClaimedOutboxMessage> claimed = await repository.ClaimAsync(
            StationId,
            claimId,
            3,
            Now,
            Now.AddMinutes(1),
            LegacyEvidence());

        await repository.CompleteClaimAsync(
            claimId,
            [new(claimed[0].Message.Id, "APPLIED", "APPLIED", claimed[0].Message.Id)],
            Now,
            _ => TimeSpan.FromSeconds(1));

        await using SqliteConnection connection = await database.Factory.OpenAsync();
        Assert.AreEqual(1L, await ScalarAsync(
            connection,
            "SELECT COUNT(*) FROM outbox_messages WHERE state = 'SYNCED';"));
        Assert.AreEqual(2L, await ScalarAsync(
            connection,
            "SELECT COUNT(*) FROM outbox_messages WHERE state = 'PENDING' AND last_error_code = 'INCOMPLETE_SERVER_RESPONSE';"));
        Assert.AreEqual(0L, await ScalarAsync(
            connection,
            "SELECT COUNT(*) FROM outbox_messages WHERE state = 'SYNCING';"));
    }

    private static async Task CompleteAsync(
        SqliteOutboxRepository repository,
        Guid claimId,
        IReadOnlyList<ClaimedOutboxMessage> claimed,
        DateTimeOffset completedAt)
    {
        await repository.CompleteClaimAsync(
            claimId,
            claimed.Select(item => new OutboxItemDisposition(
                item.Message.Id,
                "APPLIED",
                "APPLIED",
                item.Message.Id)).ToArray(),
            completedAt,
            _ => TimeSpan.Zero);
    }

    private static OutboxAuthorizationEvidence LegacyEvidence() => new(
        ProfileId,
        1,
        Now.AddHours(-25),
        Now.AddHours(-1),
        "LEGACY_UNAVAILABLE");

    private static async Task SeedPendingAsync(SqliteConnectionFactory factory, int count)
    {
        await using SqliteConnection connection = await factory.OpenAsync();
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            WITH RECURSIVE sequence(value) AS (
                SELECT 1
                UNION ALL
                SELECT value + 1 FROM sequence WHERE value < $count
            )
            INSERT INTO outbox_messages(
                id, station_id, station_sequence, operation_type, aggregate_type,
                aggregate_id, payload_json, state, attempt_count, created_at_utc, updated_at_utc)
            SELECT
                printf('60000000-0000-4000-8000-%012d', value),
                $stationId,
                value,
                'PRODUCTION_EVENT_CREATED',
                'production_event',
                printf('60000000-0000-4000-8000-%012d', value),
                json_object('schemaVersion', 2, 'stationId', $stationId),
                'PENDING',
                0,
                $now,
                $now
            FROM sequence;
            """;
        command.Parameters.AddWithValue("$count", count);
        command.Parameters.AddWithValue("$stationId", StationId.ToString("D"));
        command.Parameters.AddWithValue("$now", Now.ToString("O", CultureInfo.InvariantCulture));
        await command.ExecuteNonQueryAsync();
    }

    private static async Task<long> ScalarAsync(SqliteConnection connection, string sql)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = sql;
        return Convert.ToInt64(await command.ExecuteScalarAsync(), CultureInfo.InvariantCulture);
    }

    private static async Task<string> TextAsync(SqliteConnection connection, string sql)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = sql;
        return Convert.ToString(await command.ExecuteScalarAsync(), CultureInfo.InvariantCulture) ?? string.Empty;
    }

    private sealed class TestDatabase : IAsyncDisposable
    {
        private readonly string root = Path.Combine(
            Path.GetTempPath(),
            "IndustriasDoradas.SyncChaos",
            Guid.NewGuid().ToString("N"));

        public TestDatabase()
        {
            IOptions<LocalDatabaseOptions> options = Options.Create(new LocalDatabaseOptions
            {
                BaseDirectory = root,
                BusyTimeoutSeconds = 10,
            });
            var pathProvider = new StationDatabasePathProvider(
                Options.Create(new StationOptions { Id = StationId }),
                options);
            Factory = new SqliteConnectionFactory(pathProvider, options);
            Migrator = new SqliteDatabaseMigrator(Factory);
        }

        public SqliteConnectionFactory Factory { get; }
        public SqliteDatabaseMigrator Migrator { get; }
        public SqliteOutboxRepository Outbox() => new(Factory);

        public ValueTask DisposeAsync()
        {
            SqliteConnection.ClearAllPools();
            if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
            return ValueTask.CompletedTask;
        }
    }
}
