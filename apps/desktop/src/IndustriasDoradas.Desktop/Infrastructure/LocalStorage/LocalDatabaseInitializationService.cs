using Microsoft.Extensions.Hosting;

namespace IndustriasDoradas.Desktop.Infrastructure.LocalStorage;

public sealed class LocalDatabaseInitializationService(SqliteDatabaseMigrator migrator) : IHostedService
{
    public Task StartAsync(CancellationToken cancellationToken) =>
        migrator.MigrateAsync(cancellationToken);

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
