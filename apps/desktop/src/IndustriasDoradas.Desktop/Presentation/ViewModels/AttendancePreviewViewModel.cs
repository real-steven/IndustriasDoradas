using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

namespace IndustriasDoradas.Desktop.Presentation.ViewModels;

public sealed class AttendancePreviewViewModel : ObservableObject
{
    private string status =
        "Vista conceptual. Todavía no registra entradas, salidas, fotografías ni horas.";

    public AttendancePreviewViewModel()
    {
        ShowComingSoonCommand = new RelayCommand<string>(ShowComingSoon);
    }

    public string Status { get => status; private set => SetProperty(ref status, value); }
    public IRelayCommand<string> ShowComingSoonCommand { get; }

    private void ShowComingSoon(string? action)
    {
        string description = string.IsNullOrWhiteSpace(action) ? "Esta función" : action;
        Status = $"Próximamente: {description}. No se registró ninguna marca ni se modificaron datos.";
    }
}
