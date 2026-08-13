using System.IO;
using System.Windows;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Configuration;
using IndustriasDoradas.Desktop.Infrastructure.Health;
using IndustriasDoradas.Desktop.Presentation;
using IndustriasDoradas.Desktop.Presentation.ViewModels;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop;

public partial class App : System.Windows.Application
{
    private IHost? host;

    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        try
        {
            host = CreateHost(e.Args);
            await host.StartAsync();

            MainWindow = host.Services.GetRequiredService<MainWindow>();
            MainWindow.Show();
        }
        catch (Exception exception) when (
            exception is OptionsValidationException or InvalidOperationException or IOException)
        {
            MessageBox.Show(
                $"No se pudo iniciar Industrias Doradas. {exception.Message}",
                "Configuración inválida",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
            Shutdown(-1);
        }
    }

    protected override void OnExit(ExitEventArgs e)
    {
        if (host is not null)
        {
            host.StopAsync().GetAwaiter().GetResult();
            host.Dispose();
        }

        base.OnExit(e);
    }

    private static IHost CreateHost(string[] args)
    {
        string environmentName =
            Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT")
            ?? Environments.Production;
        HostApplicationBuilder builder = Host.CreateApplicationBuilder(
            new HostApplicationBuilderSettings
            {
                Args = args,
                ContentRootPath = AppContext.BaseDirectory,
                EnvironmentName = environmentName,
            });

        builder.Services
            .AddOptions<ApiOptions>()
            .Bind(builder.Configuration.GetSection(ApiOptions.SectionName))
            .Validate(
                options => Uri.TryCreate(options.BaseUrl, UriKind.Absolute, out Uri? uri)
                    && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps),
                "Api:BaseUrl debe ser una URL HTTP o HTTPS absoluta.")
            .Validate(
                options => options.RequestTimeoutSeconds is >= 1 and <= 30,
                "Api:RequestTimeoutSeconds debe estar entre 1 y 30.")
            .ValidateOnStart();

        builder.Services.AddHttpClient<IHealthService, ApiHealthService>(
            static (services, client) =>
            {
                ApiOptions options = services.GetRequiredService<IOptions<ApiOptions>>().Value;
                client.BaseAddress = new Uri(options.BaseUrl, UriKind.Absolute);
                client.Timeout = TimeSpan.FromSeconds(options.RequestTimeoutSeconds);
            });

        builder.Services.AddSingleton<HomeViewModel>();
        builder.Services.AddSingleton<DiagnosticsViewModel>();
        builder.Services.AddSingleton<MainWindowViewModel>();
        builder.Services.AddSingleton<MainWindow>();

        return builder.Build();
    }
}
