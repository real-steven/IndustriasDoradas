using System.Net;
using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Configuration;
using IndustriasDoradas.Desktop.Domain;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Tests.Application;

[TestClass]
public sealed class StationCoordinatorTests
{
    [TestMethod]
    public async Task OfflineResumeExpiresAtTwentyFourHoursWithoutDeletingEvents()
    {
        var time = new MutableTimeProvider();
        ProtectedStationState state = Fixture(time.GetUtcNow().AddHours(24));
        var store = new MemoryStore(state);
        StationCoordinator coordinator = Create(store, new StubApi(), time);

        Assert.IsNotNull(await coordinator.ResumeAsync(networkAvailable: false));
        time.Advance(TimeSpan.FromHours(24).Add(TimeSpan.FromSeconds(1)));

        Assert.IsNull(await coordinator.ResumeAsync(networkAvailable: false));
        Assert.AreEqual(1, store.State?.PendingEvents.Count);
    }

    [TestMethod]
    public async Task OnlineRevocationClearsAuthorizationWithoutDeletingEvents()
    {
        var time = new MutableTimeProvider();
        var store = new MemoryStore(Fixture(time.GetUtcNow().AddHours(24)));
        var api = new StubApi { AuthorizationFailure = new HttpRequestException("revoked", null, HttpStatusCode.Forbidden) };
        StationCoordinator coordinator = Create(store, api, time);

        Assert.IsNull(await coordinator.ResumeAsync(networkAvailable: true));
        Assert.AreEqual(DateTimeOffset.MinValue, store.State?.Authorization.OfflineValidUntil);
        Assert.AreEqual(1, store.State?.PendingEvents.Count);
    }

    [TestMethod]
    public async Task OfflinePinRejectsUnboundedOrMalformedVerifierWithoutFailingTheStation()
    {
        var time = new MutableTimeProvider();
        ProtectedStationState fixture = Fixture(time.GetUtcNow().AddHours(24));
        var state = fixture with
        {
            Authorization = fixture.Authorization with
            {
                PinVerifier = "pbkdf2-sha256$999999999$not-base64$not-base64",
            },
        };
        var store = new MemoryStore(state);
        StationCoordinator coordinator = Create(store, new StubApi(), time);

        PinAttemptResponse response = await coordinator.ElevateAsync(state, "123456", networkAvailable: false);

        Assert.AreEqual("REJECTED", response.Result);
        Assert.AreEqual(2, store.State?.PendingEvents.Count);
    }

    private static StationCoordinator Create(MemoryStore store, StubApi api, TimeProvider time) =>
        new(new StubAuth(), api, store, new StubEvidence(),
            Options.Create(new StationOptions { Id = Guid.Parse("34000000-0000-4000-8000-000000000001") }), time);

    private static ProtectedStationState Fixture(DateTimeOffset offlineUntil) => new(
        new("access", "refresh", offlineUntil),
        new(Guid.NewGuid(), Guid.Parse("30000000-0000-4000-8000-000000000001"), "JEFE_PLANTA", offlineUntil),
        new(Guid.Parse("34000000-0000-4000-8000-000000000001"), Guid.NewGuid(),
            Guid.Parse("30000000-0000-4000-8000-000000000001"), "Estación ficticia", 1,
            "pbkdf2-sha256$600000$AA==$AA==", offlineUntil.AddHours(-24), offlineUntil),
        [new(Guid.NewGuid(), "EVENT", offlineUntil.AddHours(-1), "PENDING")],
        OfflinePinState.Empty);

    private sealed class MutableTimeProvider : TimeProvider
    {
        private DateTimeOffset now = new(2026, 8, 19, 0, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => now;
        public void Advance(TimeSpan duration) => now += duration;
    }

    private sealed class MemoryStore(ProtectedStationState state) : IProtectedStationStore
    {
        public ProtectedStationState? State { get; private set; } = state;
        public Task SaveAsync(ProtectedStationState value, CancellationToken cancellationToken = default) { State = value; return Task.CompletedTask; }
        public Task<ProtectedStationState?> LoadAsync(CancellationToken cancellationToken = default) => Task.FromResult(State);
        public Task ClearAuthorizationAsync(CancellationToken cancellationToken = default)
        {
            if (State is not null) State = State with { Authorization = State.Authorization with { OfflineValidUntil = DateTimeOffset.MinValue } };
            return Task.CompletedTask;
        }
    }

    private sealed class StubAuth : ISupabaseAuthService
    {
        public Task<AuthTokens> SignInAsync(string email, string password, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task RequestPasswordRecoveryAsync(string email, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }

    private sealed class StubEvidence : IElevationEvidenceCapture
    {
        public Task<EvidenceCaptureResult> CaptureAsync(CancellationToken cancellationToken = default) => Task.FromResult(new EvidenceCaptureResult(false));
    }

    private sealed class StubApi : IStationApi
    {
        public HttpRequestException? AuthorizationFailure { get; init; }
        public Task<ApiSession> GetSessionAsync(string accessToken, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<StationAuthorization> GetAuthorizationAsync(Guid organizationId, Guid stationId, string accessToken, CancellationToken cancellationToken = default) =>
            AuthorizationFailure is null ? throw new NotSupportedException() : Task.FromException<StationAuthorization>(AuthorizationFailure);
        public Task<PinAttemptResponse> ElevateAsync(Guid organizationId, Guid stationId, string pin, string accessToken, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    }
}
