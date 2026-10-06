namespace IndustriasDoradas.Desktop.Application;

public interface IPlantManagerModeAccessor
{
    bool IsActive { get; }
}

public sealed class PlantManagerModeState : IPlantManagerModeAccessor
{
    public bool IsActive { get; private set; }

    public void SetActive(bool isActive) => IsActive = isActive;
}
