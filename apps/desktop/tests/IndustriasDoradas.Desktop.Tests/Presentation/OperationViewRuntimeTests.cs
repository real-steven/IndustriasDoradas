using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Presentation.ViewModels;
using IndustriasDoradas.Desktop.Presentation.Views;

namespace IndustriasDoradas.Desktop.Tests.Presentation;

[TestClass]
public sealed class OperationViewRuntimeTests
{
    [STATestMethod]
    public void RedesignedViewsCanCreateAndRenderBindings()
    {
        EnsureApplicationResources();
        var line = new OperationLinePanelViewModel
        {
            LineId = Guid.NewGuid(),
            LineName = "Línea 1",
            SupplierName = "Proveedor de prueba",
            ResponsibleName = "Responsable de prueba",
            StateLabel = "ACTIVA",
            IsReady = true,
            Total = 50,
        };
        var view = new OperationView
        {
            DataContext = new OperationViewSmokeContext([line]),
        };

        view.Measure(new Size(1280, 720));
        view.Arrange(new Rect(0, 0, 1280, 720));
        view.UpdateLayout();

        Assert.IsTrue(view.IsMeasureValid);

        AssertCanRender(new HomeView());
        AssertCanRender(new DiagnosticsView());
        AssertCanRender(new AuditView());
        AssertCanRender(new SettingsView());
        DateTimeOffset now = DateTimeOffset.UtcNow;
        Guid organizationId = Guid.NewGuid();
        var selectedLine = new CachedProductionLine(
            Guid.NewGuid(), organizationId, Guid.NewGuid(), "Línea visible", true, now);
        var selectedSupplier = new CachedSupplier(
            Guid.NewGuid(), organizationId, "Proveedor visible", true, now);
        var selectedWorker = new CachedWorker(
            Guid.NewGuid(), organizationId, "Responsable visible", true, now);
        var station = new StationView
        {
            DataContext = new StationViewSmokeContext
            {
                Draft = "",
                Lines = [selectedLine],
                SelectedLine = selectedLine,
                Suppliers = [selectedSupplier],
                SelectedSupplier = selectedSupplier,
                Workers = [selectedWorker],
                SelectedWorker = selectedWorker,
                LineStatuses =
                [
                    new StationLineStatus(
                        Guid.NewGuid(),
                        "Línea 1",
                        true,
                        true,
                        "#8959DD",
                        "Activa · cargamento en curso"),
                ],
            },
        };
        AssertCanRender(station);

        ComboBox[] selectors = FindVisualChildren<ComboBox>(station).ToArray();
        Assert.HasCount(3, selectors);
        Assert.AreEqual("Línea visible", SelectionText(selectors[0]));
        Assert.AreEqual("Proveedor visible", SelectionText(selectors[1]));
        Assert.AreEqual("Responsable visible", SelectionText(selectors[2]));
    }

    private static void EnsureApplicationResources()
    {
        if (System.Windows.Application.Current is not null) return;
        var application = new App();
        application.InitializeComponent();
    }

    private static void AssertCanRender(FrameworkElement view)
    {
        view.Measure(new Size(1280, 720));
        view.Arrange(new Rect(0, 0, 1280, 720));
        view.UpdateLayout();
        Assert.IsTrue(view.IsMeasureValid);
    }

    private static string? SelectionText(ComboBox comboBox)
    {
        comboBox.ApplyTemplate();
        return (comboBox.Template.FindName("SelectionText", comboBox) as TextBlock)?.Text;
    }

    private static IEnumerable<T> FindVisualChildren<T>(DependencyObject parent)
        where T : DependencyObject
    {
        for (int index = 0; index < VisualTreeHelper.GetChildrenCount(parent); index++)
        {
            DependencyObject child = VisualTreeHelper.GetChild(parent, index);
            if (child is T match) yield return match;
            foreach (T descendant in FindVisualChildren<T>(child)) yield return descendant;
        }
    }

    private sealed record OperationViewSmokeContext(IReadOnlyList<OperationLinePanelViewModel> Lines)
    {
        public bool HasActiveLines => Lines.Count > 0;
        public string LocalStorageStatus => $"Guardado local disponible · {Lines.Count}";
        public string PendingStatus => $"{Lines.Count - 1} pendientes";
        public string LastResult => $"{Lines.Count} línea lista para operar.";
    }

    private sealed class StationViewSmokeContext
    {
        public string Draft { get; set; } = string.Empty;
        public IReadOnlyList<CachedProductionLine> Lines { get; init; } = [];
        public CachedProductionLine? SelectedLine { get; set; }
        public IReadOnlyList<CachedSupplier> Suppliers { get; init; } = [];
        public CachedSupplier? SelectedSupplier { get; set; }
        public IReadOnlyList<CachedWorker> Workers { get; init; } = [];
        public CachedWorker? SelectedWorker { get; set; }
        public IReadOnlyList<StationLineStatus> LineStatuses { get; init; } = [];
    }
}
