using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain;
using IndustriasDoradas.Desktop.Presentation;
using IndustriasDoradas.Desktop.Presentation.ViewModels;

namespace IndustriasDoradas.Desktop.Tests.Presentation;

[TestClass]
public sealed class MainWindowViewModelTests
{
    [TestMethod]
    public void NavigationCommandsChangeTheCurrentPage()
    {
        HomeViewModel home = new();
        DiagnosticsViewModel diagnostics = new(new StubHealthService(), new StubLocalDiagnostics());
        MainWindowViewModel viewModel = new(home, diagnostics);

        Assert.AreSame(home, viewModel.CurrentPage);
        Assert.IsTrue(viewModel.IsHomePage);
        Assert.IsFalse(viewModel.IsDiagnosticsPage);

        viewModel.ShowDiagnosticsCommand.Execute(null);
        Assert.AreSame(diagnostics, viewModel.CurrentPage);
        Assert.IsFalse(viewModel.IsHomePage);
        Assert.IsTrue(viewModel.IsDiagnosticsPage);

        viewModel.ShowHomeCommand.Execute(null);
        Assert.AreSame(home, viewModel.CurrentPage);
        Assert.IsTrue(viewModel.IsHomePage);
    }

    [TestMethod]
    public void AttendancePreviewNavigationIsAvailableWithoutPersistingData()
    {
        HomeViewModel home = new();
        DiagnosticsViewModel diagnostics = new(new StubHealthService(), new StubLocalDiagnostics());
        var attendance = new AttendancePreviewViewModel();
        using MainWindowViewModel viewModel = new(
            home, diagnostics, null, null, null, null, null, new WpfUiDispatcher(), attendance);

        viewModel.ShowAttendanceCommand.Execute(null);
        attendance.ShowComingSoonCommand.Execute("registro de entrada");

        Assert.AreSame(attendance, viewModel.CurrentPage);
        Assert.IsTrue(viewModel.IsAttendancePage);
        Assert.AreEqual("Asistencia", viewModel.CurrentPageTitle);
        StringAssert.Contains(attendance.Status, "No se registró ninguna marca");
    }

    [TestMethod]
    public async Task AdministrativeCorrectionNotificationOpensAuditAndDismissesItself()
    {
        HomeViewModel home = new();
        var health = new LocalDatabaseHealth(
            LocalDatabaseHealthState.Healthy,
            LocalDatabaseHealthIssue.None,
            0,
            1024,
            null,
            DateTimeOffset.UtcNow,
            "Correcto.",
            "Sin acción.",
            Corrections:
            [
                new AdministrativeCorrectionDiagnostic(
                    "Administrador", "ADMINISTRADOR", "CAMBIO_AUTORIZADO", "business.mutation",
                    "supplier", DateTimeOffset.UtcNow, ["name: A → B"]),
            ]);
        DiagnosticsViewModel diagnostics = new(new StubHealthService(), new StubLocalDiagnostics(health));
        var audit = new AuditViewModel(diagnostics);
        MainWindowViewModel viewModel = new(home, diagnostics, null, null, audit);

        await diagnostics.RefreshAsync();

        Assert.IsTrue(viewModel.HasCorrectionNotification);
        await viewModel.ShowAuditCorrectionsCommand.ExecuteAsync(null);

        Assert.AreSame(audit, viewModel.CurrentPage);
        Assert.IsTrue(audit.IsCorrectionsCategory);
        Assert.IsFalse(viewModel.HasCorrectionNotification);
    }

    [TestMethod]
    public async Task AdministrativeCorrectionNotificationCanBeDismissedWithoutNavigation()
    {
        HomeViewModel home = new();
        var health = new LocalDatabaseHealth(
            LocalDatabaseHealthState.Healthy,
            LocalDatabaseHealthIssue.None,
            0,
            1024,
            null,
            DateTimeOffset.UtcNow,
            "Correcto.",
            "Sin acción.",
            Corrections:
            [
                new AdministrativeCorrectionDiagnostic(
                    "Jefe de planta", "JEFE_PLANTA", "CORRECCION_CAJUELA", "production.correction",
                    "production_event", DateTimeOffset.UtcNow, ["total: 1 → 0"]),
            ]);
        DiagnosticsViewModel diagnostics = new(new StubHealthService(), new StubLocalDiagnostics(health));
        MainWindowViewModel viewModel = new(home, diagnostics);
        await diagnostics.RefreshAsync();

        viewModel.DismissCorrectionNotificationCommand.Execute(null);

        Assert.IsFalse(viewModel.HasCorrectionNotification);
        Assert.AreSame(home, viewModel.CurrentPage);
    }

    private sealed class StubHealthService : IHealthService
    {
        public Task<SystemHealth> CheckAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(SystemHealth.Unavailable("Sin conexión."));
    }

    private sealed class StubLocalDiagnostics(LocalDatabaseHealth? result = null) : ILocalDatabaseDiagnostics
    {
        public Task<LocalDatabaseHealth> InspectAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(result ?? new LocalDatabaseHealth(
                LocalDatabaseHealthState.Healthy,
                LocalDatabaseHealthIssue.None,
                0,
                1024,
                null,
                DateTimeOffset.UtcNow,
                "Correcto.",
                "Sin acción."));

        public Task<string> CreateConsistentCopyAsync(
            string destinationDirectory,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(string.Empty);
    }
}
