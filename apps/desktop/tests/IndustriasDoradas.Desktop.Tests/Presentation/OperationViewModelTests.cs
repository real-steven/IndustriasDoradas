using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Configuration;
using IndustriasDoradas.Desktop.Domain;
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
    private static readonly Guid SecondLineId = Guid.Parse("43000000-0000-4000-8000-000000000002");
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
        var feedback = new RecordingFeedback();
        OperationViewModel viewModel = Create(dashboard, cajuelas, feedback: feedback);
        await viewModel.InitializeAsync();

        await viewModel.RegisterCajuelaCommand.ExecuteAsync(null);

        Assert.AreEqual(1, cajuelas.RegisterCalls);
        Assert.AreEqual(8, viewModel.Line.Total);
        StringAssert.Contains(viewModel.LastResult, "guardada localmente");
        Assert.AreEqual("2 pendientes · 0 requieren revisión · 0 sincronizados", viewModel.PendingStatus);
        Assert.AreEqual(OperationFeedbackKind.Success, feedback.LastKind);
    }

    [TestMethod]
    public async Task AddFiveRegistersFiveIndependentEventsForTheCardLine()
    {
        var dashboard = new QueueDashboardRepository(
            ReadySnapshot(total: 48),
            ReadySnapshot(total: 53, pending: 6));
        var cajuelas = new StubCajuelaRepository(total: 48);
        var metrics = new RecordingMetrics();
        var feedback = new RecordingFeedback();
        OperationViewModel viewModel = Create(
            dashboard,
            cajuelas,
            metrics: metrics,
            feedback: feedback);
        await viewModel.InitializeAsync();

        await viewModel.RegisterFiveLineCajuelasCommand.ExecuteAsync(LineId);

        Assert.AreEqual(5, cajuelas.RegisterCalls);
        Assert.AreEqual(5, cajuelas.RegisterMutations.Count);
        Assert.AreEqual(5, cajuelas.RegisterMutations.Select(item => item.ClientEventId).Distinct().Count());
        Assert.IsTrue(cajuelas.RegisterMutations.All(item => item.LineId == LineId));
        Assert.AreEqual(53, viewModel.Line.Total);
        Assert.IsTrue(viewModel.Line.IsReviewAlertActive);
        Assert.AreEqual(1, feedback.ReviewAlertCalls);
        Assert.AreEqual(1, feedback.PlayCalls);
        Assert.AreEqual(5, metrics.Items.Count(item => item.Outcome == OperationInputMetricOutcome.Accepted));
        StringAssert.Contains(viewModel.LastResult, "5 cajuelas guardadas");
    }

    [TestMethod]
    public async Task TemporaryZeroCooldownAcceptsNextDeliberateClickAfterDebounce()
    {
        var time = new ManualTimeProvider(Now);
        var dashboard = new QueueDashboardRepository(
            ReadySnapshot(total: 0),
            ReadySnapshot(total: 1),
            ReadySnapshot(total: 2));
        var cajuelas = new StubCajuelaRepository(total: 0);
        OperationViewModel viewModel = Create(
            dashboard,
            cajuelas,
            time,
            safetyOptions: new OperationSafetyOptions
            {
                RegistrationCooldownMilliseconds = 0,
            });
        await viewModel.InitializeAsync();

        await viewModel.RegisterLineCajuelaCommand.ExecuteAsync(LineId);
        time.Advance(TimeSpan.FromMilliseconds(75));
        await viewModel.RegisterLineCajuelaCommand.ExecuteAsync(LineId);

        Assert.AreEqual(2, cajuelas.RegisterCalls);
        Assert.AreEqual(2, viewModel.Line.Total);
    }

    [TestMethod]
    public async Task InitializationDisplaysEveryPreparedLineAsAnIndependentCard()
    {
        var dashboard = new ListDashboardRepository(
        [
            ReadySnapshot(total: 7),
            ReadySnapshotForLine(SecondLineId, "Línea 2", total: 12),
        ]);
        OperationViewModel viewModel = Create(dashboard, new StubCajuelaRepository(total: 7));

        await viewModel.InitializeAsync();

        Assert.IsTrue(viewModel.HasActiveLines);
        Assert.AreEqual(2, viewModel.Lines.Count);
        Assert.AreEqual(LineId, viewModel.Lines[0].LineId);
        Assert.AreEqual(SecondLineId, viewModel.Lines[1].LineId);
        Assert.AreEqual(1, viewModel.Lines[0].LineSlot);
        Assert.AreEqual(2, viewModel.Lines[1].LineSlot);
        Assert.AreEqual(12, viewModel.Lines[1].Total);
    }

    [TestMethod]
    public async Task RegistrationAtFiftyShowsNonBlockingMercuryAlert()
    {
        var dashboard = new QueueDashboardRepository(
            ReadySnapshot(total: 49),
            ReadySnapshot(total: 50));
        var feedback = new RecordingFeedback();
        OperationViewModel viewModel = Create(
            dashboard,
            new StubCajuelaRepository(total: 49),
            feedback: feedback);
        await viewModel.InitializeAsync();

        await viewModel.RegisterLineCajuelaCommand.ExecuteAsync(LineId);

        Assert.IsTrue(viewModel.IsMilestoneAlertVisible);
        Assert.AreEqual("Revisar mercurio", viewModel.MilestoneAlertTitle);
        StringAssert.Contains(viewModel.MilestoneAlertMessage, "50");
        StringAssert.Contains(viewModel.MilestoneAlertMessage, "Línea 1");
        Assert.AreEqual(50, viewModel.Line.Total);
        Assert.IsTrue(viewModel.Line.IsReviewAlertActive);
        Assert.AreEqual(1, feedback.ReviewAlertCalls);
        Assert.AreEqual(1, viewModel.MilestoneAlerts.Count);
        Assert.IsTrue(viewModel.RegisterLineCajuelaCommand.CanExecute(LineId));
    }

    [TestMethod]
    public async Task RegistrationAtTwoHundredFiftyKeepsReviewAndSweepSignalsIndependent()
    {
        var dashboard = new QueueDashboardRepository(
            ReadySnapshot(total: 249),
            ReadySnapshot(total: 250));
        OperationViewModel viewModel = Create(dashboard, new StubCajuelaRepository(total: 249));
        await viewModel.InitializeAsync();

        await viewModel.RegisterLineCajuelaCommand.ExecuteAsync(LineId);

        Assert.IsTrue(viewModel.IsMilestoneAlertVisible);
        Assert.IsTrue(viewModel.MilestoneAlerts.Any(alert =>
            alert.Title == "Revisar mercurio" && alert.Message.Contains("250", StringComparison.Ordinal)));
        Assert.IsTrue(viewModel.MilestoneAlerts.Any(alert =>
            alert.Title == "Barrida pendiente" && alert.IsPersistent));
        Assert.IsTrue(viewModel.Line.IsReviewAlertActive);
        Assert.IsTrue(viewModel.Line.IsSweepPending);
        Assert.AreEqual("/ 250", viewModel.Line.TotalReferenceDescription);
        Assert.AreEqual(250d, viewModel.Line.ProgressValue);
        Assert.AreEqual("Mercurio en 50", viewModel.Line.NextMercuryAlertDescription);
        Assert.AreEqual("Barrida pendiente", viewModel.Line.NextSweepAlertDescription);
        Assert.AreEqual("Barrida pendiente", viewModel.Line.NextAlertDescription);
    }

    [TestMethod]
    public async Task CardSeparatesUnsweptCounterFromShipmentAndSweptTotals()
    {
        OperationViewModel beforeSweep = Create(
            new QueueDashboardRepository(ReadySnapshot(total: 260)),
            new StubCajuelaRepository(total: 260));
        OperationViewModel justSwept = Create(
            new QueueDashboardRepository(ReadySnapshot(total: 260, lastSweep: 260)),
            new StubCajuelaRepository(total: 260));
        OperationViewModel afterOneMore = Create(
            new QueueDashboardRepository(ReadySnapshot(total: 261, lastSweep: 260)),
            new StubCajuelaRepository(total: 261));

        await beforeSweep.InitializeAsync();
        await justSwept.InitializeAsync();
        await afterOneMore.InitializeAsync();

        Assert.AreEqual(260, beforeSweep.Line.CajuelasSinceLastSweep);
        Assert.AreEqual(260, beforeSweep.Line.Total);
        Assert.AreEqual(0, beforeSweep.Line.LastSweepCumulativeTotal);
        Assert.AreEqual("/ 250", beforeSweep.Line.TotalReferenceDescription);
        Assert.AreEqual(0, justSwept.Line.CajuelasSinceLastSweep);
        Assert.AreEqual(260, justSwept.Line.Total);
        Assert.AreEqual(260, justSwept.Line.LastSweepCumulativeTotal);
        Assert.AreEqual(1, afterOneMore.Line.CajuelasSinceLastSweep);
        Assert.AreEqual(261, afterOneMore.Line.Total);
        Assert.AreEqual(260, afterOneMore.Line.LastSweepCumulativeTotal);
    }

    [TestMethod]
    public async Task ReviewSignalRemainsFromFiftyThroughFiftyFiveAndClearsAtFiftySix()
    {
        var time = new ManualTimeProvider(Now);
        var dashboard = new QueueDashboardRepository(
            ReadySnapshot(total: 49),
            ReadySnapshot(total: 50),
            ReadySnapshot(total: 51),
            ReadySnapshot(total: 52),
            ReadySnapshot(total: 53),
            ReadySnapshot(total: 54),
            ReadySnapshot(total: 55),
            ReadySnapshot(total: 56));
        var feedback = new RecordingFeedback();
        OperationViewModel viewModel = Create(
            dashboard,
            new StubCajuelaRepository(total: 49),
            time,
            feedback: feedback);
        await viewModel.InitializeAsync();

        for (int total = 50; total <= 56; total++)
        {
            await viewModel.RegisterLineCajuelaCommand.ExecuteAsync(LineId);
            Assert.AreEqual(total is >= 50 and <= 55, viewModel.Line.IsReviewAlertActive);
            time.Advance(TimeSpan.FromSeconds(3));
        }

        Assert.AreEqual(1, feedback.ReviewAlertCalls);
        Assert.IsTrue(viewModel.RegisterLineCajuelaCommand.CanExecute(LineId));
    }

    [TestMethod]
    public async Task ReversingBelowThresholdAllowsTheReviewAlertToTriggerAgain()
    {
        var time = new ManualTimeProvider(Now);
        var dashboard = new QueueDashboardRepository(
            ReadySnapshot(total: 49),
            ReadySnapshot(total: 50),
            ReadySnapshot(total: 49),
            ReadySnapshot(total: 50));
        var feedback = new RecordingFeedback();
        var cajuelas = new StubCajuelaRepository(total: 49);
        OperationViewModel viewModel = Create(dashboard, cajuelas, time, feedback: feedback);
        await viewModel.InitializeAsync();

        await viewModel.RegisterLineCajuelaCommand.ExecuteAsync(LineId);
        await viewModel.PrepareCorrectionCommand.ExecuteAsync(null);
        await viewModel.ConfirmCorrectionCommand.ExecuteAsync(null);
        time.Advance(TimeSpan.FromSeconds(3));
        await viewModel.RegisterLineCajuelaCommand.ExecuteAsync(LineId);

        Assert.AreEqual(2, feedback.ReviewAlertCalls);
        Assert.IsTrue(viewModel.Line.IsReviewAlertActive);
        Assert.AreEqual(50, viewModel.Line.Total);
    }

    [TestMethod]
    public async Task TwoLinesCanDisplayPersistentReviewSignalsAtTheSameTime()
    {
        var dashboard = new ListDashboardRepository(
        [
            ReadySnapshot(total: 50),
            ReadySnapshotForLine(SecondLineId, "Línea 2", total: 100),
        ]);
        OperationViewModel viewModel = Create(dashboard, new StubCajuelaRepository(total: 50));

        await viewModel.InitializeAsync();

        Assert.AreEqual(2, viewModel.Lines.Count);
        Assert.IsTrue(viewModel.Lines[0].IsReviewAlertActive);
        Assert.IsTrue(viewModel.Lines[1].IsReviewAlertActive);
        Assert.AreEqual("REVISAR MERCURIO · 50 CAJUELAS", viewModel.Lines[0].ReviewAlertLabel);
        Assert.AreEqual("REVISAR MERCURIO · 100 CAJUELAS", viewModel.Lines[1].ReviewAlertLabel);
        Assert.IsTrue(viewModel.RegisterLineCajuelaCommand.CanExecute(LineId));
        Assert.IsTrue(viewModel.RegisterLineCajuelaCommand.CanExecute(SecondLineId));
    }

    [TestMethod]
    public async Task SweepPreparationRequiresExplicitConfirmationAndDoesNotStopRegistration()
    {
        var dashboard = new QueueDashboardRepository(
            ReadySnapshot(total: 50),
            ReadySnapshot(total: 50, lastSweep: 50));
        var sweeps = new StubSweepRepository(50);
        OperationViewModel viewModel = Create(
            dashboard,
            new StubCajuelaRepository(total: 50),
            sweeps: sweeps);
        await viewModel.InitializeAsync();

        await viewModel.PrepareLineSweepCommand.ExecuteAsync(LineId);

        Assert.IsTrue(viewModel.IsSweepConfirmationPending);
        Assert.AreEqual(0, sweeps.RecordCalls);
        StringAssert.Contains(viewModel.SweepConfirmationSummary, "50 cajuelas");
        Assert.IsTrue(viewModel.RegisterLineCajuelaCommand.CanExecute(LineId));

        await viewModel.ConfirmSweepCommand.ExecuteAsync(null);

        Assert.IsFalse(viewModel.IsSweepConfirmationPending);
        Assert.AreEqual(1, sweeps.RecordCalls);
        Assert.AreEqual(50, viewModel.Line.LastSweepCumulativeTotal);
        Assert.AreEqual(0, viewModel.Line.CajuelasSinceLastSweep);
        Assert.AreEqual(50, viewModel.Line.Total);
        Assert.AreEqual("/ 250", viewModel.Line.TotalReferenceDescription);
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
            LineId,
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
    public async Task SecondRegistrationInsideCooldownIsSuppressedAcrossInputSources()
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
        time.Advance(TimeSpan.FromMilliseconds(2999));
        await viewModel.HandleInputCommandAsync(new OperationInputCommand(
            Guid.NewGuid(),
            OperationInputAction.RegisterCajuela,
            OperationInputOrigin.Click(OperationInputAction.RegisterCajuela),
            time.GetUtcNow()));
        time.Advance(TimeSpan.FromMilliseconds(1));
        await viewModel.HandleInputCommandAsync(Input(OperationInputAction.RegisterCajuela, "Add"));

        Assert.AreEqual(2, cajuelas.RegisterCalls);
        Assert.AreEqual(2, viewModel.Line.Total);
        CollectionAssert.AreEqual(
            new[] { OperationInputMetricOutcome.Accepted, OperationInputMetricOutcome.Suppressed, OperationInputMetricOutcome.Accepted },
            metrics.Items.Select(item => item.Outcome).ToArray());
        Assert.AreEqual(2999d, metrics.Items[1].InputIntervalMilliseconds);
        Assert.AreEqual("REGISTRATION_COOLDOWN", metrics.Items[1].ErrorCode);
        Assert.AreEqual(3000d, metrics.Items[2].InputIntervalMilliseconds);
    }

    private static OperationViewModel Create(
        ILocalOperationDashboardRepository dashboard,
        ILocalCajuelaRepository cajuelas,
        TimeProvider? time = null,
        RecordingMetrics? metrics = null,
        RecordingFeedback? feedback = null,
        OperationSafetyOptions? safetyOptions = null,
        StubSweepRepository? sweeps = null)
    {
        time ??= new FixedTimeProvider(Now);
        var safety = Options.Create(safetyOptions ?? new OperationSafetyOptions());
        sweeps ??= new StubSweepRepository(1);
        return new OperationViewModel(
            dashboard,
            new RegisterCajuelaHandler(cajuelas, time),
            new RevertLastCajuelaHandler(cajuelas, time),
            new RecordProductionSweepHandler(sweeps, new MemoryStationStore(State()), time),
            new StubInputCommandSource(),
            new OperationInputGuard(safety, time),
            metrics ?? new RecordingMetrics(),
            feedback ?? new RecordingFeedback(),
            new ProductionMilestoneService(),
            safety,
            Options.Create(new StationOptions { Id = StationId }),
            time);
    }

    private static LocalOperationDashboardSnapshot ReadySnapshot(
        int total,
        int pending = 1,
        int lastSweep = 0) =>
        new(
            Session(),
            LineId,
            "Línea 1",
            "La Esperanza",
            Now.AddHours(-1),
            "Marta",
            Now.AddMinutes(-15),
            "Juan",
            Now.AddMinutes(-15),
            total,
            pending,
            LastSweepCumulativeTotal: lastSweep);

    private static LocalOperationDashboardSnapshot ReadySnapshotForLine(
        Guid lineId,
        string lineName,
        int total) =>
        ReadySnapshot(total) with
        {
            Session = Session() with { LineId = lineId },
            LineId = lineId,
            LineName = lineName,
        };

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

    private static ProtectedStationState State() => new(
        new AuthTokens("access", "refresh", Now.AddHours(1)),
        new ApiSession(Guid.Parse("20000000-0000-4000-8000-000000000001"), OrganizationId, "JEFE_PLANTA", Now.AddHours(1)),
        new StationAuthorization(
            StationId,
            PlantId,
            OrganizationId,
            "Estación de prueba",
            1,
            "verifier",
            Now,
            Now.AddHours(24)),
        [],
        OfflinePinState.Empty);

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

        public async Task<IReadOnlyList<LocalOperationDashboardSnapshot>> ListAsync(
            Guid stationId,
            CancellationToken cancellationToken = default) =>
            [await GetAsync(stationId, cancellationToken)];
    }

    private sealed class ListDashboardRepository(
        IReadOnlyList<LocalOperationDashboardSnapshot> snapshots) : ILocalOperationDashboardRepository
    {
        public Task<LocalOperationDashboardSnapshot> GetAsync(
            Guid stationId,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(snapshots[0]);

        public Task<IReadOnlyList<LocalOperationDashboardSnapshot>> ListAsync(
            Guid stationId,
            CancellationToken cancellationToken = default) => Task.FromResult(snapshots);
    }

    private sealed class StubCajuelaRepository(int total, bool rejectReversal = false) : ILocalCajuelaRepository
    {
        private readonly ProductionEvent target = Added(Guid.Parse("50000000-0000-4000-8000-000000000001"), 1);

        public int RegisterCalls { get; private set; }
        public int ReverseCalls { get; private set; }
        public RegisterCajuelaMutation? LastRegisterMutation { get; private set; }
        public ReverseCajuelaMutation? LastReverseMutation { get; private set; }
        public List<RegisterCajuelaMutation> RegisterMutations { get; } = [];

        public Task<LocalCajuelaRegistration> RegisterAsync(
            RegisterCajuelaMutation mutation,
            CancellationToken cancellationToken = default)
        {
            RegisterCalls++;
            LastRegisterMutation = mutation;
            RegisterMutations.Add(mutation);
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

        public Task<LocalCajuelaCorrectionTarget> FindCorrectionTargetAsync(
            Guid stationId,
            Guid lineId,
            CancellationToken cancellationToken = default)
        {
            Assert.AreEqual(LineId, lineId);
            return Task.FromResult(new LocalCajuelaCorrectionTarget(Session(), target, total));
        }

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

    private sealed class StubSweepRepository(int quantity) : ILocalProductionSweepRepository
    {
        public int RecordCalls { get; private set; }

        public Task<LocalSweepPreparation> PrepareAsync(
            Guid stationId,
            Guid lineId,
            CancellationToken cancellationToken = default)
        {
            ProductionEvent[] events = Enumerable.Range(1, quantity)
                .Select(index => ProductionEvent.CajuelaAdded(
                    Guid.NewGuid(),
                    ProductionEventContext.Create(
                        OrganizationId,
                        PlantId,
                        StationId,
                        lineId,
                        CycleId,
                        ShipmentId,
                        WorkerId),
                    index,
                    Now.AddMinutes(-1),
                    Now.AddMinutes(-1)))
                .ToArray();
            LocalOperationalSession session = Session() with { LineId = lineId };
            return Task.FromResult(new LocalSweepPreparation(session, events, quantity, 0));
        }

        public Task<LocalSweepRegistration> RecordAsync(
            ProductionSweep sweep,
            CancellationToken cancellationToken = default)
        {
            RecordCalls++;
            return Task.FromResult(new LocalSweepRegistration(sweep, sweep.CajuelaQuantity, false));
        }
    }

    private sealed class MemoryStationStore(ProtectedStationState state) : IProtectedStationStore
    {
        public Task SaveAsync(ProtectedStationState value, CancellationToken cancellationToken = default) =>
            Task.CompletedTask;

        public Task<ProtectedStationState?> LoadAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult<ProtectedStationState?>(state);

        public Task CloseSessionAsync(CancellationToken cancellationToken = default) => Task.CompletedTask;
    }

    private sealed class ThrowingDashboardRepository : ILocalOperationDashboardRepository
    {
        public Task<LocalOperationDashboardSnapshot> GetAsync(
            Guid stationId,
            CancellationToken cancellationToken = default) =>
            throw new IOException("Base local no disponible.");

        public Task<IReadOnlyList<LocalOperationDashboardSnapshot>> ListAsync(
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
        public int ReviewAlertCalls { get; private set; }
        public int PlayCalls { get; private set; }
        public void Play(OperationFeedbackKind kind)
        {
            LastKind = kind;
            PlayCalls++;
        }
        public void PlayReviewAlert() => ReviewAlertCalls++;
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
