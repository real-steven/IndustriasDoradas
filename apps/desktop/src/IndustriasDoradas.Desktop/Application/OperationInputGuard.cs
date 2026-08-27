using IndustriasDoradas.Desktop.Configuration;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Application;

public enum OperationInputSuppression
{
    None,
    AutoRepeat,
    Debounce,
}

public sealed record OperationInputGuardDecision(
    bool IsAccepted,
    OperationInputSuppression Suppression,
    double? IntervalMilliseconds);

public sealed class OperationInputGuard(
    IOptions<OperationSafetyOptions> options,
    TimeProvider timeProvider)
{
    private readonly object gate = new();
    private readonly Dictionary<InputGuardKey, long> lastAccepted = [];
    private readonly TimeSpan debounce = TimeSpan.FromMilliseconds(options.Value.DebounceMilliseconds);

    public OperationInputGuardDecision TryAcceptRegistration(OperationInputCommand command)
    {
        ArgumentNullException.ThrowIfNull(command);
        if (command.Action != OperationInputAction.RegisterCajuela)
        {
            throw new ArgumentException("La política de antirrebote solo acepta registros.", nameof(command));
        }

        if (command.Origin.IsRepeat)
        {
            return new OperationInputGuardDecision(false, OperationInputSuppression.AutoRepeat, null);
        }

        var key = new InputGuardKey(command.Origin.ControllerId, command.Origin.LineSlot);
        long now = timeProvider.GetTimestamp();
        double? acceptedInterval = null;
        lock (gate)
        {
            if (lastAccepted.TryGetValue(key, out long previous))
            {
                TimeSpan interval = timeProvider.GetElapsedTime(previous, now);
                if (interval < debounce)
                {
                    return new OperationInputGuardDecision(
                        false,
                        OperationInputSuppression.Debounce,
                        interval.TotalMilliseconds);
                }

                acceptedInterval = interval.TotalMilliseconds;
            }

            lastAccepted[key] = now;
        }

        return new OperationInputGuardDecision(true, OperationInputSuppression.None, acceptedInterval);
    }

    private sealed record InputGuardKey(string ControllerId, int LineSlot);
}
