using IndustriasDoradas.Desktop.Configuration;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Application;

public enum OperationInputSuppression
{
    None,
    AutoRepeat,
    Debounce,
    Cooldown,
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
    private readonly Dictionary<InputGuardKey, long> lastAcceptedByController = [];
    private readonly Dictionary<int, long> lastAcceptedByLine = [];
    private readonly TimeSpan debounce = TimeSpan.FromMilliseconds(options.Value.DebounceMilliseconds);
    private readonly TimeSpan registrationCooldown =
        TimeSpan.FromMilliseconds(options.Value.RegistrationCooldownMilliseconds);

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
            if (lastAcceptedByController.TryGetValue(key, out long previousController))
            {
                TimeSpan controllerInterval = timeProvider.GetElapsedTime(previousController, now);
                if (controllerInterval < debounce)
                {
                    return new OperationInputGuardDecision(
                        false,
                        OperationInputSuppression.Debounce,
                        controllerInterval.TotalMilliseconds);
                }
            }

            if (lastAcceptedByLine.TryGetValue(command.Origin.LineSlot, out long previousLine))
            {
                TimeSpan lineInterval = timeProvider.GetElapsedTime(previousLine, now);
                if (lineInterval < registrationCooldown)
                {
                    return new OperationInputGuardDecision(
                        false,
                        OperationInputSuppression.Cooldown,
                        lineInterval.TotalMilliseconds);
                }

                acceptedInterval = lineInterval.TotalMilliseconds;
            }

            lastAcceptedByController[key] = now;
            lastAcceptedByLine[command.Origin.LineSlot] = now;
        }

        return new OperationInputGuardDecision(true, OperationInputSuppression.None, acceptedInterval);
    }

    private sealed record InputGuardKey(string ControllerId, int LineSlot);
}
