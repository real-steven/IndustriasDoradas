using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain;
using IndustriasDoradas.Desktop.Domain.Attendance;
using IndustriasDoradas.Desktop.Presentation;
using IndustriasDoradas.Desktop.Presentation.ViewModels;

namespace IndustriasDoradas.Desktop.Tests.Presentation;

[TestClass]
public sealed class AuditIncidentFilterTests
{
    private static readonly Guid OrganizationId = Guid.Parse("30000000-0000-4000-8000-000000000001");
    private static readonly Guid PlantId = Guid.Parse("31000000-0000-4000-8000-000000000001");
    private static readonly Guid StationId = Guid.Parse("34000000-0000-4000-8000-000000000001");
    private static readonly Guid ManagerProfileId = Guid.Parse("a1000000-0000-4000-8000-000000000009");
    private static readonly string[] ExpectedIncidentTypes =
        ["Salida sin entrada", "Entrada duplicada", "Jornada abierta más de ocho horas"];
    private static long sequence;

    [TestMethod]
    public async Task WithoutIncidentsTheFilterShowsAnEmptyListAndKeepsShifts()
    {
        Guid worker = Guid.NewGuid();
        DateTimeOffset now = DateTimeOffset.UtcNow;
        AuditViewModel audit = await OpenAttendanceAsync(
            Worker(worker, "Ana", CheckIn(worker, now.AddHours(-3)), CheckOut(worker, now.AddHours(-1))));

        Assert.AreEqual(0, audit.AttendanceIncidentCount);
        audit.ToggleIncidentFilterCommand.Execute(null);

        Assert.IsTrue(audit.IsIncidentFilterActive);
        Assert.AreEqual(0, audit.AttendanceIncidents.Count);
        Assert.IsFalse(audit.HasAttendanceIncidents);
        Assert.AreEqual("Mostrando 0 incidencias", audit.IncidentFilterDescription);
        Assert.AreEqual(1, audit.AttendanceItems.Count);
    }

    [TestMethod]
    public async Task OneDuplicateCheckInIsShownWithReadableDetails()
    {
        Guid worker = Guid.NewGuid();
        DateTimeOffset now = DateTimeOffset.UtcNow;
        AuditViewModel audit = await OpenAttendanceAsync(
            Worker(worker, "Ana", CheckIn(worker, now.AddHours(-3)), CheckIn(worker, now.AddHours(-2))));

        audit.ToggleIncidentFilterCommand.Execute(null);

        Assert.AreEqual(1, audit.AttendanceIncidentCount);
        AuditAttendanceIncidentViewModel incident = audit.AttendanceIncidents.Single();
        Assert.AreEqual("Ana", incident.WorkerName);
        Assert.AreEqual("Operario", incident.WorkerRole);
        Assert.AreEqual("Entrada duplicada", incident.TypeDescription);
        Assert.AreEqual("ABIERTA", incident.StatusDescription);
        StringAssert.StartsWith(incident.ShiftDescription, "Jornada desde");
        Assert.AreEqual("Sin corrección registrada", incident.CorrectionDescription);
        Assert.IsFalse(incident.Description.Contains("DuplicateCheckIn", StringComparison.Ordinal));
        StringAssert.Contains(incident.SupportDetail, "DuplicateCheckIn");
        Assert.AreEqual("Mostrando 1 incidencia", audit.IncidentFilterDescription);
        Assert.AreEqual("Mostrando 1 incidencia", audit.VisibleRecordCountDescription);
        StringAssert.Contains(audit.Status, "Filtro de incidencias activo");
    }

