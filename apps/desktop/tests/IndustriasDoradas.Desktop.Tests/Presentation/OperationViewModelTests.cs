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
    }

    [TestMethod]
    public async Task LocalStorageFailureIsVisibleAndKeepsMainActionBlocked()
    {
        OperationViewModel viewModel = Create(
            new ThrowingDashboardRepository(),
            new StubCajuelaRepository(0));

        await viewModel.InitializeAsync();

        Assert.AreEqual("Guardado local no disponible", viewModel.LocalStorageStatus);
        StringAssert.Contains(viewModel.LastResult, "Avise al jefe de planta");
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

    private static OperationViewModel Create(
        ILocalOperationDashboardRepository dashboard,
        ILocalCajuelaRepository cajuelas)
    {
        var time = new FixedTimeProvider(Now);
        return new OperationViewModel(
            dashboard,
            new RegisterCajuelaHandler(cajuelas, time),
            new RevertLastCajuelaHandler(cajuelas, time),
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

        public Task<LocalCajuelaRegistration> RegisterAsync(
            RegisterCajuelaMutation mutation,
            CancellationToken cancellationToken = default)
        {
            RegisterCalls++;
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
}
