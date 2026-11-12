using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Presentation.ViewModels;

namespace IndustriasDoradas.Desktop.Tests.Presentation;

/// <summary>Acciones nuevas de los atajos de teclado en Operación.</summary>
public sealed partial class OperationViewModelTests
{
    [TestMethod]
    public async Task KeyboardFiveCajuelasWritesFiveEventsWithKeyboardOrigin()
    {
        var dashboard = new QueueDashboardRepository(ReadySnapshot(total: 2), ReadySnapshot(total: 7));
        var cajuelas = new StubCajuelaRepository(total: 2);
        OperationViewModel viewModel = Create(dashboard, cajuelas, new ManualTimeProvider(Now));
        await viewModel.InitializeAsync();

        await viewModel.HandleInputCommandAsync(Input(OperationInputAction.RegisterFiveCajuelas, "D5"));

        Assert.AreEqual(5, cajuelas.RegisterCalls);
        Assert.AreEqual(5, cajuelas.RegisterMutations.Select(item => item.ClientEventId).Distinct().Count(),
            "Cada cajuela debe tener su propio UUID para la idempotencia.");
        foreach (RegisterCajuelaMutation mutation in cajuelas.RegisterMutations)
        {
            Assert.AreEqual("KEYBOARD", mutation.InputOrigin.SourceKind);
            Assert.AreEqual("shared-keyboard", mutation.InputOrigin.ControllerId);
            Assert.AreEqual("D5", mutation.InputOrigin.SignalCode);
            Assert.IsFalse(mutation.InputOrigin.IsRepeat);
        }
    }

    [TestMethod]
    public async Task HeldFiveCajuelasKeyNeverWrites()
    {
        var dashboard = new QueueDashboardRepository(ReadySnapshot(total: 2));
        var cajuelas = new StubCajuelaRepository(total: 2);
        var metrics = new RecordingMetrics();
        OperationViewModel viewModel = Create(dashboard, cajuelas, new ManualTimeProvider(Now), metrics);
        await viewModel.InitializeAsync();

        await viewModel.HandleInputCommandAsync(Input(OperationInputAction.RegisterFiveCajuelas, "D5") with
        {
            Origin = new OperationInputOrigin("KEYBOARD", "shared-keyboard", "D5", 1, true),
        });

        Assert.AreEqual(0, cajuelas.RegisterCalls);
        Assert.AreEqual("AUTO_REPEAT", metrics.Items.Single().ErrorCode);
    }

    [TestMethod]
    public async Task BouncedFiveCajuelasKeyIsAcceptedOnlyOnce()
    {
        var time = new ManualTimeProvider(Now);
        var dashboard = new QueueDashboardRepository(ReadySnapshot(total: 0), ReadySnapshot(total: 5));
        var cajuelas = new StubCajuelaRepository(total: 0);
        OperationViewModel viewModel = Create(dashboard, cajuelas, time);
        await viewModel.InitializeAsync();

        await viewModel.HandleInputCommandAsync(Input(OperationInputAction.RegisterFiveCajuelas, "D5"));
        time.Advance(TimeSpan.FromMilliseconds(20));
        await viewModel.HandleInputCommandAsync(Input(OperationInputAction.RegisterFiveCajuelas, "D5"));

        Assert.AreEqual(5, cajuelas.RegisterCalls, "Un rebote de la tecla no puede duplicar el registro.");
    }

    [TestMethod]
    public async Task KeyboardOpensSweepConfirmsOnlyWithPlantManagerAndCancelsWithEscape()
    {
        var dashboard = new QueueDashboardRepository(
            ReadySnapshot(total: 50),
            ReadySnapshot(total: 50, lastSweep: 50));
        var sweeps = new StubSweepRepository(50);
        var managerMode = new PlantManagerModeState();
        OperationViewModel viewModel = Create(
            dashboard,
            new StubCajuelaRepository(total: 50),
            sweeps: sweeps,
            managerMode: managerMode);
        await viewModel.InitializeAsync();

        await viewModel.HandleInputCommandAsync(Input(OperationInputAction.PrepareSweep, "B"));
        Assert.IsTrue(viewModel.IsSweepConfirmationPending);

        await viewModel.HandleInputCommandAsync(Input(OperationInputAction.Confirm, "Return"));
        Assert.AreEqual(0, sweeps.RecordCalls, "Sin Modo Jefe de Planta la barrida no se confirma.");
        Assert.IsTrue(viewModel.IsSweepConfirmationPending);

        await viewModel.HandleInputCommandAsync(Input(OperationInputAction.Cancel, "Escape"));
        Assert.IsFalse(viewModel.IsSweepConfirmationPending);
        Assert.AreEqual(0, sweeps.RecordCalls);

        await viewModel.HandleInputCommandAsync(Input(OperationInputAction.PrepareSweep, "B"));
        managerMode.SetActive(true);
        await viewModel.HandleInputCommandAsync(Input(OperationInputAction.Confirm, "Return"));
        Assert.AreEqual(1, sweeps.RecordCalls);
        Assert.IsFalse(viewModel.IsSweepConfirmationPending);
    }

    [TestMethod]
    public async Task HeldSubtractKeyDoesNotPrepareACorrection()
    {
        var dashboard = new QueueDashboardRepository(ReadySnapshot(total: 2));
        var cajuelas = new StubCajuelaRepository(total: 2);
        OperationViewModel viewModel = Create(dashboard, cajuelas);
        await viewModel.InitializeAsync();

        await viewModel.HandleInputCommandAsync(Input(OperationInputAction.RevertLastCajuela, "Subtract") with
        {
            Origin = new OperationInputOrigin("KEYBOARD", "shared-keyboard", "Subtract", 1, true),
        });

        Assert.IsFalse(viewModel.IsCorrectionPending);
        Assert.AreEqual(0, cajuelas.ReverseCalls);
    }
}