    [TestMethod]
    public async Task SeveralIncidentsAreCountedAndFilteredByWorker()
    {
        Guid ana = Guid.NewGuid();
        Guid beto = Guid.NewGuid();
        DateTimeOffset now = DateTimeOffset.UtcNow;
        AuditViewModel audit = await OpenAttendanceAsync(
            Worker(ana, "Ana",
                CheckOut(ana, now.AddHours(-6)),
                CheckIn(ana, now.AddHours(-5)),
                CheckIn(ana, now.AddHours(-4)),
                CheckOut(ana, now.AddHours(-1))),
            Worker(beto, "Beto", CheckIn(beto, now.AddHours(-10))));

        audit.ToggleIncidentFilterCommand.Execute(null);

        Assert.AreEqual(3, audit.AttendanceIncidentCount);
        Assert.AreEqual(audit.AttendanceIncidents.Count, audit.AttendanceIncidentCount);
        CollectionAssert.AreEquivalent(
            ExpectedIncidentTypes,
            audit.AttendanceIncidents.Select(item => item.TypeDescription).ToArray());

        audit.SelectedAttendanceWorker = audit.AttendanceWorkers.Single(item => item.WorkerId == beto);

        Assert.IsTrue(audit.IsIncidentFilterActive);
        Assert.AreEqual(1, audit.AttendanceIncidentCount);
        Assert.AreEqual("Beto", audit.AttendanceIncidents.Single().WorkerName);
        Assert.AreEqual("Mostrando 1 incidencia", audit.IncidentFilterDescription);
    }

    [TestMethod]
    public async Task CorrectedOpenShiftShowsActorAndReason()
    {
        Guid worker = Guid.NewGuid();
        DateTimeOffset now = DateTimeOffset.UtcNow;
        AttendanceEvent checkIn = CheckIn(worker, now.AddHours(-12));
        AttendanceEvent correction = AttendanceEvent.Adjustment(
            Guid.NewGuid(), OrganizationId, PlantId, StationId, worker,
            AttendanceEventType.AdjustedCheckOut, ++sequence,
            now.AddHours(-4), now.AddHours(-1), ManagerProfileId,
            "Olvidó marcar la salida", checkIn.ClientEventId);
        AuditViewModel audit = await OpenAttendanceAsync(
            new LocalAttendanceWorkerAudit(
                worker, "Ana", "OPERARIO", [checkIn, correction],
                new Dictionary<Guid, string> { [ManagerProfileId] = "Jefe Ficticio" }));

        audit.ToggleIncidentFilterCommand.Execute(null);

        AuditAttendanceIncidentViewModel incident = audit.AttendanceIncidents.Single();
        Assert.AreEqual(AuditIncidentState.Corrected, incident.State);
        Assert.AreEqual("CORREGIDA", incident.StatusDescription);
        Assert.AreEqual("Jornada abierta más de ocho horas", incident.TypeDescription);
        StringAssert.Contains(incident.CorrectionDescription, "Jefe Ficticio");
        StringAssert.Contains(incident.CorrectionDescription, "Olvidó marcar la salida");
        StringAssert.Contains(incident.ShiftDescription, "→");
        Assert.AreEqual("0 abiertas", audit.AttendanceIncidentSummary);
    }

    [TestMethod]
    public async Task TheCardCanBeTurnedOffAgainOrClearedWithShowAll()
    {
        Guid worker = Guid.NewGuid();
        DateTimeOffset now = DateTimeOffset.UtcNow;
        AuditViewModel audit = await OpenAttendanceAsync(
            Worker(worker, "Ana", CheckIn(worker, now.AddHours(-3)), CheckIn(worker, now.AddHours(-2))));

        Assert.IsFalse(audit.ClearIncidentFilterCommand.CanExecute(null));
        audit.ToggleIncidentFilterCommand.Execute(null);
        Assert.IsTrue(audit.ClearIncidentFilterCommand.CanExecute(null));
        audit.ToggleIncidentFilterCommand.Execute(null);
        Assert.IsFalse(audit.IsIncidentFilterActive);
        Assert.IsTrue(audit.IsShowingAllAttendance);
        StringAssert.Contains(audit.Status, "Filtro de incidencias quitado");

        audit.ToggleIncidentFilterCommand.Execute(null);
        audit.ClearIncidentFilterCommand.Execute(null);

        Assert.IsFalse(audit.IsIncidentFilterActive);
        StringAssert.EndsWith(audit.VisibleRecordCountDescription, "encontradas");
    }

