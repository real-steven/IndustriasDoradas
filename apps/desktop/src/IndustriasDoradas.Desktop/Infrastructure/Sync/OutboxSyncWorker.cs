using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Infrastructure.Sync;

public sealed class OutboxSyncWorker(
    OutboxSyncProcessor processor,
    TimeProvider timeProvider,
    IOptions<SyncOptions> syncOptions) : BackgroundService
{
    private readonly TimeSpan pollInterval = TimeSpan.FromSeconds(syncOptions.Value.PollIntervalSeconds);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            bool processed = false;
            try
            {
                processed = await processor.ProcessOnceAsync(stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception)
            {
                // El worker nunca derriba la UI. Un lease vencido libera cualquier lote abandonado.
            }
            if (!processed)
                await Task.Delay(pollInterval, timeProvider, stoppingToken).ConfigureAwait(false);
        }
    }
}
