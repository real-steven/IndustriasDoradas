using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain;

namespace IndustriasDoradas.Desktop.Application;

public sealed class SyncStationContext(
    IProtectedStationStore store,
    StationCoordinator coordinator) : ISyncStationContext
{
    public async Task<ProtectedStationState?> GetActiveAsync(CancellationToken cancellationToken = default)
    {
        ProtectedStationState? state = await store.LoadAsync(cancellationToken).ConfigureAwait(false);
        if (state is null || state.IsClosed || string.IsNullOrWhiteSpace(state.Tokens.AccessToken)) return null;
        return await coordinator.MaintainSessionAsync(state, true, cancellationToken).ConfigureAwait(false);
    }
}
