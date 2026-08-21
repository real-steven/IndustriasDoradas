using IndustriasDoradas.Desktop.Domain;

namespace IndustriasDoradas.Desktop.Application;

public sealed class PrivilegeModeController(TimeProvider timeProvider, TimeSpan idleTimeout)
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
        if (Mode != StationMode.PlantManager || timeProvider.GetUtcNow() - lastActivity < idleTimeout)
            return false;
        Mode = StationMode.Operation;
        return true;
    }

    public void ExitPlantManagerMode() => Mode = StationMode.Operation;
}
