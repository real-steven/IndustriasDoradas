using System.Diagnostics;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain;
using IndustriasDoradas.Desktop.Domain.Production;

namespace IndustriasDoradas.Desktop.Application;

public sealed record PreparedCajuelaReversal(
    Guid ReversalEventId,
    Guid ConfirmationId,
    LocalOperationalSession ExpectedSession,
    ProductionEvent TargetEvent,
    string ReasonCode,
    DateTimeOffset PreparedAt,
    int TotalBeforeCorrection,
    TimeSpan TargetAge,
    bool RequiresPlantManager);

public sealed record RevertLastCajuelaResult(
    ProductionEvent Event,
    Guid TargetClientEventId,
    string ReasonCode,
    int Total,
    bool WasDuplicate,
    TimeSpan Elapsed);

public sealed class RevertLastCajuelaHandler(
    ILocalCajuelaRepository repository,
    TimeProvider timeProvider,
    IProtectedStationStore? stationStore = null,
    IPlantManagerModeAccessor? managerMode = null)
{
    public const string ImmediateInputErrorReason = "IMMEDIATE_INPUT_ERROR";
    public static readonly TimeSpan OperatorCorrectionWindow = TimeSpan.FromMinutes(5);

    public async Task<PreparedCajuelaReversal> PrepareAsync(
        Guid stationId,
        CancellationToken cancellationToken = default)
    {
        EnsureRequired(stationId, nameof(stationId));
        LocalCajuelaCorrectionTarget target = await repository.FindCorrectionTargetAsync(
                stationId,
                cancellationToken)
            .ConfigureAwait(false);
        return Prepare(target);
    }

    public async Task<PreparedCajuelaReversal> PrepareAsync(
        Guid stationId,
        Guid lineId,
        CancellationToken cancellationToken = default)
    {
        EnsureRequired(stationId, nameof(stationId));
        EnsureRequired(lineId, nameof(lineId));
        LocalCajuelaCorrectionTarget target = await repository.FindCorrectionTargetAsync(
                stationId,
                lineId,
                cancellationToken)
            .ConfigureAwait(false);
        return Prepare(target);
    }

    private PreparedCajuelaReversal Prepare(LocalCajuelaCorrectionTarget target)
    {
        DateTimeOffset preparedAt = timeProvider.GetUtcNow();
        TimeSpan age = preparedAt - target.TargetEvent.RecordedAt;
        if (age < TimeSpan.Zero)
        {
            throw new InvalidOperationException(
                "El reloj local antecede al registro que se intenta corregir.");
        }

        return new PreparedCajuelaReversal(
            Guid.NewGuid(),
            Guid.NewGuid(),
            target.Session,
            target.TargetEvent,
            ImmediateInputErrorReason,
            preparedAt,
            target.Total,
            age,
            age > OperatorCorrectionWindow);
    }

    public async Task<RevertLastCajuelaResult> ConfirmAsync(
        PreparedCajuelaReversal prepared,
        CancellationToken cancellationToken = default)
    {
        return await ConfirmAsync(
                prepared,
                OperationInputOrigin.Application(),
                cancellationToken)
            .ConfigureAwait(false);
    }

    public async Task<RevertLastCajuelaResult> ConfirmAsync(
        PreparedCajuelaReversal prepared,
        OperationInputOrigin inputOrigin,
        CancellationToken cancellationToken = default)
    {
        return await ConfirmAsync(prepared, inputOrigin, null, cancellationToken)
            .ConfigureAwait(false);
    }

    public async Task<RevertLastCajuelaResult> ConfirmAsync(
        PreparedCajuelaReversal prepared,
        OperationInputOrigin inputOrigin,
        string? reasonDetail,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(prepared);
        ArgumentNullException.ThrowIfNull(inputOrigin);
        inputOrigin.Validate();
        EnsureRequired(prepared.ReversalEventId, nameof(prepared));
        EnsureRequired(prepared.ConfirmationId, nameof(prepared));
        if (!string.Equals(
                prepared.ReasonCode,
                ImmediateInputErrorReason,
                StringComparison.Ordinal))
        {
            throw new InvalidOperationException("La corrección inmediata usa un motivo automático fijo.");
        }

        bool hasManagerAccess = managerMode?.IsActive == true;
        if (prepared.RequiresPlantManager && !hasManagerAccess)
        {
            throw new UnauthorizedAccessException(
                "La cajuela supera cinco minutos y requiere Modo Jefe de Planta.");
        }

        reasonDetail = string.IsNullOrWhiteSpace(reasonDetail) ? null : reasonDetail.Trim();
        if (prepared.RequiresPlantManager && reasonDetail is null)
        {
            throw new InvalidOperationException(
                "Indique el motivo de la corrección realizada en Modo Jefe de Planta.");
        }
        if (reasonDetail?.Length > 240)
        {
            throw new ArgumentOutOfRangeException(
                nameof(reasonDetail),
                "El motivo admite como máximo 240 caracteres.");
        }

        long startedAt = Stopwatch.GetTimestamp();
        (OutboxAuthorizationEvidence? authorization, ProtectedStationState? station) =
            await CaptureAuthorizationAsync(prepared.ExpectedSession.StationId, cancellationToken)
                .ConfigureAwait(false);
        string actorKind = prepared.RequiresPlantManager ? "JEFE_PLANTA" : "OPERARIO";
        Guid actorId = prepared.RequiresPlantManager
            ? station?.Session.ProfileId ?? Guid.Empty
            : prepared.ExpectedSession.ResponsibleWorkerId;
        LocalCajuelaReversal reversal = await repository.ReverseAsync(
                new ReverseCajuelaMutation(
                    prepared.ReversalEventId,
                    prepared.ConfirmationId,
                    prepared.ExpectedSession,
                    prepared.TargetEvent.ClientEventId,
                    prepared.ReasonCode,
                    prepared.PreparedAt,
                    timeProvider.GetUtcNow(),
                    inputOrigin,
                    authorization,
                    actorKind,
                    actorId == Guid.Empty ? null : actorId,
                    prepared.RequiresPlantManager ? station?.Session.DisplayName : null,
                    prepared.RequiresPlantManager ? station?.Session.Role : "OPERARIO_RESPONSABLE",
                    reasonDetail,
                    prepared.TotalBeforeCorrection,
                    prepared.TotalBeforeCorrection - 1,
                    prepared.RequiresPlantManager),
                cancellationToken)
            .ConfigureAwait(false);
        TimeSpan elapsed = Stopwatch.GetElapsedTime(startedAt);
        return new RevertLastCajuelaResult(
            reversal.Event,
            reversal.TargetClientEventId,
            reversal.ReasonCode,
            reversal.Total,
            reversal.WasDuplicate,
            elapsed);
    }

    private async Task<(OutboxAuthorizationEvidence? Authorization, ProtectedStationState? State)>
        CaptureAuthorizationAsync(
        Guid stationId,
        CancellationToken cancellationToken)
    {
        if (stationStore is null) return (null, null);
        ProtectedStationState? state = await stationStore.LoadAsync(cancellationToken).ConfigureAwait(false);
        if (state is null || state.IsClosed || state.Authorization.StationId != stationId)
            throw new UnauthorizedAccessException("No existe una autorización activa para corregir producción.");
        return (OutboxAuthorizationCapture.From(state, timeProvider.GetUtcNow()), state);
    }

    private static void EnsureRequired(Guid value, string parameterName)
    {
        if (value == Guid.Empty)
        {
            throw new ArgumentException("El UUID es obligatorio.", parameterName);
        }
    }
}
