using IndustriasDoradas.Desktop.Domain;
using IndustriasDoradas.Desktop.Infrastructure.LocalStorage;
using IndustriasDoradas.Desktop.Infrastructure.Security;
using IndustriasDoradas.Desktop.Configuration;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Tests.Infrastructure;

[TestClass]
public sealed class ProtectedStationStoreTests
{
    [TestMethod]
    public async Task TwoStationProfilesKeepIndependentProtectedSessions()
    {
        string directory = Path.Combine(Path.GetTempPath(), $"industrias-doradas-{Guid.NewGuid():N}");
        try
        {
            Guid stationOneId = Guid.Parse("34000000-0000-4000-8000-000000000001");
            Guid stationTwoId = Guid.Parse("34000000-0000-4000-8000-000000000002");
            var stationOneStore = Store(directory, stationOneId);
            var stationTwoStore = Store(directory, stationTwoId);

            await stationOneStore.SaveAsync(State(stationOneId, "access-one"));
            await stationTwoStore.SaveAsync(State(stationTwoId, "access-two"));

            ProtectedStationState? stationOne = await stationOneStore.LoadAsync();
            ProtectedStationState? stationTwo = await stationTwoStore.LoadAsync();

            Assert.AreEqual(stationOneId, stationOne?.Authorization.StationId);
            Assert.AreEqual("access-one", stationOne?.Tokens.AccessToken);
            Assert.AreEqual(stationTwoId, stationTwo?.Authorization.StationId);
            Assert.AreEqual("access-two", stationTwo?.Tokens.AccessToken);
            Assert.AreEqual(2, Directory.GetFiles(directory, "station-state.bin", SearchOption.AllDirectories).Length);
        }
        finally
        {
            if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
        }
    }

    private static DpapiStationStore Store(string directory, Guid stationId) =>
        new(new TestPathProvider(Path.Combine(
            directory,
            "stations",
            stationId.ToString("N"),
            "operation.sqlite3")),
            Options.Create(new StationOptions { Id = stationId }));

    private static ProtectedStationState State(Guid stationId, string accessToken)
    {
        DateTimeOffset now = new(2026, 9, 22, 12, 0, 0, TimeSpan.Zero);
        Guid organizationId = Guid.Parse("30000000-0000-4000-8000-000000000001");
        return new(
            new AuthTokens(accessToken, $"refresh-{stationId:N}", now.AddHours(1)),
            new ApiSession(Guid.NewGuid(), organizationId, "JEFE_PLANTA", now.AddHours(1)),
            new StationAuthorization(
                stationId,
                Guid.Parse("31000000-0000-4000-8000-000000000001"),
                organizationId,
                $"Station {stationId:N}",
                1,
                "verifier",
                now,
                now.AddHours(24)),
            [],
            OfflinePinState.Empty);
    }

    private sealed class TestPathProvider(string databasePath) : ILocalDatabasePathProvider
    {
        public string DatabasePath { get; } = databasePath;
    }
}
