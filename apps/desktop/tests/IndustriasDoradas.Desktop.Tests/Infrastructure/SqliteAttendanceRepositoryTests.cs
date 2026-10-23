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
public sealed class SqliteAttendanceRepositoryTests
{
    private static readonly Guid OrganizationId = Guid.Parse("30000000-0000-4000-8000-000000000001");
    private static readonly Guid PlantId = Guid.Parse("31000000-0000-4000-8000-000000000001");
    private static readonly Guid StationId = Guid.Parse("34000000-0000-4000-8000-000000000001");
    private static readonly Guid WorkerId = Guid.Parse("45000000-0000-4000-8000-000000000001");
    private static readonly Guid ManagerId = Guid.Parse("a1000000-0000-4000-8000-000000000002");
    private static readonly DateTimeOffset StartedAt = new(2026, 10, 15, 12, 0, 0, TimeSpan.Zero);

    [TestMethod]
    public async Task RecordPersistsEventAndOutboxAtomicallyWithSharedSequence()
    {
        await using var database = new AttendanceTestDatabase();
        await database.InitializeAsync();
        Guid checkInId = Guid.NewGuid();

        LocalAttendanceRegistration result = await database.Repository.RecordAsync(
            Mutation(checkInId, AttendanceEventType.CheckIn));

        Assert.IsFalse(result.WasDuplicate);
        Assert.AreEqual(1L, result.Event.ClientSequence);
        await using SqliteConnection connection = await database.Factory.OpenAsync();
        Assert.AreEqual(1L, await ScalarAsync(
            connection, "SELECT COUNT(*) FROM attendance_events WHERE client_event_id = $id;", checkInId));
        Assert.AreEqual(1L, await ScalarAsync(
            connection,
            "SELECT station_sequence FROM outbox_messages WHERE aggregate_id = $id;",
            checkInId));
        Assert.AreEqual("ATTENDANCE_EVENT_RECORDED", await TextAsync(
            connection,
            "SELECT operation_type FROM outbox_messages WHERE aggregate_id = $id;",
            checkInId));
    }

    [TestMethod]
    public async Task RetryIsIdempotentAndAdjustmentRequiresExistingCompatibleMark()
    {
        await using var database = new AttendanceTestDatabase();
        await database.InitializeAsync();
        Guid checkInId = Guid.NewGuid();
        RecordLocalAttendanceMutation checkIn = Mutation(checkInId, AttendanceEventType.CheckIn);
        await database.Repository.RecordAsync(checkIn);

        LocalAttendanceRegistration retry = await database.Repository.RecordAsync(checkIn);
        Guid adjustmentId = Guid.NewGuid();
        LocalAttendanceRegistration adjustment = await database.Repository.RecordAsync(
            Mutation(
                adjustmentId,
                AttendanceEventType.AdjustedCheckOut,
                correctedBy: ManagerId,
                reason: "Se completó la salida olvidada.",
                related: checkInId));

        Assert.IsTrue(retry.WasDuplicate);
        Assert.AreEqual(2L, adjustment.Event.ClientSequence);
        IReadOnlyList<AttendanceEvent> events = await database.Repository
            .ListForWorkerAsync(OrganizationId, WorkerId);
        Assert.HasCount(2, events);
        Assert.IsTrue(events[1].IsAdjustment);

        await Assert.ThrowsExactlyAsync<SqliteException>(() => database.Repository.RecordAsync(
            Mutation(
                Guid.NewGuid(),
                AttendanceEventType.AdjustedCheckIn,
                correctedBy: ManagerId,
                reason: "Referencia inexistente.",
                related: Guid.NewGuid())));
    }

    [TestMethod]
    public async Task CorrectionChainIsLinearAndKeepsEveryVersion()
    {
        await using var database = new AttendanceTestDatabase();
        await database.InitializeAsync();
        Guid checkInId = Guid.NewGuid();
        await database.Repository.RecordAsync(Mutation(checkInId, AttendanceEventType.CheckIn));
        Guid managerCorrectionId = Guid.NewGuid();
        await database.Repository.RecordAsync(Mutation(
            managerCorrectionId,
            AttendanceEventType.AdjustedCheckOut,
            correctedBy: ManagerId,
            reason: "El trabajador olvidó la salida.",
            related: checkInId));

        await Assert.ThrowsExactlyAsync<SqliteException>(() => database.Repository.RecordAsync(Mutation(
            Guid.NewGuid(),
            AttendanceEventType.AdjustedCheckOut,
            correctedBy: ManagerId,
            reason: "Segundo cierre no permitido.",
            related: checkInId)));

        await database.Repository.RecordAsync(Mutation(
            Guid.NewGuid(),
            AttendanceEventType.AdjustedCheckOut,
            correctedBy: Guid.Parse("a1000000-0000-4000-8000-000000000001"),
            reason: "Gerencia confirmó otra hora.",
            related: managerCorrectionId));

        IReadOnlyList<AttendanceEvent> events = await database.Repository
            .ListForWorkerAsync(OrganizationId, WorkerId);
        Assert.HasCount(3, events);
        AttendanceProjection projection = AttendanceProjectionService.Project(
            events,
            StartedAt.AddHours(10));
        Assert.HasCount(1, projection.Shifts);
        Assert.AreEqual(events[2].ClientEventId, projection.Shifts[0].CheckOut!.ClientEventId);
    }

