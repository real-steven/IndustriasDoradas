using System.Diagnostics;
using System.Globalization;
using System.IO;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Configuration;
using IndustriasDoradas.Desktop.Domain.Attendance;
using IndustriasDoradas.Desktop.Infrastructure.LocalStorage;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Tests.Infrastructure;

[TestClass]
[TestCategory("SystemStress")]
public sealed class SystemStressTests
{
    private const int ConcurrentSessions = 50;
    private const int CyclesPerSession = 10;
    private const int EventsPerSession = CyclesPerSession * 2;
    private const int ExpectedEvents = ConcurrentSessions * EventsPerSession;
    private static readonly Guid OrganizationId = Guid.Parse("30000000-0000-4000-8000-000000000001");
    private static readonly Guid PlantId = Guid.Parse("31000000-0000-4000-8000-000000000001");
    private static readonly Guid StationId = Guid.Parse("34000000-0000-4000-8000-000000000050");
    private static readonly Guid ProfileId = Guid.Parse("a1000000-0000-4000-8000-000000000002");
    private static readonly DateTimeOffset StartedAt = new(2026, 10, 20, 12, 0, 0, TimeSpan.Zero);

    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task FiftyConcurrentOfflineSessionsReconnectWithoutLossOrDuplication()
    {
        await using var database = new StressDatabase();
        await database.InitializeAsync();
        long memoryBefore = GC.GetTotalMemory(forceFullCollection: true);
        var recordingTime = Stopwatch.StartNew();

        Task[] sessions = Enumerable.Range(1, ConcurrentSessions)
            .Select(sessionNumber => RecordSessionAsync(database.Attendance, sessionNumber))
            .ToArray();
        await Task.WhenAll(sessions);
        recordingTime.Stop();

        await using (SqliteConnection connection = await database.Factory.OpenAsync())
        {
            Assert.AreEqual(ExpectedEvents, await ScalarAsync(
                connection, "SELECT COUNT(*) FROM attendance_events;"));
            Assert.AreEqual(ExpectedEvents, await ScalarAsync(
                connection, "SELECT COUNT(*) FROM outbox_messages WHERE state = 'PENDING';"));
            Assert.AreEqual(ExpectedEvents, await ScalarAsync(
                connection, "SELECT COUNT(DISTINCT station_sequence) FROM outbox_messages;"));
        }

        var reconnectionTime = Stopwatch.StartNew();
        SqliteOutboxRepository outbox = database.Outbox();
        ClaimResult[] claims = await Task.WhenAll(
            Enumerable.Range(0, ConcurrentSessions).Select(async sessionNumber =>
            {
                Guid claimId = Guid.NewGuid();
                IReadOnlyList<ClaimedOutboxMessage> messages = await outbox.ClaimAsync(
                    StationId,
                    claimId,
                    EventsPerSession,
                    StartedAt.AddDays(1).AddMilliseconds(sessionNumber),
                    StartedAt.AddDays(1).AddMinutes(5),
                    LegacyEvidence());
                return new ClaimResult(claimId, messages);
            }));

        Assert.IsTrue(claims.All(item => item.Messages.Count == EventsPerSession));
        Assert.AreEqual(
            ExpectedEvents,
            claims.SelectMany(item => item.Messages).Select(item => item.Message.Id).Distinct().Count());

        await Task.WhenAll(claims.Select(item => outbox.CompleteClaimAsync(
            item.ClaimId,
            item.Messages.Select(message => new OutboxItemDisposition(
                message.Message.Id,
                "APPLIED",
                "APPLIED",
                message.Message.Id)).ToArray(),
            StartedAt.AddDays(1).AddMinutes(1),
            _ => TimeSpan.Zero)));
        reconnectionTime.Stop();

        var repositoryAfterRestart = new SqliteAttendanceRepository(database.Factory);
        for (int sessionNumber = 1; sessionNumber <= ConcurrentSessions; sessionNumber++)
        {
            IReadOnlyList<AttendanceEvent> history = await repositoryAfterRestart.ListForWorkerAsync(
                OrganizationId,
                WorkerId(sessionNumber));
            AttendanceProjection projection = AttendanceProjectionService.Project(
                history,
                StartedAt.AddDays(1));
            Assert.HasCount(EventsPerSession, history);
            Assert.HasCount(CyclesPerSession, projection.Shifts);
            Assert.IsEmpty(projection.Incidents);
        }

        long memoryAfter = GC.GetTotalMemory(forceFullCollection: true);
        await using SqliteConnection finalConnection = await database.Factory.OpenAsync();
        Assert.AreEqual(ExpectedEvents, await ScalarAsync(
            finalConnection, "SELECT COUNT(*) FROM outbox_messages WHERE state = 'SYNCED';"));
        Assert.AreEqual(ExpectedEvents, await ScalarAsync(
            finalConnection, "SELECT COUNT(DISTINCT central_receipt_id) FROM outbox_messages;"));
        Assert.AreEqual(0L, await ScalarAsync(
            finalConnection, "SELECT COUNT(*) FROM outbox_messages WHERE state <> 'SYNCED';"));
        Assert.AreEqual("ok", await TextAsync(finalConnection, "PRAGMA integrity_check;"), ignoreCase: true);
        long databaseBytes = await ScalarAsync(
            finalConnection, "SELECT page_count * page_size FROM pragma_page_count(), pragma_page_size();");

        TestContext.WriteLine(FormattableString.Invariant(
            $"SYSTEM_STRESS_LOCAL sessions={ConcurrentSessions} events={ExpectedEvents} record_ms={recordingTime.Elapsed.TotalMilliseconds:F0} reconnect_ms={reconnectionTime.Elapsed.TotalMilliseconds:F0} database_bytes={databaseBytes} managed_growth_bytes={Math.Max(0, memoryAfter - memoryBefore)}"));
    }

