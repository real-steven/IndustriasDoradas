using IndustriasDoradas.Desktop.Domain;

namespace IndustriasDoradas.Desktop.Application;

public sealed class PrivilegeModeController(
    TimeProvider timeProvider,
    TimeSpan privilegedIdleTimeout,
    TimeSpan sessionIdleTimeout)
{
    private DateTimeOffset lastActivity = timeProvider.GetUtcNow();

    public StationMode Mode { get; private set; } = StationMode.SignedOut;
    public string Draft { get; set; } = string.Empty;

    public void OpenOperationMode()
    {
        Mode = StationMode.Operation;
        lastActivity = timeProvider.GetUtcNow();
    }

    public void EnterPlantManagerMode()
    {
        Mode = StationMode.PlantManager;
        lastActivity = timeProvider.GetUtcNow();
    }

    public void RecordActivity() => lastActivity = timeProvider.GetUtcNow();

    public bool EvaluateIdleTimeout()
    {
        if (Mode != StationMode.PlantManager || timeProvider.GetUtcNow() - lastActivity < privilegedIdleTimeout)
            return false;
        Mode = StationMode.Operation;
        return true;
    }

    public bool EvaluateSessionIdleTimeout()
    {
        if (Mode == StationMode.SignedOut || timeProvider.GetUtcNow() - lastActivity < sessionIdleTimeout)
            return false;
        Mode = StationMode.SignedOut;
        return true;
    }

    public void ExitPlantManagerMode()
    {
        Mode = StationMode.Operation;
        lastActivity = timeProvider.GetUtcNow();
    }

    public void CloseStation() => Mode = StationMode.SignedOut;
}
