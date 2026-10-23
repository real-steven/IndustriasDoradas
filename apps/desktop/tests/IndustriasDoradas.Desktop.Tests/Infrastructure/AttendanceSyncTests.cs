using System.IO;
using System.Text.Json;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Configuration;
using IndustriasDoradas.Desktop.Domain.Attendance;
using IndustriasDoradas.Desktop.Infrastructure.LocalStorage;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Tests.Infrastructure;

[TestClass]
public sealed class AttendanceSyncTests
{
    private static readonly Guid OrganizationId = Guid.Parse("30000000-0000-4000-8000-000000000001");
    private static readonly Guid PlantId = Guid.Parse("31000000-0000-4000-8000-000000000001");
    private static readonly Guid OriginStationId = Guid.Parse("34000000-0000-4000-8000-000000000001");
    private static readonly Guid PeerStationId = Guid.Parse("34000000-0000-4000-8000-000000000002");
    private static readonly Guid WorkerId = Guid.Parse("b1000000-0000-4000-8000-000000000001");
    private static readonly Guid ManagerId = Guid.Parse("a1000000-0000-4000-8000-000000000002");
    private static readonly Guid CheckInId = Guid.Parse("77000000-0000-4000-8000-000000000001");
    private static readonly Guid CorrectionId = Guid.Parse("77000000-0000-4000-8000-000000000002");
    private static readonly DateTimeOffset OccurredAt = new(2026, 10, 19, 12, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset RecordedAt = OccurredAt.AddSeconds(1);
    private static readonly DateTimeOffset ServerTime = OccurredAt.AddHours(24).AddSeconds(1);

    [TestMethod]
    public async Task TwoStationsConvergeAfterOfflineDayAndRemoteCorrectionWithoutRewritingHistory()
    {
        await using var origin = new TestDatabase(OriginStationId);
        await using var peer = new TestDatabase(PeerStationId);
        await origin.InitializeAsync();
        await peer.InitializeAsync();

        await origin.Attendance.RecordAsync(new RecordLocalAttendanceMutation(
            CheckInId,
            OrganizationId,
            PlantId,
            OriginStationId,
            WorkerId,
            AttendanceEventType.CheckIn,
            OccurredAt,
            RecordedAt));

        SyncPullPage page = Page();
        await new SqliteSyncChangeRepository(origin.Factory).ApplyPageAsync(page);
        await new SqliteSyncChangeRepository(peer.Factory).ApplyPageAsync(page);
        await new SqliteSyncChangeRepository(peer.Factory).ApplyPageAsync(page);

        IReadOnlyList<AttendanceEvent> originEvents = await origin.Attendance
            .ListForWorkerAsync(OrganizationId, WorkerId);
        IReadOnlyList<AttendanceEvent> peerEvents = await peer.Attendance
            .ListForWorkerAsync(OrganizationId, WorkerId);
        Assert.HasCount(2, originEvents);
        Assert.HasCount(2, peerEvents);
        CollectionAssert.AreEqual(
            originEvents.Select(EventSignature).ToArray(),
            peerEvents.Select(EventSignature).ToArray());
        Assert.AreEqual(OccurredAt, originEvents[0].OccurredAt);
        Assert.AreEqual(AttendanceSyncStatus.Synchronized, originEvents[0].SyncStatus);
        Assert.AreEqual(ServerTime, originEvents[0].ConfirmedAt);

        AttendanceProjection projection = AttendanceProjectionService.Project(
            peerEvents,
            ServerTime.AddHours(1));
        Assert.HasCount(1, projection.Shifts);
        Assert.AreEqual(AttendanceShiftStatus.Completed, projection.Shifts[0].Status);
        Assert.AreEqual(CorrectionId, projection.Shifts[0].CheckOut?.ClientEventId);
    }

    private static SyncPullPage Page()
    {
        using JsonDocument checkIn = JsonDocument.Parse($$"""
            {"id":"{{CheckInId:D}}","organization_id":"{{OrganizationId:D}}",
             "plant_id":"{{PlantId:D}}","station_id":"{{OriginStationId:D}}",
             "worker_id":"{{WorkerId:D}}","client_sequence":1,"event_type":"CHECK_IN",
             "occurred_at_utc":"{{OccurredAt:O}}","recorded_at_utc":"{{RecordedAt:O}}",
             "confirmed_at_utc":"{{ServerTime:O}}","sync_status":"SYNCHRONIZED",
             "corrected_by_profile_id":null,"correction_reason":null,"related_event_id":null}
            """);
        using JsonDocument correction = JsonDocument.Parse($$"""
            {"id":"{{CorrectionId:D}}","organization_id":"{{OrganizationId:D}}",
             "plant_id":"{{PlantId:D}}","station_id":"{{OriginStationId:D}}",
             "worker_id":"{{WorkerId:D}}","client_sequence":2,
             "event_type":"ADJUSTED_CHECK_OUT",
             "occurred_at_utc":"{{OccurredAt.AddHours(10):O}}",
             "recorded_at_utc":"{{ServerTime.AddSeconds(-1):O}}",
             "confirmed_at_utc":"{{ServerTime:O}}","sync_status":"SYNCHRONIZED",
             "corrected_by_profile_id":"{{ManagerId:D}}",
             "correction_reason":"Salida olvidada confirmada.",
             "related_event_id":"{{CheckInId:D}}"}
            """);
        return new SyncPullPage(
            1,
            null,
            "attendance-cursor",
            false,
            ServerTime,
            [
                new SyncChange(Guid.NewGuid(), 1, "ATTENDANCE_EVENT", CheckInId, 1,
                    "UPSERT", ServerTime, 1, checkIn.RootElement.Clone()),
                new SyncChange(Guid.NewGuid(), 2, "ATTENDANCE_EVENT", CorrectionId, 2,
                    "CORRECTION_APPENDED", ServerTime, 1, correction.RootElement.Clone()),
            ]);
    }

    private static string EventSignature(AttendanceEvent attendanceEvent) => string.Join(
        '|',
        attendanceEvent.ClientEventId,
        attendanceEvent.Type,
        attendanceEvent.OccurredAt,
        attendanceEvent.RecordedAt,
        attendanceEvent.RelatedEventId,
        attendanceEvent.SyncStatus);

    private sealed class TestDatabase : IAsyncDisposable
    {
        private readonly string root = Path.Combine(
            Path.GetTempPath(),
            "IndustriasDoradas.AttendanceSync.Tests",
            Guid.NewGuid().ToString("N"));

        public TestDatabase(Guid stationId)
        {
            IOptions<LocalDatabaseOptions> options = Options.Create(new LocalDatabaseOptions
            {
                BaseDirectory = root,
                BusyTimeoutSeconds = 2,
            });
            var paths = new StationDatabasePathProvider(
                Options.Create(new StationOptions { Id = stationId }),
                options);
            Factory = new SqliteConnectionFactory(paths, options);
            Attendance = new SqliteAttendanceRepository(Factory);
        }

        public SqliteConnectionFactory Factory { get; }

        public SqliteAttendanceRepository Attendance { get; }

        public async Task InitializeAsync()
        {
            await new SqliteDatabaseMigrator(Factory).MigrateAsync();
            await using SqliteConnection connection = await Factory.OpenAsync();
            await using SqliteCommand command = connection.CreateCommand();
            command.CommandText = """
                INSERT INTO cached_workers(id, organization_id, name, is_active, updated_at_utc)
                VALUES ($id, $organizationId, 'Operario sincronizado', 1, $updatedAt);
                """;
            command.Parameters.AddWithValue("$id", WorkerId.ToString("D"));
            command.Parameters.AddWithValue("$organizationId", OrganizationId.ToString("D"));
            command.Parameters.AddWithValue("$updatedAt", OccurredAt.ToString("O"));
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