    [TestMethod]
    public async Task TheFilterFollowsTheSelectedPeriod()
    {
        Guid worker = Guid.NewGuid();
        DateTimeOffset old = DateTimeOffset.UtcNow.AddDays(-30);
        var repository = new AttendanceAuditRepository(
            Worker(worker, "Ana", CheckIn(worker, old), CheckIn(worker, old.AddHours(1)), CheckOut(worker, old.AddHours(4))));
        AuditViewModel audit = await OpenAttendanceAsync(repository);
        audit.ToggleIncidentFilterCommand.Execute(null);

        Assert.AreEqual(0, audit.AttendanceIncidentCount);

        audit.SelectedPeriodOption = audit.PeriodOptions.Single(option =>
            option.Mode == AuditPeriodMode.AllHistory);
        await audit.RefreshAsync();

        Assert.IsTrue(audit.IsIncidentFilterActive);
        Assert.AreEqual(1, audit.AttendanceIncidentCount);
        Assert.IsNull(repository.LastQuery?.StartUtc);
    }

    [TestMethod]
    public void ShipmentCodeIsDerivedFromTheUuid()
    {
        Guid shipmentId = Guid.Parse("5510b16a-0000-4000-8000-00000000000a");

        Assert.AreEqual("5510B16A", ShipmentCode.From(shipmentId));
        AuditShipmentItemViewModel item = ShipmentItem(shipmentId);
        Assert.AreEqual("5510B16A", item.ShipmentCode);
        Assert.AreEqual("Material propio · Cargamento 5510B16A", item.Identifier);
    }

    [TestMethod]
    public async Task CopyingTheCodeWritesOnlyTheCodeAndConfirmsTemporarily()
    {
        var clipboard = new RecordingClipboard(succeeds: true);
        AuditViewModel audit = NewAudit(new AttendanceAuditRepository());
        audit.ClipboardWriter = clipboard;
        audit.CopyFeedbackDuration = TimeSpan.FromMilliseconds(50);

        Task copying = audit.CopyShipmentCodeCommand.ExecuteAsync(
            ShipmentItem(Guid.Parse("5510b16a-0000-4000-8000-00000000000a")));

        Assert.AreEqual("5510B16A", clipboard.Text);
        Assert.AreEqual("Código copiado", audit.ShipmentCodeCopyStatus);
        await copying;
        Assert.AreEqual(string.Empty, audit.ShipmentCodeCopyStatus);
    }

    [TestMethod]
    public async Task FailedCopyAsksToSelectTheCodeManually()
    {
        AuditViewModel audit = NewAudit(new AttendanceAuditRepository());
        audit.ClipboardWriter = new RecordingClipboard(succeeds: false);

        await audit.CopyShipmentCodeCommand.ExecuteAsync(
            ShipmentItem(Guid.Parse("5510b16a-0000-4000-8000-00000000000a")));

        StringAssert.Contains(audit.ShipmentCodeCopyStatus, "No se pudo copiar");
        StringAssert.Contains(audit.ShipmentCodeCopyStatus, "5510B16A");
    }

