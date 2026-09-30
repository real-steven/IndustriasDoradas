using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

namespace IndustriasDoradas.Desktop.Presentation.ViewModels;

public sealed class SettingsViewModel : ObservableObject
{
    private string status =
        "Estas opciones presentan el alcance futuro. Ninguna configuración se modifica todavía.";

    public SettingsViewModel()
    {
        ShowComingSoonCommand = new RelayCommand<string>(ShowComingSoon);
    }

    public string Status { get => status; private set => SetProperty(ref status, value); }
    public IRelayCommand<string> ShowComingSoonCommand { get; }

    private void ShowComingSoon(string? feature)
    {
        string description = string.IsNullOrWhiteSpace(feature) ? "Esta configuración" : feature;
        Status = $"Próximamente: {description}. No se modificó la estación.";
    }
}
