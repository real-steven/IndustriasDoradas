using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Configuration;
using IndustriasDoradas.Desktop.Domain.Production;
using IndustriasDoradas.Desktop.Presentation.ViewModels;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Tests.Presentation;

[TestClass]
public sealed class OperationViewModelTests
{
    private static readonly Guid OrganizationId = Guid.Parse("30000000-0000-4000-8000-000000000001");
    private static readonly Guid PlantId = Guid.Parse("31000000-0000-4000-8000-000000000001");
    private static readonly Guid StationId = Guid.Parse("34000000-0000-4000-8000-000000000001");
    private static readonly Guid LineId = Guid.Parse("43000000-0000-4000-8000-000000000001");
    private static readonly Guid ShipmentId = Guid.Parse("41000000-0000-4000-8000-000000000001");
    private static readonly Guid CycleId = Guid.Parse("44000000-0000-4000-8000-000000000001");
    private static readonly Guid WorkerId = Guid.Parse("45000000-0000-4000-8000-000000000001");
    private static readonly DateTimeOffset Now = new(2026, 8, 26, 18, 30, 0, TimeSpan.Zero);

    [TestMethod]
    public async Task InitializationDisplaysActiveLineContextAndEnablesMainAction()
    {
        var dashboard = new QueueDashboardRepository(ReadySnapshot(total: 7));
        var cajuelas = new StubCajuelaRepository(total: 7);
        OperationViewModel viewModel = Create(dashboard, cajuelas);

        await viewModel.InitializeAsync();

        Assert.IsTrue(viewModel.Line.IsReady);
        Assert.AreEqual("LÍNEA LISTA", viewModel.Line.StateLabel);
        Assert.AreEqual("Línea 1", viewModel.Line.LineName);
        StringAssert.Contains(viewModel.Line.FeedDescription, "La Esperanza");
        StringAssert.Contains(viewModel.Line.ResponsibleDescription, "Marta");
        Assert.AreEqual(7, viewModel.Line.Total);
        Assert.IsTrue(viewModel.RegisterCajuelaCommand.CanExecute(null));
    }

    [TestMethod]
    public async Task MainActionRegistersOnceAndRefreshesVisibleTotal()
    {
        var dashboard = new QueueDashboardRepository(
            ReadySnapshot(total: 7),
            ReadySnapshot(total: 8, pending: 2));
        var cajuelas = new StubCajuelaRepository(total: 7);
        OperationViewModel viewModel = Create(dashboard, cajuelas);
        await viewModel.InitializeAsync();

        await viewModel.RegisterCajuelaCommand.ExecuteAsync(null);

        Assert.AreEqual(1, cajuelas.RegisterCalls);
        Assert.AreEqual(8, viewModel.Line.Total);
        StringAssert.Contains(viewModel.LastResult, "guardada localmente");
        Assert.AreEqual("2 pendientes por enviar", viewModel.PendingStatus);
    }

    [TestMethod]
    public async Task CorrectionRequiresExplicitSecondStepBeforeWriting()
    {
        var dashboard = new QueueDashboardRepository(
            ReadySnapshot(total: 2),
            ReadySnapshot(total: 1, pending: 2));
        var cajuelas = new StubCajuelaRepository(total: 2);
        OperationViewModel viewModel = Create(dashboard, cajuelas);
        await viewModel.InitializeAsync();

        await viewModel.PrepareCorrectionCommand.ExecuteAsync(null);

        Assert.IsTrue(viewModel.IsCorrectionPending);
        Assert.AreEqual(0, cajuelas.ReverseCalls);
        StringAssert.Contains(viewModel.CorrectionSummary, "2 a 1");

        await viewModel.ConfirmCorrectionCommand.ExecuteAsync(null);

        Assert.IsFalse(viewModel.IsCorrectionPending);
        Assert.AreEqual(1, cajuelas.ReverseCalls);
        Assert.AreEqual(1, viewModel.Line.Total);
        StringAssert.Contains(viewModel.LastResult, "trazabilidad");
    }

