using System.IO;
using System.Windows;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Configuration;
using IndustriasDoradas.Desktop.Infrastructure.Health;
using IndustriasDoradas.Desktop.Infrastructure.Auth;
using IndustriasDoradas.Desktop.Infrastructure.LocalStorage;
using IndustriasDoradas.Desktop.Infrastructure.Security;
using IndustriasDoradas.Desktop.Infrastructure.Station;
using IndustriasDoradas.Desktop.Presentation;
using IndustriasDoradas.Desktop.Presentation.ViewModels;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
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
        builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: false);

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

        builder.Services.AddOptions<SupabaseOptions>()
            .Bind(builder.Configuration.GetSection(SupabaseOptions.SectionName))
            .Validate(options => Uri.TryCreate(options.Url, UriKind.Absolute, out _), "Supabase:Url debe ser absoluta.")
            .Validate(options => options.PublishableKey.StartsWith("sb_publishable_", StringComparison.Ordinal), "Supabase:PublishableKey debe ser publicable.")
            .ValidateOnStart();
        builder.Services.AddOptions<StationOptions>()
            .Bind(builder.Configuration.GetSection(StationOptions.SectionName))
            .Validate(options => options.Id != Guid.Empty, "Station:Id es obligatorio.")
            .Validate(options => options.PrivilegedIdleSeconds == 120, "La inactividad privilegiada aprobada es 120 segundos.")
            .Validate(options => options.OfflineHours == 24, "La contingencia offline aprobada es 24 horas.")
            .ValidateOnStart();
        builder.Services.AddOptions<LocalDatabaseOptions>()
            .Bind(builder.Configuration.GetSection(LocalDatabaseOptions.SectionName))
            .Validate(
                options => options.BusyTimeoutSeconds is >= 1 and <= 30,
                "LocalDatabase:BusyTimeoutSeconds debe estar entre 1 y 30.")
            .ValidateOnStart();

        builder.Services.AddHttpClient<IHealthService, ApiHealthService>(
            static (services, client) =>
            {
                ApiOptions options = services.GetRequiredService<IOptions<ApiOptions>>().Value;
                client.BaseAddress = new Uri(options.BaseUrl, UriKind.Absolute);
                client.Timeout = TimeSpan.FromSeconds(options.RequestTimeoutSeconds);
            });
        builder.Services.AddHttpClient<IStationApi, StationApi>(static (services, client) =>
        {
            ApiOptions options = services.GetRequiredService<IOptions<ApiOptions>>().Value;
            client.BaseAddress = new Uri(options.BaseUrl, UriKind.Absolute);
            client.Timeout = TimeSpan.FromSeconds(options.RequestTimeoutSeconds);
        });
        builder.Services.AddHttpClient<ISupabaseAuthService, SupabaseAuthService>(static (services, client) =>
        {
            SupabaseOptions options = services.GetRequiredService<IOptions<SupabaseOptions>>().Value;
            client.BaseAddress = new Uri(options.Url.TrimEnd('/') + '/', UriKind.Absolute);
            client.DefaultRequestHeaders.Add("apikey", options.PublishableKey);
        });

        builder.Services.AddSingleton(TimeProvider.System);
        builder.Services.AddSingleton<ILocalDatabasePathProvider, StationDatabasePathProvider>();
        builder.Services.AddSingleton<ILocalSqliteConnectionFactory, SqliteConnectionFactory>();
        builder.Services.AddSingleton<SqliteDatabaseMigrator>();
        builder.Services.AddHostedService<LocalDatabaseInitializationService>();
        builder.Services.AddSingleton<ILocalCatalogRepository, SqliteCatalogRepository>();
        builder.Services.AddSingleton<ILocalShipmentRepository, SqliteShipmentRepository>();
        builder.Services.AddSingleton<ILocalOperationalSessionRepository, SqliteOperationalSessionRepository>();
        builder.Services.AddSingleton<ILocalProductionEventRepository, SqliteProductionEventRepository>();
        builder.Services.AddSingleton<ILocalOutboxRepository, SqliteOutboxRepository>();
        builder.Services.AddSingleton<ILocalOperationRepository, SqliteLocalOperationRepository>();
        builder.Services.AddSingleton<ILocalCajuelaRepository, SqliteCajuelaRepository>();
        builder.Services.AddSingleton<ILocalDatabaseDiagnostics, SqliteDatabaseDiagnostics>();
        builder.Services.AddSingleton<LocalOperationService>();
        builder.Services.AddSingleton<RegisterCajuelaHandler>();
        builder.Services.AddSingleton<IProtectedStationStore, DpapiStationStore>();
        builder.Services.AddSingleton<IElevationEvidenceCapture, NoopEvidenceCapture>();
        builder.Services.AddSingleton<StationCoordinator>();

        builder.Services.AddSingleton<HomeViewModel>();
        builder.Services.AddSingleton<DiagnosticsViewModel>();
        builder.Services.AddSingleton<StationViewModel>();
        builder.Services.AddSingleton<MainWindowViewModel>();
        builder.Services.AddSingleton<MainWindow>();

        return builder.Build();
    }
}
