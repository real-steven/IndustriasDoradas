using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Configuration;
using IndustriasDoradas.Desktop.Domain;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Application;

public sealed class IncrementalPullProcessor(
    ILocalSyncChangeRepository local,
    ISyncPullApi api,
    ISyncStationContext stationContext,
    ISyncStatusNotifier statusNotifier,
    TimeProvider timeProvider,
    IOptions<SyncOptions> syncOptions) : IDisposable
{
    private readonly SyncOptions options = syncOptions.Value;
    private readonly SemaphoreSlim gate = new(1, 1);

    public async Task<bool> ProcessOnceAsync(CancellationToken cancellationToken = default)
    {
        await gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            ProtectedStationState? state = await stationContext.GetActiveAsync(cancellationToken).ConfigureAwait(false);
            if (state is null || string.IsNullOrWhiteSpace(state.Tokens.AccessToken)) return false;
            string? cursor = await local.GetCursorAsync(cancellationToken).ConfigureAwait(false);
            SyncPullPage page;
            try
            {
                page = await api.PullAsync(
                    state.Authorization.OrganizationId,
                    state.Authorization.StationId,
                    cursor,
                    options.PullPageSize,
                    state.Tokens.AccessToken,
                    cancellationToken).ConfigureAwait(false);
            }
            catch (SyncTransportException exception)
            {
                await local.RecordPullFailureAsync(
                    exception.Code, timeProvider.GetUtcNow(), cancellationToken).ConfigureAwait(false);
                statusNotifier.Notify(new SyncStatusNotification(false));
                throw;
            }
            await local.ApplyPageAsync(page, cancellationToken).ConfigureAwait(false);
            statusNotifier.Notify(new SyncStatusNotification(
                page.Changes.Any(change => change.Action == "CORRECTION_APPENDED")));
            return page.HasMore;
        }
        finally
        {
            gate.Release();
        }
    }

    public void Dispose() => gate.Dispose();
}