    [TestMethod]
    public async Task LineWithoutActiveContextKeepsRegistrationDisabled()
    {
        var dashboard = new QueueDashboardRepository(new LocalOperationDashboardSnapshot(
            null,
            "Línea 1",
            null,
            null,
            null,
            null,
            null,
            null,
            0,
            0));
        OperationViewModel viewModel = Create(dashboard, new StubCajuelaRepository(0));

        await viewModel.InitializeAsync();

        Assert.IsFalse(viewModel.Line.IsReady);
        Assert.AreEqual("LÍNEA SIN PREPARAR", viewModel.Line.StateLabel);
        Assert.IsFalse(viewModel.RegisterCajuelaCommand.CanExecute(null));
        Assert.IsFalse(viewModel.PrepareCorrectionCommand.CanExecute(null));
        Assert.IsFalse(viewModel.DispatchInputCommand.CanExecute(OperationInputAction.RegisterCajuela));
        Assert.IsFalse(viewModel.DispatchInputCommand.CanExecute(OperationInputAction.RevertLastCajuela));
    }

    [TestMethod]
    public async Task LocalStorageFailureIsVisibleAndKeepsMainActionBlocked()
    {
        OperationViewModel viewModel = Create(
            new ThrowingDashboardRepository(),
            new StubCajuelaRepository(0));

        await viewModel.InitializeAsync();

        Assert.AreEqual("Guardado local no disponible", viewModel.LocalStorageStatus);
        StringAssert.Contains(viewModel.LastResult, "almacenamiento local");
        Assert.IsFalse(viewModel.RegisterCajuelaCommand.CanExecute(null));
    }

    [TestMethod]
    public async Task StaleCorrectionClosesConfirmationAndRequestsNewPreparation()
    {
        var dashboard = new QueueDashboardRepository(ReadySnapshot(total: 2));
        var cajuelas = new StubCajuelaRepository(total: 2, rejectReversal: true);
        OperationViewModel viewModel = Create(dashboard, cajuelas);
        await viewModel.InitializeAsync();
        await viewModel.PrepareCorrectionCommand.ExecuteAsync(null);

        await viewModel.ConfirmCorrectionCommand.ExecuteAsync(null);

        Assert.IsFalse(viewModel.IsCorrectionPending);
        StringAssert.Contains(viewModel.LastResult, "Prepárela nuevamente");
    }

    [TestMethod]
    public async Task KeyboardRegisterPreservesOriginAndCommandIdentity()
    {
        var dashboard = new QueueDashboardRepository(
            ReadySnapshot(total: 4),
            ReadySnapshot(total: 5, pending: 2));
        var cajuelas = new StubCajuelaRepository(total: 4);
        OperationViewModel viewModel = Create(dashboard, cajuelas);
        await viewModel.InitializeAsync();
        OperationInputCommand input = Input(
            OperationInputAction.RegisterCajuela,
            "Add",
            Guid.Parse("61000000-0000-4000-8000-000000000001"));

        await viewModel.HandleInputCommandAsync(input);

        Assert.AreEqual(1, cajuelas.RegisterCalls);
        Assert.AreEqual(input.CommandId, cajuelas.LastRegisterMutation!.ClientEventId);
        Assert.AreEqual("KEYBOARD", cajuelas.LastRegisterMutation.InputOrigin.SourceKind);
        Assert.AreEqual("Add", cajuelas.LastRegisterMutation.InputOrigin.SignalCode);
        Assert.AreEqual(5, viewModel.Line.Total);
    }

