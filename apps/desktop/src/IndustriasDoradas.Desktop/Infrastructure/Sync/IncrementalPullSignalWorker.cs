using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain;
using Microsoft.Extensions.Hosting;

namespace IndustriasDoradas.Desktop.Infrastructure.Sync;

public sealed class IncrementalPullSignalWorker(
    IncrementalPullProcessor processor,
    ILocalSyncChangeRepository local,
    ISyncPullApi api,
    ISyncStationContext stationContext,
    TimeProvider timeProvider) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                ProtectedStationState? state = await stationContext.GetActiveAsync(stoppingToken)
                    .ConfigureAwait(false);
                if (state is null)
                {
                    await Task.Delay(TimeSpan.FromSeconds(5), timeProvider, stoppingToken).ConfigureAwait(false);
                    continue;
                }
                string? cursor = await local.GetCursorAsync(stoppingToken).ConfigureAwait(false);
                await api.WaitForSignalAsync(
                    state.Authorization.OrganizationId,
                    state.Authorization.StationId,
                    cursor,
                    state.Tokens.AccessToken,
                    stoppingToken).ConfigureAwait(false);
                await processor.ProcessOnceAsync(stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception)
            {
                await Task.Delay(TimeSpan.FromSeconds(5), timeProvider, stoppingToken).ConfigureAwait(false);
            }
        }
    }
}
