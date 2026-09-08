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
        Assert.IsTrue(store.State?.IsClosed);
        Assert.AreEqual(DateTimeOffset.MinValue, store.State?.Authorization.OfflineValidUntil);
        Assert.AreEqual(1, store.State?.PendingEvents.Count);
    }

    [TestMethod]
    public async Task OnlineResumeRotatesExpiredTokenAndKeepsStationOpen()
    {
        var time = new MutableTimeProvider();
        ProtectedStationState original = Fixture(time.GetUtcNow().AddHours(24)) with
        {
            Tokens = new AuthTokens("expired-access", "old-refresh", time.GetUtcNow().AddMinutes(-1)),
        };
        var store = new MemoryStore(original);
        var api = new StubApi
        {
            AuthorizationResult = original.Authorization,
            SessionResult = original.Session with { ExpiresAt = time.GetUtcNow().AddHours(1) },
        };
        var auth = new StubAuth
        {
            RefreshResult = new AuthTokens("new-access", "new-refresh", time.GetUtcNow().AddHours(1)),
        };
        StationCoordinator coordinator = Create(store, api, time, auth);

        ProtectedStationState? resumed = await coordinator.ResumeAsync(networkAvailable: true);

        Assert.IsNotNull(resumed);
        Assert.AreEqual(1, auth.RefreshCalls);
        Assert.AreEqual("new-access", resumed.Tokens.AccessToken);
        Assert.AreEqual("new-refresh", store.State?.Tokens.RefreshToken);
        Assert.AreEqual("new-access", api.LastAuthorizationAccessToken);
    }

    [TestMethod]
    public async Task RejectedRefreshClosesSessionWithoutDeletingPendingEvents()
    {
        var time = new MutableTimeProvider();
        ProtectedStationState original = Fixture(time.GetUtcNow().AddHours(24)) with
        {
            Tokens = new AuthTokens("expired-access", "rejected-refresh", time.GetUtcNow().AddMinutes(-1)),
        };
        var store = new MemoryStore(original);
        var auth = new StubAuth
        {
            RefreshFailure = new HttpRequestException("invalid refresh token", null, HttpStatusCode.BadRequest),
        };
        StationCoordinator coordinator = Create(store, new StubApi(), time, auth);

        Assert.IsNull(await coordinator.ResumeAsync(networkAvailable: true));
        Assert.IsTrue(store.State?.IsClosed);
        Assert.AreEqual(string.Empty, store.State?.Tokens.RefreshToken);
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

    [TestMethod]
    public async Task OnlineElevationTimeoutFallsBackWithoutCrashingTheStation()
    {
        var time = new MutableTimeProvider();
        ProtectedStationState state = Fixture(time.GetUtcNow().AddHours(24));
        var store = new MemoryStore(state);
        var api = new StubApi { ElevationFailure = new TaskCanceledException("simulated timeout") };
        StationCoordinator coordinator = Create(store, api, time);

        PinAttemptResponse response = await coordinator.ElevateAsync(
            state,
            "123456",
            networkAvailable: true);

        Assert.AreEqual("REJECTED", response.Result);
        Assert.AreEqual(2, store.State?.PendingEvents.Count);
    }

    private static StationCoordinator Create(
        MemoryStore store,
        StubApi api,
        TimeProvider time,
        StubAuth? auth = null) =>
        new(auth ?? new StubAuth(), api, new StubCatalogs(), store, new StubEvidence(),
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
        public Task CloseSessionAsync(CancellationToken cancellationToken = default)
        {
            if (State is not null)
            {
                State = State with
                {
                    Tokens = new AuthTokens(string.Empty, string.Empty, DateTimeOffset.MinValue),
                    Authorization = State.Authorization with { OfflineValidUntil = DateTimeOffset.MinValue },
                    IsClosed = true,
                };
            }
            return Task.CompletedTask;
        }
    }

    private sealed class StubAuth : ISupabaseAuthService
    {
        public AuthTokens? RefreshResult { get; init; }
        public HttpRequestException? RefreshFailure { get; init; }
        public int RefreshCalls { get; private set; }
        public Task<AuthTokens> SignInAsync(string email, string password, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<AuthTokens> RefreshSessionAsync(string refreshToken, CancellationToken cancellationToken = default)
        {
            RefreshCalls++;
            return RefreshFailure is null
                ? Task.FromResult(RefreshResult ?? throw new NotSupportedException())
                : Task.FromException<AuthTokens>(RefreshFailure);
        }
        public Task RequestPasswordRecoveryAsync(string email, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }

    private sealed class StubEvidence : IElevationEvidenceCapture
    {
        public Task<EvidenceCaptureResult> CaptureAsync(CancellationToken cancellationToken = default) => Task.FromResult(new EvidenceCaptureResult(false));
    }

    private sealed class StubApi : IStationApi
    {
        public HttpRequestException? AuthorizationFailure { get; init; }
        public StationAuthorization? AuthorizationResult { get; init; }
        public ApiSession? SessionResult { get; init; }
        public Exception? ElevationFailure { get; init; }
        public string? LastAuthorizationAccessToken { get; private set; }
        public Task<ApiSession> GetSessionAsync(string accessToken, CancellationToken cancellationToken = default) =>
            Task.FromResult(SessionResult ?? throw new NotSupportedException());
        public Task<StationAuthorization> GetAuthorizationAsync(Guid organizationId, Guid stationId, string accessToken, CancellationToken cancellationToken = default)
        {
            LastAuthorizationAccessToken = accessToken;
            return AuthorizationFailure is not null
                ? Task.FromException<StationAuthorization>(AuthorizationFailure)
                : Task.FromResult(AuthorizationResult ?? throw new NotSupportedException());
        }
        public Task<PinAttemptResponse> ElevateAsync(Guid organizationId, Guid stationId, string pin, string accessToken, CancellationToken cancellationToken = default) =>
            ElevationFailure is null
                ? throw new NotSupportedException()
                : Task.FromException<PinAttemptResponse>(ElevationFailure);
        public Task<LocalOperationCatalogSnapshot> GetOperationCatalogAsync(Guid organizationId, Guid plantId, string accessToken, CancellationToken cancellationToken = default) =>
            Task.FromResult(new LocalOperationCatalogSnapshot([], [], []));
    }

    private sealed class StubCatalogs : ILocalCatalogRepository
    {
        public Task UpsertSupplierAsync(CachedSupplier supplier, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task UpsertWorkerAsync(CachedWorker worker, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task UpsertLineAsync(CachedProductionLine line, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task<IReadOnlyList<CachedSupplier>> ListActiveSuppliersAsync(Guid organizationId, CancellationToken cancellationToken = default) => Task.FromResult<IReadOnlyList<CachedSupplier>>([]);
        public Task<IReadOnlyList<CachedWorker>> ListActiveWorkersAsync(Guid organizationId, CancellationToken cancellationToken = default) => Task.FromResult<IReadOnlyList<CachedWorker>>([]);
        public Task<IReadOnlyList<CachedProductionLine>> ListActiveLinesAsync(Guid organizationId, Guid plantId, CancellationToken cancellationToken = default) => Task.FromResult<IReadOnlyList<CachedProductionLine>>([]);
        public Task<CachedSupplier?> FindSupplierAsync(Guid supplierId, CancellationToken cancellationToken = default) => Task.FromResult<CachedSupplier?>(null);
        public Task<CachedWorker?> FindWorkerAsync(Guid workerId, CancellationToken cancellationToken = default) => Task.FromResult<CachedWorker?>(null);
        public Task<CachedProductionLine?> FindLineAsync(Guid lineId, CancellationToken cancellationToken = default) => Task.FromResult<CachedProductionLine?>(null);
    }
}