    [STATestMethod]
    public void AuditViewRendersTheIncidentToggleAndTheShipmentCopyButton()
    {
        if (System.Windows.Application.Current is null)
        {
            var application = new App();
            application.InitializeComponent();
        }
        LoginViewTestHost.KeepSharedApplicationAlive();
        Guid worker = Guid.NewGuid();
        Guid shipmentId = Guid.Parse("5510b16a-0000-4000-8000-00000000000a");
        DateTimeOffset now = DateTimeOffset.UtcNow;
        AuditShipmentItemViewModel shipment = ShipmentItem(shipmentId);
        var repository = new AttendanceAuditRepository(
            Worker(worker, "Ana", CheckIn(worker, now.AddHours(-3)), CheckIn(worker, now.AddHours(-2))))
        {
            Shipments = [shipment.Source],
        };
        AuditViewModel audit = NewAudit(repository);
        audit.SelectedPeriodOption = audit.PeriodOptions.Single(option =>
            option.Mode == AuditPeriodMode.AllHistory);
        audit.SelectCategoryCommand.ExecuteAsync(AuditCategory.Attendance).GetAwaiter().GetResult();
        audit.ToggleIncidentFilterCommand.Execute(null);
        var view = new Desktop.Presentation.Views.AuditView { DataContext = audit };

        Render(view);

        System.Windows.Controls.Primitives.ToggleButton toggle =
            FindVisualChildren<System.Windows.Controls.Primitives.ToggleButton>(view)
                .Single(item => item.Name == "IncidentFilterToggle");
        Assert.IsTrue(toggle.IsChecked);
        Assert.IsTrue(System.Windows.Input.KeyboardNavigation.GetAcceptsReturn(toggle));
        Assert.AreEqual(
            "Filtrar incidencias: 1",
            System.Windows.Automation.AutomationProperties.GetName(toggle));
        Assert.IsTrue(FindVisualChildren<System.Windows.Controls.TextBlock>(view)
            .Any(item => item.Text == "Mostrando 1 incidencia" && IsShown(item)));

        toggle.IsChecked = false;
        Assert.IsFalse(audit.IsIncidentFilterActive);

        audit.SelectCategoryCommand.ExecuteAsync(AuditCategory.Operation).GetAwaiter().GetResult();
        audit.SelectLineCommand.ExecuteAsync(audit.ShipmentLines.Single()).GetAwaiter().GetResult();
        audit.SelectShipmentCommand.ExecuteAsync(audit.VisibleCompletedShipments.Single())
            .GetAwaiter().GetResult();
        Render(view);

        System.Windows.Controls.Button[] copyButtons = FindVisualChildren<System.Windows.Controls.Button>(view)
            .Where(item => System.Windows.Automation.AutomationProperties.GetName(item) ==
                "Copiar identificador del cargamento 5510B16A")
            .ToArray();
        Assert.HasCount(2, copyButtons);
        Assert.IsTrue(copyButtons.All(item => (string)item.ToolTip == "Copiar identificador"));
        Assert.IsTrue(FindVisualChildren<System.Windows.Controls.TextBox>(view)
            .Any(item => item.Text == "5510B16A" && item.IsReadOnly));
    }

    // Sin ventana, IsVisible siempre es falso: se revisa la visibilidad de cada ancestro.
    private static bool IsShown(System.Windows.UIElement element)
    {
        for (System.Windows.DependencyObject? current = element;
             current is not null;
             current = System.Windows.Media.VisualTreeHelper.GetParent(current))
        {
            if (current is System.Windows.UIElement ui && ui.Visibility != System.Windows.Visibility.Visible)
                return false;
        }
        return true;
    }

    private static void Render(System.Windows.FrameworkElement view)
    {
        view.Measure(new System.Windows.Size(1280, 2400));
        view.Arrange(new System.Windows.Rect(0, 0, 1280, 2400));
        view.UpdateLayout();
    }

    private static IEnumerable<T> FindVisualChildren<T>(System.Windows.DependencyObject parent)
        where T : System.Windows.DependencyObject
    {
        for (int index = 0; index < System.Windows.Media.VisualTreeHelper.GetChildrenCount(parent); index++)
        {
            System.Windows.DependencyObject child = System.Windows.Media.VisualTreeHelper.GetChild(parent, index);
            if (child is T match) yield return match;
            foreach (T descendant in FindVisualChildren<T>(child)) yield return descendant;
        }
    }

    private static async Task<AuditViewModel> OpenAttendanceAsync(params LocalAttendanceWorkerAudit[] workers) =>
        await OpenAttendanceAsync(new AttendanceAuditRepository(workers), allHistory: true);

    private static async Task<AuditViewModel> OpenAttendanceAsync(
        AttendanceAuditRepository repository,
        bool allHistory = false)
    {
        AuditViewModel audit = NewAudit(repository);
        // Todo el historial evita depender del día de la semana en que corre la prueba.
        if (allHistory)
        {
            audit.SelectedPeriodOption = audit.PeriodOptions.Single(option =>
                option.Mode == AuditPeriodMode.AllHistory);
        }
        await audit.SelectCategoryCommand.ExecuteAsync(AuditCategory.Attendance);
        return audit;
    }

