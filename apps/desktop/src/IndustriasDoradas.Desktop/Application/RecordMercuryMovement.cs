using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain;

namespace IndustriasDoradas.Desktop.Application;

public sealed class RecordMercuryMovementHandler(
    ILocalMercuryRepository repository,
    IProtectedStationStore stationStore,
    IPlantManagerModeAccessor managerMode,
    TimeProvider timeProvider)
{
    public Task<IReadOnlyList<CachedLineComponent>> ListRastrasAsync(
        Guid organizationId,
        Guid lineId,
        CancellationToken cancellationToken = default) =>
        repository.ListRastrasAsync(organizationId, lineId, cancellationToken);

    public Task<IReadOnlyList<LocalMercurySweepTarget>> ListSweepsAsync(
        Guid shipmentId,
        CancellationToken cancellationToken = default) =>
        repository.ListSweepsAsync(shipmentId, cancellationToken);

    public Task<IReadOnlyList<CachedLineComponent>> ListRastrasForShipmentAsync(
        Guid shipmentId,
        CancellationToken cancellationToken = default) =>
        repository.ListRastrasForShipmentAsync(shipmentId, cancellationToken);

    public Task<IReadOnlyList<LocalMercuryMovement>> ListCurrentAsync(
        Guid shipmentId,
        CancellationToken cancellationToken = default) =>
        repository.ListCurrentAsync(shipmentId, cancellationToken);

    public async Task<LocalMercuryMovement> RecordAsync(
        Guid stationId,
        Guid shipmentId,
        Guid lineComponentId,
        MercuryMovementKind kind,
        decimal? amountGrams,
        Guid? sweepId = null,
        bool replaceCurrent = true,
        string? notes = null,
        CancellationToken cancellationToken = default)
    {
        EnsureRequired(stationId, nameof(stationId));
        EnsureRequired(shipmentId, nameof(shipmentId));
        EnsureRequired(lineComponentId, nameof(lineComponentId));
        if (!managerMode.IsActive)
        {
            throw new UnauthorizedAccessException(
                "Active Modo Jefe de Planta para registrar o corregir mercurio.");
        }

        ProtectedStationState? state = await stationStore.LoadAsync(cancellationToken)
            .ConfigureAwait(false);
        DateTimeOffset now = timeProvider.GetUtcNow();
        if (state is null || state.IsClosed || state.Authorization.StationId != stationId)
        {
            throw new UnauthorizedAccessException(
                "No existe una autorización de estación activa para registrar mercurio.");
        }
        if (state.Authorization.OfflineValidUntil <= now)
        {
            throw new UnauthorizedAccessException(
                "La autorización offline venció; conecte la estación antes de registrar mercurio.");
        }

        return await repository.RecordAsync(
            new RecordLocalMercuryMovement(
                Guid.NewGuid(),
                stationId,
                shipmentId,
                lineComponentId,
                sweepId,
                kind,
                amountGrams,
                state.Session.ProfileId,
                now,
                now,
                replaceCurrent,
                NormalizeNotes(notes)),
            cancellationToken).ConfigureAwait(false);
    }

    private static string? NormalizeNotes(string? notes)
    {
        string? result = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim();
        if (result?.Length > 500)
        {
            throw new ArgumentOutOfRangeException(nameof(notes), "La nota admite hasta 500 caracteres.");
        }
        return result;
    }

    private static void EnsureRequired(Guid value, string parameterName)
    {
        if (value == Guid.Empty) throw new ArgumentException("El UUID es obligatorio.", parameterName);
    }
}
