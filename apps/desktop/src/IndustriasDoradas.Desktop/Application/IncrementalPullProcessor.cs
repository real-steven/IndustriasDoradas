using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Configuration;
using IndustriasDoradas.Desktop.Domain;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Application;

public sealed class IncrementalPullProcessor(
    ILocalSyncChangeRepository local,
    ISyncPullApi api,
    ISyncStationContext stationContext,
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
            SyncPullPage page = await api.PullAsync(
                state.Authorization.OrganizationId,
                state.Authorization.StationId,
                cursor,
                options.PullPageSize,
                state.Tokens.AccessToken,
                cancellationToken).ConfigureAwait(false);
            await local.ApplyPageAsync(page, cancellationToken).ConfigureAwait(false);
            return page.HasMore;
        }
        finally
        {
            gate.Release();
        }
    }

    public void Dispose() => gate.Dispose();
}
