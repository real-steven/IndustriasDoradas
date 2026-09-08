using CommunityToolkit.Mvvm.ComponentModel;

namespace IndustriasDoradas.Desktop.Presentation.ViewModels;

public sealed class OperationLinePanelViewModel : ObservableObject
{
    private string lineName = "Línea piloto";
    private string stateLabel = "SIN PREPARAR";
    private string feedDescription = "El jefe de planta debe preparar un cargamento.";
    private string responsibleDescription = "Sin responsable asignado";
    private string previousResponsibleDescription = string.Empty;
    private string workPeriodDescription = "Jornada calculada automáticamente";
    private int total;
    private bool isReady;
    private bool hasPreviousResponsible;

    public string LineName { get => lineName; set => SetProperty(ref lineName, value); }
    public string StateLabel { get => stateLabel; set => SetProperty(ref stateLabel, value); }
    public string FeedDescription { get => feedDescription; set => SetProperty(ref feedDescription, value); }
    public string ResponsibleDescription
    {
        get => responsibleDescription;
        set => SetProperty(ref responsibleDescription, value);
    }

    public string PreviousResponsibleDescription
    {
        get => previousResponsibleDescription;
        set => SetProperty(ref previousResponsibleDescription, value);
    }

    public string WorkPeriodDescription
    {
        get => workPeriodDescription;
        set => SetProperty(ref workPeriodDescription, value);
    }

    public int Total { get => total; set => SetProperty(ref total, value); }
    public bool IsReady { get => isReady; set => SetProperty(ref isReady, value); }
    public bool HasPreviousResponsible
    {
        get => hasPreviousResponsible;
        set => SetProperty(ref hasPreviousResponsible, value);
    }
}