    private static AuditViewModel NewAudit(ILocalAuditRepository repository)
    {
        DiagnosticsViewModel diagnostics = new(
            new StubHealthService(),
            new StubLocalDiagnostics());
        return new AuditViewModel(diagnostics, null, repository);
    }

    private static AuditShipmentItemViewModel ShipmentItem(Guid shipmentId)
    {
        DateTimeOffset now = DateTimeOffset.UtcNow;
        return new AuditShipmentItemViewModel(
            new LocalCompletedShipmentAudit(
                shipmentId, Guid.NewGuid(), "Línea 1", "Material propio",
                now.AddHours(-2), now, 100, 1, 100, 0, 0, []),
            "#8959DD", "periodo", "resumen", []);
    }

    private static LocalAttendanceWorkerAudit Worker(Guid id, string name, params AttendanceEvent[] events) =>
        new(id, name, "OPERARIO", events);

    private static AttendanceEvent CheckIn(Guid worker, DateTimeOffset at) =>
        AttendanceEvent.CheckIn(Guid.NewGuid(), OrganizationId, PlantId, StationId, worker, ++sequence, at, at);

    private static AttendanceEvent CheckOut(Guid worker, DateTimeOffset at) =>
        AttendanceEvent.CheckOut(Guid.NewGuid(), OrganizationId, PlantId, StationId, worker, ++sequence, at, at);

    private sealed class AttendanceAuditRepository(params LocalAttendanceWorkerAudit[] workers)
        : ILocalAuditRepository
    {
        public LocalAuditQuery? LastQuery { get; private set; }

        public IReadOnlyList<LocalCompletedShipmentAudit> Shipments { get; init; } = [];

        public Task<IReadOnlyList<LocalCompletedShipmentAudit>> ListCompletedShipmentsAsync(
            CancellationToken cancellationToken = default) =>
            Task.FromResult(Shipments);

        public Task<IReadOnlyList<LocalCajuelaCorrectionAudit>> ListCajuelaCorrectionsAsync(
            CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<LocalCajuelaCorrectionAudit>>([]);

        public Task<IReadOnlyList<LocalAttendanceWorkerAudit>> ListAttendanceAsync(
            LocalAuditQuery query,
            CancellationToken cancellationToken = default)
        {
            LastQuery = query;
            IReadOnlyList<LocalAttendanceWorkerAudit> result = workers
                .Select(worker => worker with
                {
                    Events = worker.Events
                        .Where(item =>
                            (query.StartUtc is null || item.OccurredAt >= query.StartUtc) &&
                            (query.EndExclusiveUtc is null || item.OccurredAt < query.EndExclusiveUtc))
                        .ToArray(),
                })
                .ToArray();
            return Task.FromResult(result);
        }
    }

    private sealed class RecordingClipboard(bool succeeds) : IClipboardWriter
    {
        public string? Text { get; private set; }

        public bool TrySetText(string text)
        {
            if (succeeds) Text = text;
            return succeeds;
        }
    }

    private sealed class StubHealthService : IHealthService
    {
        public Task<SystemHealth> CheckAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(SystemHealth.Available("api", DateTimeOffset.UtcNow));
    }

    private sealed class StubLocalDiagnostics : ILocalDatabaseDiagnostics
    {
        public Task<LocalDatabaseHealth> InspectAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(new LocalDatabaseHealth(
                LocalDatabaseHealthState.Healthy,
                LocalDatabaseHealthIssue.None,
                0,
                1024L * 1024L * 1024L,
                null,
                DateTimeOffset.UtcNow,
                "Guardado local disponible e íntegro.",
                "No hay acciones pendientes."));

        public Task<string> CreateConsistentCopyAsync(
            string destinationDirectory,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(Path.Combine(destinationDirectory, "recovery.sqlite3"));
    }
}