    private static async Task RecordSessionAsync(
        SqliteAttendanceRepository repository,
        int sessionNumber)
    {
        Guid workerId = WorkerId(sessionNumber);
        for (int cycle = 0; cycle < CyclesPerSession; cycle++)
        {
            DateTimeOffset checkInAt = StartedAt
                .AddMinutes(sessionNumber)
                .AddHours(cycle * 2);
            await repository.RecordAsync(new RecordLocalAttendanceMutation(
                Guid.NewGuid(),
                OrganizationId,
                PlantId,
                StationId,
                workerId,
                AttendanceEventType.CheckIn,
                checkInAt,
                checkInAt.AddSeconds(1)));
            await repository.RecordAsync(new RecordLocalAttendanceMutation(
                Guid.NewGuid(),
                OrganizationId,
                PlantId,
                StationId,
                workerId,
                AttendanceEventType.CheckOut,
                checkInAt.AddMinutes(90),
                checkInAt.AddMinutes(90).AddSeconds(1)));
        }
    }

    private static Guid WorkerId(int sessionNumber) =>
        Guid.Parse($"b5000000-0000-4000-8000-{sessionNumber:D12}");

    private static OutboxAuthorizationEvidence LegacyEvidence() => new(
        ProfileId,
        1,
        StartedAt.AddHours(-25),
        StartedAt.AddHours(-1),
        "LEGACY_UNAVAILABLE");

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

    private sealed record ClaimResult(
        Guid ClaimId,
        IReadOnlyList<ClaimedOutboxMessage> Messages);

    private sealed class StressDatabase : IAsyncDisposable
    {
        private readonly string root = Path.Combine(
            Path.GetTempPath(),
            "IndustriasDoradas.SystemStress",
            Guid.NewGuid().ToString("N"));

        public StressDatabase()
        {
            IOptions<LocalDatabaseOptions> options = Options.Create(new LocalDatabaseOptions
            {
                BaseDirectory = root,
                BusyTimeoutSeconds = 30,
            });
            var paths = new StationDatabasePathProvider(
                Options.Create(new StationOptions { Id = StationId }),
                options);
            Factory = new SqliteConnectionFactory(paths, options);
            Attendance = new SqliteAttendanceRepository(Factory);
        }

        public SqliteConnectionFactory Factory { get; }
        public SqliteAttendanceRepository Attendance { get; }
        public SqliteOutboxRepository Outbox() => new(Factory);

        public async Task InitializeAsync()
        {
            await new SqliteDatabaseMigrator(Factory).MigrateAsync();
            await using SqliteConnection connection = await Factory.OpenAsync();
            await using SqliteTransaction transaction = (SqliteTransaction)await connection.BeginTransactionAsync();
            for (int sessionNumber = 1; sessionNumber <= ConcurrentSessions; sessionNumber++)
            {
                await using SqliteCommand command = connection.CreateCommand();
                command.Transaction = transaction;
                command.CommandText = """
                    INSERT INTO cached_workers(id, organization_id, name, is_active, updated_at_utc)
                    VALUES ($id, $organizationId, $name, 1, $updatedAt);
                    """;
                command.Parameters.AddWithValue("$id", WorkerId(sessionNumber).ToString("D"));
                command.Parameters.AddWithValue("$organizationId", OrganizationId.ToString("D"));
                command.Parameters.AddWithValue("$name", $"Operario estrés {sessionNumber}");
                command.Parameters.AddWithValue("$updatedAt", StartedAt.ToString("O", CultureInfo.InvariantCulture));
                await command.ExecuteNonQueryAsync();
            }

            await transaction.CommitAsync();
        }

        public ValueTask DisposeAsync()
        {
            SqliteConnection.ClearAllPools();
            if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
            return ValueTask.CompletedTask;
        }
    }
}
