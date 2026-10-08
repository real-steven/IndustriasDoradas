using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain.Production;
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
            SweepCount = 1,
        };
        var milestoneService = new ProductionMilestoneService();
        line.ApplyMilestones(
            milestoneService.CalculateReviewAlert(line.Total),
            milestoneService.CalculateSweepProgress(line.Total));
        var view = new OperationView
        {
            DataContext = new OperationViewSmokeContext(
                [line],
                [new OperationMilestoneAlertViewModel(
                    Guid.NewGuid(),
                    line.LineId,
                    line.AccentColor,
                    "🔎",
                    "Revisar mercurio",
                    "Línea 1 alcanzó 50 cajuelas. Revise el mercurio.")]),
        };

        view.Measure(new Size(1280, 720));
        view.Arrange(new Rect(0, 0, 1280, 720));
        view.UpdateLayout();

        Assert.IsTrue(view.IsMeasureValid);

        AssertCanRender(new HomeView());
        AssertCanRender(new DiagnosticsView());
        var login = new LoginView
        {
            DataContext = new
            {
                LoginSessionColor = "#62D78B",
                LoginSessionTitle = "Sesión abierta · lista para continuar",
                LoginSessionDescription = "Presione Abrir sesión para entrar al sistema.",
                LoginPrompt = "Encontramos una sesión protegida vigente.",
                LoginActionLabel = "ABRIR SESIÓN  →",
                NeedsCredentials = true,
                CanInteract = true,
                Status = "Sesión protegida restaurada.",
            },
        };
        AssertCanRender(login);
        TextBox loginEmail = FindVisualChildren<TextBox>(login).Single();
        PasswordBox loginPassword = FindVisualChildren<PasswordBox>(login).Single();
        loginEmail.Text = "jefe@planta.test";
        loginPassword.Password = "12345678";
        Assert.IsTrue(loginEmail.IsEnabled);
        Assert.IsTrue(loginPassword.IsEnabled);
        Assert.AreEqual("jefe@planta.test", loginEmail.Text);
        Assert.AreEqual("12345678", loginPassword.Password);
        AssertCanRender(new AuditView { DataContext = AuditViewSmokeContext.Operation() });
        AssertCanRender(new AuditView { DataContext = AuditViewSmokeContext.Corrections() });
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
        Assert.IsTrue(selectors.Length >= 4);
        Assert.AreEqual("Línea visible", SelectionText(selectors[0]));
        Assert.AreEqual("Proveedor visible", SelectionText(selectors[1]));
        Assert.AreEqual("Responsable visible", SelectionText(selectors[2]));
        Assert.AreEqual("Barrida 1 · 50 cajuelas", SelectionText(selectors[3]));
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
        ContentPresenter? presenter = comboBox.Template.FindName(
            "SelectionContent",
            comboBox) as ContentPresenter;
        presenter?.ApplyTemplate();
        string? rendered = presenter is null
            ? null
            : FindVisualChildren<TextBlock>(presenter).FirstOrDefault()?.Text;
        if (!string.IsNullOrWhiteSpace(rendered)) return rendered;
        object? selected = comboBox.SelectedItem;
        return selected?.GetType().GetProperty(comboBox.DisplayMemberPath)?.GetValue(selected)?.ToString();
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

    private sealed record OperationViewSmokeContext(
        IReadOnlyList<OperationLinePanelViewModel> Lines,
        IReadOnlyList<OperationMilestoneAlertViewModel> MilestoneAlerts)
    {
        public bool HasActiveLines => Lines.Count > 0;
        public string LocalStorageStatus => $"Guardado local disponible · {Lines.Count}";
        public string PendingStatus => $"{Lines.Count - 1} pendientes";
        public string LastResult => $"{Lines.Count} línea lista para operar.";
    }

    private sealed class AuditViewSmokeContext
    {
        private AuditViewSmokeContext(bool showCorrections)
        {
            DateTimeOffset now = DateTimeOffset.UtcNow;
            var source = new LocalCompletedShipmentAudit(
                Guid.NewGuid(),
                Guid.NewGuid(),
                "Línea cerrada",
                "Proveedor visible",
                now.AddHours(-2),
                now,
                260,
                1,
                260,
                1,
                0,
                [new LocalResponsibilityAudit(Guid.NewGuid(), "Responsable visible", now.AddHours(-2), now)]);
            SelectedShipment = new AuditShipmentItemViewModel(
                source,
                "#8959DD",
                "06/10/2026 02:00 → 06/10/2026 04:00",
                "260 cajuelas · 1 barrida · 1 corrección",
                [new AuditResponsibilityItemViewModel("Responsable visible", "02:00 → 04:00")]);
            CompletedShipments = [SelectedShipment];
            SelectedLine = new AuditLineFilterViewModel(
                source.LineId,
                source.LineName,
                "#8959DD",
                1)
            {
                IsSelected = true,
            };
            ShipmentLines = [SelectedLine];
            VisibleCompletedShipments = CompletedShipments;
            CajuelaCorrections =
            [
                new AuditCorrectionItemViewModel(
                    new LocalCajuelaCorrectionAudit(
                        Guid.NewGuid(),
                        source.ShipmentId,
                        source.LineName,
                        "Jefe de Planta 1",
                        "JEFE_PLANTA",
                        "Conteo físico confirmado",
                        261,
                        260,
                        now,
                        true),
                    "06/10/2026 04:00",
                    "Conteo: 261 → 260"),
            ];
            IsOperationCategory = !showCorrections;
            IsCorrectionsCategory = showCorrections;
            IsAccessCategory = false;
            IsAdministrationCategory = false;
            HasCompletedShipments = true;
            HasSelectedLine = true;
            HasSelectedShipment = true;
            CanViewSensitiveAudit = true;
            Status = "Registros cargados.";
        }

        public static AuditViewSmokeContext Operation() => new(false);
        public static AuditViewSmokeContext Corrections() => new(true);
        public bool IsOperationCategory { get; }
        public bool IsCorrectionsCategory { get; }
        public bool IsAccessCategory { get; }
        public bool IsAdministrationCategory { get; }
        public bool HasCompletedShipments { get; }
        public bool HasSelectedLine { get; }
        public bool HasSelectedShipment { get; }
        public bool CanViewSensitiveAudit { get; }
        public string Status { get; }
        public IReadOnlyList<AuditShipmentItemViewModel> CompletedShipments { get; }
        public IReadOnlyList<AuditLineFilterViewModel> ShipmentLines { get; }
        public IReadOnlyList<AuditShipmentItemViewModel> VisibleCompletedShipments { get; }
        public AuditLineFilterViewModel SelectedLine { get; }
        public AuditShipmentItemViewModel SelectedShipment { get; }
        public IReadOnlyList<AuditCorrectionItemViewModel> CajuelaCorrections { get; }
    }

    private sealed class StationViewSmokeContext
    {
        private readonly MercuryMovementOption initialLoad = new(
            MercuryMovementKind.InitialLoad,
            "Carga inicial",
            "Carga de prueba");
        private readonly MercurySweepOption sweep = new(
            new LocalMercurySweepTarget(
                Guid.NewGuid(), Guid.NewGuid(), 50, DateTimeOffset.UtcNow, false),
            "Barrida 1 · 50 cajuelas");

        public StationViewSmokeContext()
        {
            SelectedMercuryMovement = initialLoad;
            MercuryMovementOptions = [initialLoad];
            SelectedMercurySweep = sweep;
            MercurySweeps = [sweep];
            MercuryRastras =
            [
                new MercuryRastraEntryViewModel(new CachedLineComponent(
                    Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), "RASTRA_1", "Rastra 1",
                    1, true, DateTimeOffset.UtcNow)),
            ];
            IsSelectedLineActive = true;
            CanRecordMercury = true;
            MercuryStatus = "Mercurio disponible.";
        }

        public string Draft { get; set; } = string.Empty;
        public IReadOnlyList<CachedProductionLine> Lines { get; init; } = [];
        public CachedProductionLine? SelectedLine { get; set; }
        public IReadOnlyList<CachedSupplier> Suppliers { get; init; } = [];
        public CachedSupplier? SelectedSupplier { get; set; }
        public IReadOnlyList<CachedWorker> Workers { get; init; } = [];
        public CachedWorker? SelectedWorker { get; set; }
        public IReadOnlyList<StationLineStatus> LineStatuses { get; init; } = [];
        public bool IsSelectedLineActive { get; }
        public bool CanRecordMercury { get; }
        public MercuryMovementOption SelectedMercuryMovement { get; set; }
        public IReadOnlyList<MercuryMovementOption> MercuryMovementOptions { get; }
        public MercurySweepOption SelectedMercurySweep { get; set; }
        public IReadOnlyList<MercurySweepOption> MercurySweeps { get; }
        public IReadOnlyList<MercuryRastraEntryViewModel> MercuryRastras { get; }
        public string MercuryStatus { get; }
    }
}