    [TestMethod]
    public async Task PilotKeepsOvernightOfflineShiftAcrossRestartAndMotivatedCorrection()
    {
        await using var database = new AttendanceTestDatabase();
        await database.InitializeAsync();
        Guid checkInId = Guid.Parse("78000000-0000-4000-8000-000000000001");
        Guid correctionId = Guid.Parse("78000000-0000-4000-8000-000000000002");
        DateTimeOffset checkInAt = new(2026, 10, 20, 23, 30, 0, TimeSpan.Zero);
        DateTimeOffset actualCheckOutAt = new(2026, 10, 21, 13, 15, 0, TimeSpan.Zero);
        DateTimeOffset correctionRecordedAt = new(2026, 10, 21, 14, 0, 0, TimeSpan.Zero);

        await database.Repository.RecordAsync(new RecordLocalAttendanceMutation(
            checkInId,
            OrganizationId,
            PlantId,
            StationId,
            WorkerId,
            AttendanceEventType.CheckIn,
            checkInAt,
            checkInAt.AddSeconds(1)));

        var repositoryAfterRestart = new SqliteAttendanceRepository(database.Factory);
        IReadOnlyList<AttendanceEvent> afterRestart = await repositoryAfterRestart
            .ListForWorkerAsync(OrganizationId, WorkerId);
        AttendanceProjection openProjection = AttendanceProjectionService.Project(
            afterRestart,
            checkInAt.AddHours(9));

        Assert.HasCount(1, afterRestart);
        Assert.AreEqual(AttendanceSyncStatus.Pending, afterRestart[0].SyncStatus);
        Assert.AreEqual(AttendanceShiftStatus.Open, openProjection.Shifts[0].Status);
        Assert.AreEqual(AttendanceIncidentType.OpenShiftExceeded, openProjection.Incidents[0].Type);

        await repositoryAfterRestart.RecordAsync(new RecordLocalAttendanceMutation(
            correctionId,
            OrganizationId,
            PlantId,
            StationId,
            WorkerId,
            AttendanceEventType.AdjustedCheckOut,
            actualCheckOutAt,
            correctionRecordedAt,
            ManagerId,
            "El trabajador olvidó registrar la salida.",
            checkInId));

        var repositoryAfterSecondRestart = new SqliteAttendanceRepository(database.Factory);
        IReadOnlyList<AttendanceEvent> completedHistory = await repositoryAfterSecondRestart
            .ListForWorkerAsync(OrganizationId, WorkerId);
        AttendanceProjection completedProjection = AttendanceProjectionService.Project(
            completedHistory,
            correctionRecordedAt);

        Assert.HasCount(2, completedHistory);
        Assert.HasCount(1, completedProjection.Shifts);
        Assert.IsEmpty(completedProjection.Incidents);
        Assert.AreEqual(AttendanceShiftStatus.Completed, completedProjection.Shifts[0].Status);
        Assert.AreEqual(new DateOnly(2026, 10, 20), completedProjection.Shifts[0].StartedOn);
        Assert.AreEqual(TimeSpan.FromMinutes(825), completedProjection.Shifts[0].Duration);
        Assert.AreEqual(correctionId, completedProjection.Shifts[0].CheckOut!.ClientEventId);

        await using SqliteConnection connection = await database.Factory.OpenAsync();
        Assert.AreEqual(2L, await ScalarAsync(
            connection,
            "SELECT COUNT(*) FROM outbox_messages WHERE operation_type = 'ATTENDANCE_EVENT_RECORDED' AND aggregate_id IN ($first, $second);",
            ("$first", checkInId),
            ("$second", correctionId)));
    }