    [TestMethod]
    public async Task ArrowsAndOkNavigateCorrectionWithoutMouse()
    {
        var dashboard = new QueueDashboardRepository(
            ReadySnapshot(total: 2),
            ReadySnapshot(total: 1, pending: 2));
        var cajuelas = new StubCajuelaRepository(total: 2);
        OperationViewModel viewModel = Create(dashboard, cajuelas);
        await viewModel.InitializeAsync();

        await viewModel.HandleInputCommandAsync(Input(OperationInputAction.MoveDown, "Down"));
        Assert.AreEqual(OperationFocusTarget.RevertLastCajuela, viewModel.FocusedTarget);
        await viewModel.HandleInputCommandAsync(Input(OperationInputAction.Confirm, "Enter"));
        Assert.IsTrue(viewModel.IsCorrectionPending);
        Assert.AreEqual(OperationFocusTarget.Confirm, viewModel.FocusedTarget);

        await viewModel.HandleInputCommandAsync(Input(OperationInputAction.MoveRight, "Right"));
        Assert.AreEqual(OperationFocusTarget.Cancel, viewModel.FocusedTarget);
        await viewModel.HandleInputCommandAsync(Input(OperationInputAction.Confirm, "Enter"));
        Assert.IsFalse(viewModel.IsCorrectionPending);
        Assert.AreEqual(0, cajuelas.ReverseCalls);

        await viewModel.HandleInputCommandAsync(Input(OperationInputAction.RevertLastCajuela, "R"));
        await viewModel.HandleInputCommandAsync(Input(OperationInputAction.Confirm, "Enter"));
        Assert.AreEqual(1, cajuelas.ReverseCalls);
        Assert.AreEqual("Enter", cajuelas.LastReverseMutation!.InputOrigin.SignalCode);
    }

    [TestMethod]
    public async Task ClickUsesTheSameInputRouterWithTraceableOrigin()
    {
        var dashboard = new QueueDashboardRepository(
            ReadySnapshot(total: 0),
            ReadySnapshot(total: 1, pending: 2));
        var cajuelas = new StubCajuelaRepository(total: 0);
        OperationViewModel viewModel = Create(dashboard, cajuelas);
        await viewModel.InitializeAsync();

        await viewModel.DispatchInputCommand.ExecuteAsync(OperationInputAction.RegisterCajuela);

        Assert.AreEqual(1, cajuelas.RegisterCalls);
        Assert.AreEqual("CLICK", cajuelas.LastRegisterMutation!.InputOrigin.SourceKind);
        Assert.AreEqual("shared-pointer", cajuelas.LastRegisterMutation.InputOrigin.ControllerId);
    }

    [TestMethod]
    public async Task FutureLineCommandIsRejectedWithoutChangingPilotState()
    {
        var dashboard = new QueueDashboardRepository(ReadySnapshot(total: 3));
        var cajuelas = new StubCajuelaRepository(total: 3);
        OperationViewModel viewModel = Create(dashboard, cajuelas);
        await viewModel.InitializeAsync();
        OperationInputCommand command = Input(OperationInputAction.RegisterCajuela, "BUTTON_1") with
        {
            Origin = new OperationInputOrigin("HID", "future-controller-2", "BUTTON_1", 2, false),
        };

        await viewModel.HandleInputCommandAsync(command);

        Assert.AreEqual(0, cajuelas.RegisterCalls);
        StringAssert.Contains(viewModel.LastResult, "Línea 2");
        Assert.AreEqual(3, viewModel.Line.Total);
    }

    [TestMethod]
    public async Task HeldRegisterIsSuppressedWithoutWriting()
    {
        var dashboard = new QueueDashboardRepository(ReadySnapshot(total: 3));
        var cajuelas = new StubCajuelaRepository(total: 3);
        var metrics = new RecordingMetrics();
        var feedback = new RecordingFeedback();
        OperationViewModel viewModel = Create(dashboard, cajuelas, metrics: metrics, feedback: feedback);
        await viewModel.InitializeAsync();
        OperationInputCommand held = Input(OperationInputAction.RegisterCajuela, "Add") with
        {
            Origin = new OperationInputOrigin("KEYBOARD", "shared-keyboard", "Add", 1, true),
        };

        await viewModel.HandleInputCommandAsync(held);

        Assert.AreEqual(0, cajuelas.RegisterCalls);
        Assert.AreEqual(OperationFeedbackKind.Warning, viewModel.FeedbackKind);
        Assert.AreEqual(OperationFeedbackKind.Warning, feedback.LastKind);
        Assert.AreEqual(OperationInputMetricOutcome.Suppressed, metrics.Items.Single().Outcome);
        Assert.AreEqual("AUTO_REPEAT", metrics.Items.Single().ErrorCode);
    }

