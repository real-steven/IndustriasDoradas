using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Configuration;
using IndustriasDoradas.Desktop.Domain;
using IndustriasDoradas.Desktop.Presentation.ViewModels;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Tests.Presentation;

[TestClass]
public sealed class DiagnosticsViewModelTests
{
    [TestMethod]
    public async Task RefreshAsyncExposesDetailsWhenApiIsAvailable()
    {
        DateTimeOffset checkedAt = new(2026, 8, 13, 12, 0, 0, TimeSpan.Zero);
        DiagnosticsViewModel viewModel = new(
            new StubHealthService(SystemHealth.Available("industrias-doradas-api", checkedAt)),
            new StubLocalDiagnostics(Healthy()));

        await viewModel.RefreshAsync();

        Assert.AreEqual(HealthState.Available, viewModel.State);
        Assert.AreEqual("API disponible", viewModel.StatusTitle);
        Assert.AreEqual("industrias-doradas-api", viewModel.Service);
        Assert.AreNotEqual("—", viewModel.LastChecked);
    }

    [TestMethod]
    public async Task RefreshAsyncKeepsRecoverableStateWhenApiIsUnavailable()
    {
        DiagnosticsViewModel viewModel = new(
            new StubHealthService(
                SystemHealth.Unavailable("No fue posible establecer conexión con la API.")),
            new StubLocalDiagnostics(Healthy()));

        await viewModel.RefreshAsync();

        Assert.AreEqual(HealthState.Unavailable, viewModel.State);
        Assert.AreEqual("API no disponible", viewModel.StatusTitle);
        StringAssert.Contains(viewModel.StatusMessage, "conexión");
        Assert.AreEqual("No disponible", viewModel.Service);
    }

    [TestMethod]
    public async Task RefreshExposesLocalPendingSpaceAndRecoveryInstructionIndependentlyFromApi()
    {
        var local = new LocalDatabaseHealth(
            LocalDatabaseHealthState.Attention,
            LocalDatabaseHealthIssue.LowDiskSpace,
            7,
            90 * 1024L * 1024L,
            new DateTimeOffset(2026, 8, 27, 12, 0, 0, TimeSpan.Zero),
            new DateTimeOffset(2026, 8, 27, 12, 1, 0, TimeSpan.Zero),
            "Queda poco espacio.",
            "Libere espacio antes de continuar.",
            3,
            11,
            new DateTimeOffset(2026, 8, 27, 12, 0, 30, TimeSpan.Zero),
            9,
            [new SyncFailureDiagnostic(
                "PRODUCTION_EVENT_CREATED", "LINE_REVOKED", "La línea fue revocada.", 2,
                new DateTimeOffset(2026, 8, 27, 11, 0, 0, TimeSpan.Zero),
                new DateTimeOffset(2026, 8, 27, 12, 0, 0, TimeSpan.Zero))],
            [new AdministrativeCorrectionDiagnostic(
                "Administrador", "ADMINISTRADOR", "CAMBIO_AUTORIZADO", "business.mutation",
                "supplier", new DateTimeOffset(2026, 8, 27, 12, 0, 0, TimeSpan.Zero),
                ["name: A → B"])],
            1,
            "UNAVAILABLE",
            "NETWORK_UNAVAILABLE");
        DiagnosticsViewModel viewModel = new(
            new StubHealthService(SystemHealth.Unavailable("Sin red.")),
            new StubLocalDiagnostics(local));

        await viewModel.RefreshAsync();

        Assert.AreEqual(LocalDatabaseHealthState.Attention, viewModel.LocalState);
        Assert.AreEqual(
            "7 pendientes · 3 requieren revisión · 11 sincronizados",
            viewModel.PendingOperations);
        Assert.AreEqual("90 MB libres", viewModel.AvailableSpace);
        StringAssert.Contains(viewModel.LocalRecoveryInstruction, "Libere espacio");
        Assert.AreEqual("API no disponible", viewModel.StatusTitle);
        Assert.AreEqual("Sin sincronización · NETWORK_UNAVAILABLE", viewModel.NetworkStatus);
        Assert.AreEqual(1, viewModel.Failures.Count);
        Assert.AreEqual(3, viewModel.FailedReviewCount);
        Assert.AreEqual("Registro o corrección de cajuela", viewModel.Failures[0].OperationDescription);
        Assert.IsTrue(viewModel.HasCorrections);
        Assert.AreEqual(1, viewModel.PullReviewCount);
        var audit = new AuditViewModel(viewModel);
        StringAssert.Contains(audit.LocalReviewCountDescription, "3 evento(s)");
        StringAssert.Contains(audit.LocalReviewCountDescription, "1 más recientes");
        StringAssert.Contains(viewModel.ClockDeviation, "revisar reloj");
    }

