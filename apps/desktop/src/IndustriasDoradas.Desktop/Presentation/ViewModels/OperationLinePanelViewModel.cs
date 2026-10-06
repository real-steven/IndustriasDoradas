using CommunityToolkit.Mvvm.ComponentModel;
using IndustriasDoradas.Desktop.Domain.Production;

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
    private bool isReviewAlertActive;
    private string reviewAlertLabel = string.Empty;
    private bool isSweepPending;
    private long nextSweepReference = 250;
    private int lastSweepCumulativeTotal;
    private int cajuelasSinceLastSweep;
    private double progressValue;
    private double progressMaximum = 250;
    private string progressStartDescription = "0";
    private string progressEndDescription = "250 · BARRIDA";
    private string totalReferenceDescription = "/ 250";
    private string progressColor = "#1F9D55";
    private string nextAlertDescription = "Mercurio en 50";

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
        set => SetProperty(ref total, value);
    }

    public bool IsReviewAlertActive
    {
        get => isReviewAlertActive;
        private set => SetProperty(ref isReviewAlertActive, value);
    }

    public string ReviewAlertLabel
    {
        get => reviewAlertLabel;
        private set => SetProperty(ref reviewAlertLabel, value);
    }

    public bool IsSweepPending
    {
        get => isSweepPending;
        private set => SetProperty(ref isSweepPending, value);
    }

    public long NextSweepReference
    {
        get => nextSweepReference;
        private set => SetProperty(ref nextSweepReference, value);
    }

    public int LastSweepCumulativeTotal
    {
        get => lastSweepCumulativeTotal;
        private set => SetProperty(ref lastSweepCumulativeTotal, value);
    }

    public int CajuelasSinceLastSweep
    {
        get => cajuelasSinceLastSweep;
        private set => SetProperty(ref cajuelasSinceLastSweep, value);
    }

    public double ProgressValue
    {
        get => progressValue;
        private set => SetProperty(ref progressValue, value);
    }

    public double ProgressMaximum
    {
        get => progressMaximum;
        private set => SetProperty(ref progressMaximum, value);
    }

    public string ProgressStartDescription
    {
        get => progressStartDescription;
        private set => SetProperty(ref progressStartDescription, value);
    }

    public string ProgressEndDescription
    {
        get => progressEndDescription;
        private set => SetProperty(ref progressEndDescription, value);
    }

    public string TotalReferenceDescription
    {
        get => totalReferenceDescription;
        private set => SetProperty(ref totalReferenceDescription, value);
    }

    public string ProgressColor
    {
        get => progressColor;
        private set => SetProperty(ref progressColor, value);
    }

    public string NextAlertDescription
    {
        get => nextAlertDescription;
        private set => SetProperty(ref nextAlertDescription, value);
    }

    public void ApplyMilestones(
        ProductionReviewAlertState review,
        ProductionSweepProgressState sweep)
    {
        ArgumentNullException.ThrowIfNull(review);
        ArgumentNullException.ThrowIfNull(sweep);

        IsReviewAlertActive = review.IsActive;
        ReviewAlertLabel = review.ActiveReference is long reference
            ? $"REVISAR MERCURIO · {reference} CAJUELAS"
            : string.Empty;
        IsSweepPending = sweep.IsSweepPending;
        NextSweepReference = sweep.NextSweepReference;
        LastSweepCumulativeTotal = checked((int)(sweep.LastSweepCumulativeTotal ?? 0));
        CajuelasSinceLastSweep = Math.Max(0, total - LastSweepCumulativeTotal);
        ProgressValue = sweep.CajuelasInDisplaySegment;
        ProgressMaximum = sweep.DisplayReference - sweep.DisplaySegmentStart;
        ProgressStartDescription = "0";
        ProgressEndDescription = $"{ProgressMaximum:0} · BARRIDA";
        TotalReferenceDescription = $"/ {ProgressMaximum:0}";
        double ratio = ProgressMaximum <= 0 ? 0 : ProgressValue / ProgressMaximum;
        ProgressColor = ratio switch
        {
            >= 0.8 => "#CF3941",
            >= 0.5 => "#E9A713",
            _ => "#1F9D55",
        };

        long reviewDistance = review.NextReference - review.TotalCajuelas;
        long sweepDistance = sweep.NextSweepReference - sweep.TotalCajuelas;
        NextAlertDescription = sweep.IsSweepPending
            ? "Barrida pendiente"
            : sweepDistance <= reviewDistance
                ? $"Barrida en {sweepDistance}"
                : $"Mercurio en {reviewDistance}";
    }

    public bool IsReady { get => isReady; set => SetProperty(ref isReady, value); }
    public bool HasPreviousResponsible
    {
        get => hasPreviousResponsible;
        set => SetProperty(ref hasPreviousResponsible, value);
    }
}
