using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Domain;

namespace IndustriasDoradas.Desktop.Tests.Application;

[TestClass]
public sealed class PrivilegeModeControllerTests
{
    [TestMethod]
    public void IdleTimeoutReturnsToOperationAndPreservesDraft()
    {
        var time = new MutableTimeProvider();
        var controller = new PrivilegeModeController(time, TimeSpan.FromMinutes(2));
        controller.OpenOperationMode();
        controller.EnterPlantManagerMode();
        controller.Draft = "Corrección ficticia en curso";

        time.Advance(TimeSpan.FromSeconds(119));
        Assert.IsFalse(controller.EvaluateIdleTimeout());
        time.Advance(TimeSpan.FromSeconds(2));

        Assert.IsTrue(controller.EvaluateIdleTimeout());
        Assert.AreEqual(StationMode.Operation, controller.Mode);
        Assert.AreEqual("Corrección ficticia en curso", controller.Draft);
    }

    private sealed class MutableTimeProvider : TimeProvider
    {
        private DateTimeOffset now = new(2026, 8, 19, 0, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => now;
        public void Advance(TimeSpan duration) => now += duration;
    }
}