    [TestMethod]
    public async Task ReceivedAdministrativeCorrectionRefreshesNotificationWithoutRestart()
    {
        var correction = new AdministrativeCorrectionDiagnostic(
            "Administrador", "ADMINISTRADOR", "CAMBIO_AUTORIZADO", "business.mutation",
            "supplier", DateTimeOffset.UtcNow, ["name: A → B"]);
        LocalDatabaseHealth local = Healthy() with { Corrections = [correction] };
        var notifier = new SyncStatusNotifier();
        DiagnosticsViewModel viewModel = new(
            new StubHealthService(SystemHealth.Available("api", DateTimeOffset.UtcNow)),
            new StubLocalDiagnostics(local),
            Options.Create(new StationOptions()),
            notifier);
        var changed = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        viewModel.PropertyChanged += (_, args) =>
        {
            if (args.PropertyName == nameof(DiagnosticsViewModel.HasCorrections)) changed.TrySetResult();
        };

        notifier.Notify(new SyncStatusNotification(true));
        await changed.Task.WaitAsync(TimeSpan.FromSeconds(1));

        Assert.IsTrue(viewModel.HasCorrections);
    }

    [TestMethod]
    public async Task AuditRequiresLineAndShipmentSelectionBeforeShowingDetails()
    {
        Guid firstLineId = Guid.NewGuid();
        Guid secondLineId = Guid.NewGuid();
        DateTimeOffset now = DateTimeOffset.UtcNow;
        LocalCompletedShipmentAudit[] shipments =
        [
            Shipment(firstLineId, "Línea 1", "Proveedor A", now.AddHours(-4), now.AddHours(-3)),
            Shipment(firstLineId, "Línea 1", "Proveedor B", now.AddHours(-2), now.AddHours(-1)),
            Shipment(secondLineId, "Línea 2", "Proveedor C", now.AddHours(-1), now),
        ];
        DiagnosticsViewModel diagnostics = new(
            new StubHealthService(SystemHealth.Available("api", now)),
            new StubLocalDiagnostics(Healthy()));
        AuditViewModel audit = new(diagnostics, null, new StubAuditRepository(shipments));

        await audit.InitializeAsync();

        Assert.AreEqual(2, audit.ShipmentLines.Count);
        Assert.IsFalse(audit.HasSelectedLine);
        Assert.IsFalse(audit.HasSelectedShipment);
        Assert.AreEqual(0, audit.VisibleCompletedShipments.Count);

        AuditLineFilterViewModel firstLine = audit.ShipmentLines.Single(line =>
            line.LineId == firstLineId);
        await audit.SelectLineCommand.ExecuteAsync(firstLine);

        Assert.IsTrue(audit.HasSelectedLine);
        Assert.AreEqual(2, audit.VisibleCompletedShipments.Count);
        Assert.IsFalse(audit.HasSelectedShipment);

        await audit.SelectShipmentCommand.ExecuteAsync(audit.VisibleCompletedShipments[0]);

        Assert.IsTrue(audit.HasSelectedShipment);
        Assert.AreEqual(firstLineId, audit.SelectedShipment!.Source.LineId);
    }

