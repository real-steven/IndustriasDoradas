using System.Diagnostics;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain.Production;

namespace IndustriasDoradas.Desktop.Application;

public sealed record PreparedCajuelaReversal(
    Guid ReversalEventId,
    Guid ConfirmationId,
    LocalOperationalSession ExpectedSession,
    ProductionEvent TargetEvent,
    string ReasonCode,
    DateTimeOffset PreparedAt,
    int TotalBeforeCorrection);

public sealed record RevertLastCajuelaResult(
    ProductionEvent Event,
    Guid TargetClientEventId,
    string ReasonCode,
    int Total,
    bool WasDuplicate,
    TimeSpan Elapsed);

public sealed class RevertLastCajuelaHandler(
    ILocalCajuelaRepository repository,
    TimeProvider timeProvider)
{
    public const string ImmediateInputErrorReason = "IMMEDIATE_INPUT_ERROR";

    public async Task<PreparedCajuelaReversal> PrepareAsync(
        Guid stationId,
        CancellationToken cancellationToken = default)
    {
        EnsureRequired(stationId, nameof(stationId));
        LocalCajuelaCorrectionTarget target = await repository.FindCorrectionTargetAsync(
                stationId,
                cancellationToken)
            .ConfigureAwait(false);
        return new PreparedCajuelaReversal(
            Guid.NewGuid(),
            Guid.NewGuid(),
            target.Session,
            target.TargetEvent,
            ImmediateInputErrorReason,
            timeProvider.GetUtcNow(),
            target.Total);
    }

    public async Task<RevertLastCajuelaResult> ConfirmAsync(
        PreparedCajuelaReversal prepared,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(prepared);
        EnsureRequired(prepared.ReversalEventId, nameof(prepared));
        EnsureRequired(prepared.ConfirmationId, nameof(prepared));
        if (!string.Equals(
                prepared.ReasonCode,
                ImmediateInputErrorReason,
                StringComparison.Ordinal))
        {
            throw new InvalidOperationException("La corrección inmediata usa un motivo automático fijo.");
        }

        long startedAt = Stopwatch.GetTimestamp();
        LocalCajuelaReversal reversal = await repository.ReverseAsync(
                new ReverseCajuelaMutation(
                    prepared.ReversalEventId,
                    prepared.ConfirmationId,
                    prepared.ExpectedSession,
                    prepared.TargetEvent.ClientEventId,
                    prepared.ReasonCode,
                    prepared.PreparedAt,
                    timeProvider.GetUtcNow()),
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

    private static void EnsureRequired(Guid value, string parameterName)
    {
        if (value == Guid.Empty)
        {
            throw new ArgumentException("El UUID es obligatorio.", parameterName);
        }
    }
}