    [TestMethod]
    public async Task OutboxFailureRollsBackAttendanceAndHistoryCannotBeMutated()
    {
        await using var database = new AttendanceTestDatabase();
        await database.InitializeAsync();
        await using (SqliteConnection connection = await database.Factory.OpenAsync())
        await using (SqliteCommand command = connection.CreateCommand())
        {
            command.CommandText = """
                CREATE TRIGGER simulate_attendance_outbox_failure
                BEFORE INSERT ON outbox_messages
                WHEN NEW.operation_type = 'ATTENDANCE_EVENT_RECORDED'
                BEGIN
                    SELECT RAISE(ABORT, 'SIMULATED_OUTBOX_FAILURE');
                END;
                """;
            await command.ExecuteNonQueryAsync();
        }

        Guid failedId = Guid.NewGuid();
        await Assert.ThrowsExactlyAsync<SqliteException>(
            () => database.Repository.RecordAsync(Mutation(failedId, AttendanceEventType.CheckIn)));
        await using (SqliteConnection connection = await database.Factory.OpenAsync())
        {
            Assert.AreEqual(0L, await ScalarAsync(
                connection, "SELECT COUNT(*) FROM attendance_events WHERE client_event_id = $id;", failedId));
            await using SqliteCommand drop = connection.CreateCommand();
            drop.CommandText = "DROP TRIGGER simulate_attendance_outbox_failure;";
            await drop.ExecuteNonQueryAsync();
        }

        LocalAttendanceRegistration recorded = await database.Repository.RecordAsync(
            Mutation(Guid.NewGuid(), AttendanceEventType.CheckIn));
        await using SqliteConnection mutationConnection = await database.Factory.OpenAsync();
        await using SqliteCommand mutation = mutationConnection.CreateCommand();
        mutation.CommandText = "UPDATE attendance_events SET occurred_at_utc = recorded_at_utc WHERE client_event_id = $id;";
        mutation.Parameters.AddWithValue("$id", recorded.Event.ClientEventId.ToString("D"));
        SqliteException exception = await Assert.ThrowsExactlyAsync<SqliteException>(
            () => mutation.ExecuteNonQueryAsync());
        StringAssert.Contains(exception.Message, "ATTENDANCE_HISTORY_IS_APPEND_ONLY");
    }

    private static RecordLocalAttendanceMutation Mutation(
        Guid id,
        AttendanceEventType type,
        Guid? correctedBy = null,
        string? reason = null,
        Guid? related = null) =>
        new(
            id,
            OrganizationId,
            PlantId,
            StationId,
            WorkerId,
            type,
            StartedAt,
            StartedAt.AddSeconds(1),
            correctedBy,
            reason,
            related);

    private static async Task<long> ScalarAsync(
        SqliteConnection connection,
        string sql,
        Guid id)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = sql;
        command.Parameters.AddWithValue("$id", id.ToString("D"));
        return Convert.ToInt64(await command.ExecuteScalarAsync(), CultureInfo.InvariantCulture);
    }

    private static async Task<long> ScalarAsync(
        SqliteConnection connection,
        string sql,
        params (string Name, Guid Value)[] parameters)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = sql;
        foreach ((string name, Guid value) in parameters)
        {
            command.Parameters.AddWithValue(name, value.ToString("D"));
        }

        return Convert.ToInt64(await command.ExecuteScalarAsync(), CultureInfo.InvariantCulture);
    }

    private static async Task<string> TextAsync(
        SqliteConnection connection,
        string sql,
        Guid id)
    {
        await using SqliteCommand command = connection.CreateCommand();
        command.CommandText = sql;
        command.Parameters.AddWithValue("$id", id.ToString("D"));
        return Convert.ToString(await command.ExecuteScalarAsync(), CultureInfo.InvariantCulture) ?? string.Empty;
    }

    private sealed class AttendanceTestDatabase : IAsyncDisposable
    {
        private readonly string root;

        public AttendanceTestDatabase()
        {
            root = Path.Combine(
                Path.GetTempPath(),
                "IndustriasDoradas.Attendance.Tests",
                Guid.NewGuid().ToString("N"));
            IOptions<LocalDatabaseOptions> options = Options.Create(new LocalDatabaseOptions
            {
                BaseDirectory = root,
                BusyTimeoutSeconds = 1,
            });
            var paths = new StationDatabasePathProvider(
                Options.Create(new StationOptions { Id = StationId }),
                options);
            Factory = new SqliteConnectionFactory(paths, options);
            Repository = new SqliteAttendanceRepository(Factory);
        }

        public SqliteConnectionFactory Factory { get; }

        public SqliteAttendanceRepository Repository { get; }

        public async Task InitializeAsync()
        {
            await new SqliteDatabaseMigrator(Factory).MigrateAsync();
            await using SqliteConnection connection = await Factory.OpenAsync();
            await using SqliteCommand command = connection.CreateCommand();
            command.CommandText = """
                INSERT INTO cached_workers(id, organization_id, name, is_active, updated_at_utc)
                VALUES ($id, $organizationId, 'Operario de prueba', 1, $updatedAt);
                """;
            command.Parameters.AddWithValue("$id", WorkerId.ToString("D"));
            command.Parameters.AddWithValue("$organizationId", OrganizationId.ToString("D"));
            command.Parameters.AddWithValue("$updatedAt", StartedAt.ToString("O"));
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
