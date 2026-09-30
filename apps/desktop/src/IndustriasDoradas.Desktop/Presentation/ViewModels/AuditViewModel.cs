using System.ComponentModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using IndustriasDoradas.Desktop.Application.Abstractions;

namespace IndustriasDoradas.Desktop.Presentation.ViewModels;

public enum AuditCategory
{
    Operation,
    Corrections,
    Access,
    Administration,
}

public sealed class AuditViewModel : ObservableObject
{
    private readonly DiagnosticsViewModel diagnostics;
    private readonly StationViewModel? station;
    private AuditCategory selectedCategory = AuditCategory.Operation;
    private string status =
        "Actividad de operación visible. Eleve el acceso para consultar categorías protegidas.";

    public AuditViewModel(DiagnosticsViewModel diagnostics)
        : this(diagnostics, null)
    {
    }

    public AuditViewModel(DiagnosticsViewModel diagnostics, StationViewModel? station)
    {
        this.diagnostics = diagnostics;
        this.station = station;
        RefreshCommand = new AsyncRelayCommand(RefreshAsync);
        SelectCategoryCommand = new RelayCommand<AuditCategory>(SelectCategory);
        ShowComingSoonCommand = new RelayCommand<string>(ShowComingSoon);
        diagnostics.PropertyChanged += OnDiagnosticsPropertyChanged;
        if (station is not null)
        {
            station.PropertyChanged += OnStationPropertyChanged;
        }
    }

    public IReadOnlyList<AdministrativeCorrectionDiagnostic> Corrections => diagnostics.Corrections;
    public IReadOnlyList<SyncFailureDiagnostic> ReviewEvents => diagnostics.Failures;
    public int FailedReviewCount => diagnostics.FailedReviewCount;
    public int PullReviewCount => diagnostics.PullReviewCount;
    public string LocalReviewCountDescription => FailedReviewCount == 0
        ? "No hay eventos locales rechazados pendientes de revisión."
        : $"{FailedReviewCount} evento(s) local(es) requieren revisión. " +
          $"Se muestran los {ReviewEvents.Count} más recientes.";
    public bool CanViewSensitiveAudit => station?.IsPlantManager ?? true;
    public AuditCategory SelectedCategory
    {
        get => selectedCategory;
        private set
        {
            if (!SetProperty(ref selectedCategory, value)) return;
            OnPropertyChanged(nameof(IsOperationCategory));
            OnPropertyChanged(nameof(IsCorrectionsCategory));
            OnPropertyChanged(nameof(IsAccessCategory));
            OnPropertyChanged(nameof(IsAdministrationCategory));
        }
    }
    public bool IsOperationCategory => SelectedCategory == AuditCategory.Operation;
    public bool IsCorrectionsCategory => SelectedCategory == AuditCategory.Corrections;
    public bool IsAccessCategory => SelectedCategory == AuditCategory.Access;
    public bool IsAdministrationCategory => SelectedCategory == AuditCategory.Administration;
    public string CorrectionCountDescription => Corrections.Count > 0
        ? $"{Corrections.Count} corrección(es) disponible(s) para revisión."
        : "No hay correcciones administrativas registradas para revisar.";
    public string Status { get => status; private set => SetProperty(ref status, value); }
    public IAsyncRelayCommand RefreshCommand { get; }
    public IRelayCommand<AuditCategory> SelectCategoryCommand { get; }
    public IRelayCommand<string> ShowComingSoonCommand { get; }

    private async Task RefreshAsync()
    {
        Status = "Actualizando los registros disponibles…";
        await diagnostics.RefreshAsync().ConfigureAwait(true);
        Status = SelectedCategory == AuditCategory.Corrections
            ? CorrectionCountDescription
            : "Registros actualizados.";
    }

    private void SelectCategory(AuditCategory category)
    {
        if (category != AuditCategory.Operation && !CanViewSensitiveAudit)
        {
            Status = "Esta categoría contiene información protegida. Eleve el acceso para consultarla.";
            return;
        }

        SelectedCategory = category;
        Status = category switch
        {
            AuditCategory.Operation =>
                "Actividad de la operación actual. El historial detallado se incorporará próximamente.",
            AuditCategory.Corrections => CorrectionCountDescription,
            AuditCategory.Access =>
                "Accesos y validaciones de seguridad estarán disponibles próximamente.",
            _ => "Cambios administrativos estarán disponibles próximamente.",
        };
    }

    private void ShowComingSoon(string? action)
    {
        string description = string.IsNullOrWhiteSpace(action) ? "Esta acción" : action;
        Status = $"Próximamente: {description}. No se realizó ningún cambio.";
    }

    private void OnDiagnosticsPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName is nameof(DiagnosticsViewModel.Corrections) or
            nameof(DiagnosticsViewModel.Failures) or
            nameof(DiagnosticsViewModel.FailedReviewCount) or
            nameof(DiagnosticsViewModel.PullReviewCount))
        {
            OnPropertyChanged(nameof(Corrections));
            OnPropertyChanged(nameof(ReviewEvents));
            OnPropertyChanged(nameof(FailedReviewCount));
            OnPropertyChanged(nameof(PullReviewCount));
            OnPropertyChanged(nameof(LocalReviewCountDescription));
            OnPropertyChanged(nameof(CorrectionCountDescription));
        }
    }

    private void OnStationPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName != nameof(StationViewModel.Mode)) return;
        OnPropertyChanged(nameof(CanViewSensitiveAudit));
        if (!CanViewSensitiveAudit && SelectedCategory != AuditCategory.Operation)
        {
            SelectedCategory = AuditCategory.Operation;
            Status = "El acceso elevado finalizó. Se muestra únicamente la actividad de operación.";
        }
    }
}
