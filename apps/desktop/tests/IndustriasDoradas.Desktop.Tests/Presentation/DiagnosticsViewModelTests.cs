using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain;
using IndustriasDoradas.Desktop.Presentation.ViewModels;

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
            "Libere espacio antes de continuar.");
        DiagnosticsViewModel viewModel = new(
            new StubHealthService(SystemHealth.Unavailable("Sin red.")),
            new StubLocalDiagnostics(local));

        await viewModel.RefreshAsync();

        Assert.AreEqual(LocalDatabaseHealthState.Attention, viewModel.LocalState);
        Assert.AreEqual("7 pendientes conservados", viewModel.PendingOperations);
        Assert.AreEqual("90 MB libres", viewModel.AvailableSpace);
        StringAssert.Contains(viewModel.LocalRecoveryInstruction, "Libere espacio");
        Assert.AreEqual("API no disponible", viewModel.StatusTitle);
    }

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
}