    [TestMethod]
    public async Task RapidSecondPressIsSuppressedAndPressAtThresholdIsAccepted()
    {
        var time = new ManualTimeProvider(Now);
        var dashboard = new QueueDashboardRepository(
            ReadySnapshot(total: 0),
            ReadySnapshot(total: 1),
            ReadySnapshot(total: 2));
        var cajuelas = new StubCajuelaRepository(total: 0);
        var metrics = new RecordingMetrics();
        OperationViewModel viewModel = Create(dashboard, cajuelas, time, metrics);
        await viewModel.InitializeAsync();

        await viewModel.HandleInputCommandAsync(Input(OperationInputAction.RegisterCajuela, "Add"));
        time.Advance(TimeSpan.FromMilliseconds(74));
        await viewModel.HandleInputCommandAsync(Input(OperationInputAction.RegisterCajuela, "Add"));
        time.Advance(TimeSpan.FromMilliseconds(1));
        await viewModel.HandleInputCommandAsync(Input(OperationInputAction.RegisterCajuela, "Add"));

        Assert.AreEqual(2, cajuelas.RegisterCalls);
        Assert.AreEqual(2, viewModel.Line.Total);
        CollectionAssert.AreEqual(
            new[] { OperationInputMetricOutcome.Accepted, OperationInputMetricOutcome.Suppressed, OperationInputMetricOutcome.Accepted },
            metrics.Items.Select(item => item.Outcome).ToArray());
        Assert.AreEqual(74d, metrics.Items[1].InputIntervalMilliseconds);
        Assert.AreEqual(75d, metrics.Items[2].InputIntervalMilliseconds);
    }

    private static OperationViewModel Create(
        ILocalOperationDashboardRepository dashboard,
        ILocalCajuelaRepository cajuelas,
        TimeProvider? time = null,
        RecordingMetrics? metrics = null,
        RecordingFeedback? feedback = null)
    {
        time ??= new FixedTimeProvider(Now);
        var safety = Options.Create(new OperationSafetyOptions());
        return new OperationViewModel(
            dashboard,
            new RegisterCajuelaHandler(cajuelas, time),
            new RevertLastCajuelaHandler(cajuelas, time),
            new StubInputCommandSource(),
            new OperationInputGuard(safety, time),
            metrics ?? new RecordingMetrics(),
            feedback ?? new RecordingFeedback(),
            safety,
            Options.Create(new StationOptions { Id = StationId }),
            time);
    }

    private static LocalOperationDashboardSnapshot ReadySnapshot(int total, int pending = 1) =>
        new(
            Session(),
            "Línea 1",
            "La Esperanza",
            Now.AddHours(-1),
            "Marta",
            Now.AddMinutes(-15),
            "Juan",
            Now.AddMinutes(-15),
            total,
            pending);

    private static LocalOperationalSession Session() =>
        new(
            StationId,
            OrganizationId,
            PlantId,
            LineId,
            ShipmentId,
            CycleId,
            WorkerId,
            Now.AddHours(-1),
            Now.AddMinutes(-15),
            LineFeedCycleStatus.Active);

    private static OperationInputCommand Input(
        OperationInputAction action,
        string signal,
        Guid? commandId = null) =>
        new(
            commandId ?? Guid.NewGuid(),
            action,
            new OperationInputOrigin("KEYBOARD", "shared-keyboard", signal, 1, false),
            Now);

    private sealed class QueueDashboardRepository(params LocalOperationDashboardSnapshot[] snapshots)
        : ILocalOperationDashboardRepository
    {
        private int index;

        public Task<LocalOperationDashboardSnapshot> GetAsync(
            Guid stationId,
            CancellationToken cancellationToken = default)
        {
            Assert.AreEqual(StationId, stationId);
            LocalOperationDashboardSnapshot result = snapshots[Math.Min(index, snapshots.Length - 1)];
            index++;
            return Task.FromResult(result);
        }
    }