    [TestMethod]
    public async Task AuditFiltersCompletedShipmentsByWeekDayAndFullHistory()
    {
        DateTime today = DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(-6)).Date;
        int daysSinceMonday = ((int)today.DayOfWeek + 6) % 7;
        DateTime currentWeekStart = today.AddDays(-daysSinceMonday);
        DateTime previousWeekDay = currentWeekStart.AddDays(-5);
        DateTimeOffset currentCompletion = new(today.AddHours(12), TimeSpan.FromHours(-6));
        DateTimeOffset previousCompletion = new(previousWeekDay.AddHours(10), TimeSpan.FromHours(-6));
        DateTimeOffset olderCompletion = previousCompletion.AddDays(-14);
        Guid lineId = Guid.NewGuid();
        LocalCompletedShipmentAudit[] shipments =
        [
            Shipment(lineId, "Línea 1", "Actual", currentCompletion.AddHours(-1), currentCompletion),
            Shipment(lineId, "Línea 1", "Anterior", previousCompletion.AddHours(-1), previousCompletion),
            Shipment(lineId, "Línea 1", "Antiguo", olderCompletion.AddHours(-1), olderCompletion),
        ];
        DiagnosticsViewModel diagnostics = new(
            new StubHealthService(SystemHealth.Available("api", DateTimeOffset.UtcNow)),
            new StubLocalDiagnostics(Healthy()));
        AuditViewModel audit = new(diagnostics, null, new StubAuditRepository(shipments));

        await audit.InitializeAsync();

        Assert.AreEqual(1, audit.CompletedShipments.Count);
        Assert.AreEqual("Actual", audit.CompletedShipments[0].SupplierName);

        audit.SelectedPeriodOption = audit.PeriodOptions.Single(option =>
            option.Mode == AuditPeriodMode.PreviousWeek);
        Assert.AreEqual(1, audit.CompletedShipments.Count);
        Assert.AreEqual("Anterior", audit.CompletedShipments[0].SupplierName);

        audit.SelectedPeriodOption = audit.PeriodOptions.Single(option =>
            option.Mode == AuditPeriodMode.SpecificDay);
        audit.SelectedFilterDate = previousWeekDay;
        Assert.AreEqual(1, audit.CompletedShipments.Count);
        Assert.AreEqual("Anterior", audit.CompletedShipments[0].SupplierName);

        audit.SelectedPeriodOption = audit.PeriodOptions.Single(option =>
            option.Mode == AuditPeriodMode.AllHistory);
        Assert.AreEqual(3, audit.CompletedShipments.Count);
    }

    private static LocalCompletedShipmentAudit Shipment(
        Guid lineId,
        string lineName,
        string supplierName,
        DateTimeOffset startedAt,
        DateTimeOffset completedAt) =>
        new(
            Guid.NewGuid(),
            lineId,
            lineName,
            supplierName,
            startedAt,
            completedAt,
            100,
            1,
            100,
            0,
            0,
            []);

    private static LocalDatabaseHealth Healthy() => new(
        LocalDatabaseHealthState.Healthy,
        LocalDatabaseHealthIssue.None,
        0,
        1024L * 1024L * 1024L,
        null,
        new DateTimeOffset(2026, 8, 27, 12, 0, 0, TimeSpan.Zero),
        "Guardado local disponible e íntegro.",
        "No hay acciones pendientes.");

    private sealed class StubHealthService(SystemHealth result) : IHealthService
    {
        public Task<SystemHealth> CheckAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(result);
    }

    private sealed class StubLocalDiagnostics(LocalDatabaseHealth health) : ILocalDatabaseDiagnostics
    {
        public Task<LocalDatabaseHealth> InspectAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(health);

        public Task<string> CreateConsistentCopyAsync(
            string destinationDirectory,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(Path.Combine(destinationDirectory, "recovery.sqlite3"));
    }

    private sealed class StubAuditRepository(
        IReadOnlyList<LocalCompletedShipmentAudit> shipments) : ILocalAuditRepository
    {
        public Task<IReadOnlyList<LocalCompletedShipmentAudit>> ListCompletedShipmentsAsync(
            CancellationToken cancellationToken = default) => Task.FromResult(shipments);

        public Task<IReadOnlyList<LocalCajuelaCorrectionAudit>> ListCajuelaCorrectionsAsync(
            CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<LocalCajuelaCorrectionAudit>>([]);
    }
}
