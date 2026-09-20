using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain;
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

        viewModel.ShowDiagnosticsCommand.Execute(null);
        Assert.AreSame(diagnostics, viewModel.CurrentPage);

        viewModel.ShowHomeCommand.Execute(null);
        Assert.AreSame(home, viewModel.CurrentPage);
    }

    [TestMethod]
    public async Task AdministrativeCorrectionNotificationOpensDiagnostics()
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
        MainWindowViewModel viewModel = new(home, diagnostics);

        await diagnostics.RefreshAsync();

        Assert.IsTrue(viewModel.HasCorrectionNotification);
        viewModel.ShowDiagnosticsCommand.Execute(null);
        Assert.AreSame(diagnostics, viewModel.CurrentPage);
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
