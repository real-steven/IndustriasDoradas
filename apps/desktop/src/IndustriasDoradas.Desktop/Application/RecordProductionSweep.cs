using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain;
using IndustriasDoradas.Desktop.Domain.Production;

namespace IndustriasDoradas.Desktop.Application;

public sealed record PreparedProductionSweep(
    Guid SweepId,
    LocalOperationalSession ExpectedSession,
    IReadOnlyList<ProductionEvent> IncludedEvents,
    int TotalCajuelas,
    int LastSweepCumulativeTotal,
    int CajuelaQuantity,
    DateTimeOffset PerformedAt);

public sealed class RecordProductionSweepHandler(
    ILocalProductionSweepRepository repository,
    IProtectedStationStore stationStore,
    TimeProvider timeProvider)
{
    public async Task<PreparedProductionSweep> PrepareAsync(
        Guid stationId,
        Guid lineId,
        CancellationToken cancellationToken = default) =>
        await PrepareCoreAsync(stationId, lineId, allowEmpty: false, cancellationToken)
            .ConfigureAwait(false)
        ?? throw new InvalidOperationException("No hay cajuelas nuevas pendientes de barrida.");

    public Task<PreparedProductionSweep?> PrepareFinalIfNeededAsync(
        Guid stationId,
        Guid lineId,
        CancellationToken cancellationToken = default) =>
        PrepareCoreAsync(stationId, lineId, allowEmpty: true, cancellationToken);

    public async Task<LocalSweepRegistration> ConfirmAsync(
        PreparedProductionSweep prepared,
        bool isFinal,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(prepared);
        ProtectedStationState state = await RequireStationAsync(
                prepared.ExpectedSession.StationId, cancellationToken)
            .ConfigureAwait(false);
        DateTimeOffset recordedAt = timeProvider.GetUtcNow();
        ProductionSweep sweep = ProductionSweep.Record(
            prepared.SweepId,
            prepared.IncludedEvents,
            state.Session.ProfileId,
            prepared.PerformedAt,
            recordedAt,
            isFinal);
        OutboxAuthorizationEvidence authorization = OutboxAuthorizationCapture.From(state, recordedAt);
        return await repository.RecordAsync(sweep, authorization, cancellationToken).ConfigureAwait(false);
    }

    private async Task<PreparedProductionSweep?> PrepareCoreAsync(
        Guid stationId,
        Guid lineId,
        bool allowEmpty,
        CancellationToken cancellationToken)
    {
        EnsureRequired(stationId, nameof(stationId));
        EnsureRequired(lineId, nameof(lineId));
        await RequireStationAsync(stationId, cancellationToken).ConfigureAwait(false);
        LocalSweepPreparation preparation = await repository
            .PrepareAsync(stationId, lineId, cancellationToken)
            .ConfigureAwait(false);
        if (preparation.UnsweptEvents.Count == 0)
        {
            if (allowEmpty) return null;
            throw new InvalidOperationException("No hay cajuelas nuevas pendientes de barrida.");
        }

        int quantity = ProductionEventCounter.ForLineAndShipment(
            preparation.UnsweptEvents,
            preparation.Session.LineId,
            preparation.Session.ShipmentId);
        if (quantity <= 0)
        {
            throw new InvalidOperationException(
                "Las correcciones pendientes no forman una cantidad positiva para barrer.");
        }

        return new PreparedProductionSweep(
            Guid.NewGuid(),
            preparation.Session,
            preparation.UnsweptEvents,
            preparation.TotalCajuelas,
            preparation.LastSweepCumulativeTotal,
            quantity,
            timeProvider.GetUtcNow());
    }

    private async Task<ProtectedStationState> RequireStationAsync(
        Guid stationId,
        CancellationToken cancellationToken)
    {
        ProtectedStationState? state = await stationStore.LoadAsync(cancellationToken)
            .ConfigureAwait(false);
        if (state is null || state.IsClosed || state.Authorization.StationId != stationId)
        {
            throw new UnauthorizedAccessException(
                "No existe una autorización de estación activa para registrar la barrida.");
        }

        if (state.Authorization.OfflineValidUntil <= timeProvider.GetUtcNow())
        {
            throw new UnauthorizedAccessException(
                "La autorización offline venció; conecte la estación antes de registrar la barrida.");
        }

        return state;
    }

    private static void EnsureRequired(Guid value, string parameterName)
    {
        if (value == Guid.Empty)
        {
            throw new ArgumentException("El UUID es obligatorio.", parameterName);
        }
    }
}
