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
            new StubHealthService(SystemHealth.Available("industrias-doradas-api", checkedAt)));

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
                SystemHealth.Unavailable("No fue posible establecer conexión con la API.")));

        await viewModel.RefreshAsync();

        Assert.AreEqual(HealthState.Unavailable, viewModel.State);
        Assert.AreEqual("API no disponible", viewModel.StatusTitle);
        StringAssert.Contains(viewModel.StatusMessage, "conexión");
        Assert.AreEqual("No disponible", viewModel.Service);
    }

    private sealed class StubHealthService(SystemHealth result) : IHealthService
    {
        public Task<SystemHealth> CheckAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(result);
    }
}