    private sealed class StubCajuelaRepository(int total, bool rejectReversal = false) : ILocalCajuelaRepository
    {
        private readonly ProductionEvent target = Added(Guid.Parse("50000000-0000-4000-8000-000000000001"), 1);

        public int RegisterCalls { get; private set; }
        public int ReverseCalls { get; private set; }
        public RegisterCajuelaMutation? LastRegisterMutation { get; private set; }
        public ReverseCajuelaMutation? LastReverseMutation { get; private set; }

        public Task<LocalCajuelaRegistration> RegisterAsync(
            RegisterCajuelaMutation mutation,
            CancellationToken cancellationToken = default)
        {
            RegisterCalls++;
            LastRegisterMutation = mutation;
            total++;
            return Task.FromResult(new LocalCajuelaRegistration(
                Added(mutation.ClientEventId, RegisterCalls + 1),
                total,
                false));
        }

        public Task<int> GetTotalAsync(
            Guid lineId,
            Guid shipmentId,
            CancellationToken cancellationToken = default) => Task.FromResult(total);

        public Task<LocalCajuelaCorrectionTarget> FindCorrectionTargetAsync(
            Guid stationId,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(new LocalCajuelaCorrectionTarget(Session(), target, total));

        public Task<LocalCajuelaReversal> ReverseAsync(
            ReverseCajuelaMutation mutation,
            CancellationToken cancellationToken = default)
        {
            if (rejectReversal)
            {
                throw new InvalidOperationException("El contexto cambió.");
            }

            ReverseCalls++;
            LastReverseMutation = mutation;
            total--;
            ProductionEvent reversal = ProductionEvent.CajuelaReversed(
                mutation.ReversalEventId,
                Context(),
                10,
                mutation.ConfirmedAt,
                mutation.ConfirmedAt,
                mutation.TargetClientEventId);
            return Task.FromResult(new LocalCajuelaReversal(
                reversal,
                mutation.TargetClientEventId,
                mutation.ReasonCode,
                total,
                false));
        }

        private static ProductionEvent Added(Guid id, long sequence) =>
            ProductionEvent.CajuelaAdded(id, Context(), sequence, Now, Now);

        private static ProductionEventContext Context() =>
            ProductionEventContext.Create(
                OrganizationId,
                PlantId,
                StationId,
                LineId,
                CycleId,
                ShipmentId,
                WorkerId);
    }

    private sealed class ThrowingDashboardRepository : ILocalOperationDashboardRepository
    {
        public Task<LocalOperationDashboardSnapshot> GetAsync(
            Guid stationId,
            CancellationToken cancellationToken = default) =>
            throw new IOException("Base local no disponible.");
    }

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }

    private sealed class ManualTimeProvider(DateTimeOffset now) : TimeProvider
    {
        private long milliseconds;
        public override long TimestampFrequency => 1000;
        public override DateTimeOffset GetUtcNow() => now.AddMilliseconds(milliseconds);
        public override long GetTimestamp() => milliseconds;
        public void Advance(TimeSpan interval) => milliseconds += (long)interval.TotalMilliseconds;
    }

    private sealed class RecordingMetrics : IOperationInputMetrics
    {
        public List<LocalOperationInputMetric> Items { get; } = [];
        public void Record(LocalOperationInputMetric metric) => Items.Add(metric);
    }

    private sealed class RecordingFeedback : IOperationFeedbackPlayer
    {
        public OperationFeedbackKind LastKind { get; private set; }
        public void Play(OperationFeedbackKind kind) => LastKind = kind;
    }

    private sealed class StubInputCommandSource : IInputCommandSource
    {
        public IReadOnlyCollection<string> ControllerIds => [];

        public bool TryCreateForAdapter(
            string adapterKind,
            string signalCode,
            bool isRepeat,
            out OperationInputCommand? command)
        {
            command = null;
            return false;
        }

        public bool TryCreateForController(
            string controllerId,
            string signalCode,
            bool isRepeat,
            out OperationInputCommand? command)
        {
            command = null;
            return false;
        }
    }
}
