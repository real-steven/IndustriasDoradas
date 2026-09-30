using CommunityToolkit.Mvvm.ComponentModel;

namespace IndustriasDoradas.Desktop.Presentation.ViewModels;

public sealed class OperationLinePanelViewModel : ObservableObject
{
    private Guid lineId;
    private int lineSlot = 1;
    private string lineName = "Línea piloto";
    private string stateLabel = "SIN PREPARAR";
    private string feedDescription = "El jefe de planta debe preparar un cargamento.";
    private string responsibleDescription = "Sin responsable asignado";
    private string previousResponsibleDescription = string.Empty;
    private string workPeriodDescription = "Jornada calculada automáticamente";
    private string supplierName = "Sin proveedor";
    private string responsibleName = "Sin responsable";
    private string accentColor = "#8959DD";
    private int total;
    private bool isReady;
    private bool hasPreviousResponsible;

    public Guid LineId { get => lineId; set => SetProperty(ref lineId, value); }
    public int LineSlot { get => lineSlot; set => SetProperty(ref lineSlot, value); }
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

    public string SupplierName
    {
        get => supplierName;
        set => SetProperty(ref supplierName, value);
    }

    public string ResponsibleName
    {
        get => responsibleName;
        set => SetProperty(ref responsibleName, value);
    }

    public string AccentColor
    {
        get => accentColor;
        set => SetProperty(ref accentColor, value);
    }

    public int Total
    {
        get => total;
        set
        {
            if (!SetProperty(ref total, value)) return;
            OnPropertyChanged(nameof(ProgressValue));
            OnPropertyChanged(nameof(ProgressColor));
            OnPropertyChanged(nameof(NextAlertDescription));
        }
    }

    public double ProgressValue => CycleTotal;
    private int CycleTotal => Total == 0 ? 0 : ((Total - 1) % 250) + 1;
    public string ProgressColor => CycleTotal switch
    {
        >= 200 => "#CF3941",
        >= 125 => "#E9A713",
        _ => "#1F9D55",
    };
    public string NextAlertDescription
    {
        get
        {
            if (CycleTotal >= 250) return "Barrida pendiente";
            int milestone = Math.Min(250, ((CycleTotal / 50) + 1) * 50);
            string action = milestone == 250 ? "Barrida" : "Mercurio";
            return $"{action} en {milestone - CycleTotal}";
        }
    }
    public bool IsReady { get => isReady; set => SetProperty(ref isReady, value); }
    public bool HasPreviousResponsible
    {
        get => hasPreviousResponsible;
        set => SetProperty(ref hasPreviousResponsible, value);
    }
}
