using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Infrastructure.Sync;

public sealed class IncrementalPullWorker(
    IncrementalPullProcessor processor,
    TimeProvider timeProvider,
    IOptions<SyncOptions> syncOptions) : BackgroundService
{
    private readonly TimeSpan pollInterval = TimeSpan.FromSeconds(syncOptions.Value.PullPollIntervalSeconds);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            bool hasMore = false;
            try
            {
                hasMore = await processor.ProcessOnceAsync(stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception)
            {
                // El cursor no avanza si falla la red o la transacción local.
            }
            if (!hasMore)
                await Task.Delay(pollInterval, timeProvider, stoppingToken).ConfigureAwait(false);
        }
    }
}
