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
        DiagnosticsViewModel diagnostics = new(new StubHealthService());
        MainWindowViewModel viewModel = new(home, diagnostics);

        Assert.AreSame(home, viewModel.CurrentPage);

        viewModel.ShowDiagnosticsCommand.Execute(null);
        Assert.AreSame(diagnostics, viewModel.CurrentPage);

        viewModel.ShowHomeCommand.Execute(null);
        Assert.AreSame(home, viewModel.CurrentPage);
    }

    private sealed class StubHealthService : IHealthService
    {
        public Task<SystemHealth> CheckAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(SystemHealth.Unavailable("Sin conexión."));
    }
}
