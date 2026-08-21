using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Configuration;
using IndustriasDoradas.Desktop.Domain;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Application;

public sealed class StationCoordinator(
    ISupabaseAuthService auth,
    IStationApi api,
    IProtectedStationStore store,
    IElevationEvidenceCapture evidence,
    IOptions<StationOptions> stationOptions,
    TimeProvider timeProvider)
{
    private readonly StationOptions options = stationOptions.Value;

    public async Task<ProtectedStationState> SignInAsync(string email, string password, CancellationToken cancellationToken = default)
    {
        AuthTokens tokens = await auth.SignInAsync(email, password, cancellationToken).ConfigureAwait(false);
        ApiSession session = await api.GetSessionAsync(tokens.AccessToken, cancellationToken).ConfigureAwait(false);
        if (!string.Equals(session.Role, "JEFE_PLANTA", StringComparison.Ordinal))
            throw new UnauthorizedAccessException("La estación requiere una cuenta JEFE_PLANTA.");
        StationAuthorization authorization = await api.GetAuthorizationAsync(
            session.OrganizationId, options.Id, tokens.AccessToken, cancellationToken).ConfigureAwait(false);
        var state = new ProtectedStationState(tokens, session, authorization, [], OfflinePinState.Empty);
        await store.SaveAsync(state, cancellationToken).ConfigureAwait(false);
        return state;
    }

    public async Task<ProtectedStationState?> ResumeAsync(bool networkAvailable, CancellationToken cancellationToken = default)
    {
        ProtectedStationState? saved = await store.LoadAsync(cancellationToken).ConfigureAwait(false);
        if (saved is null) return null;
        DateTimeOffset now = timeProvider.GetUtcNow();
        if (!networkAvailable)
            return saved.Authorization.OfflineValidUntil > now ? saved : null;

        try
        {
            StationAuthorization refreshed = await api.GetAuthorizationAsync(
                saved.Session.OrganizationId, options.Id, saved.Tokens.AccessToken, cancellationToken).ConfigureAwait(false);
            var state = saved with { Authorization = refreshed };
            await store.SaveAsync(state, cancellationToken).ConfigureAwait(false);
            return state;
        }
        catch (HttpRequestException exception) when (exception.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.Unauthorized)
        {
            await store.ClearAuthorizationAsync(cancellationToken).ConfigureAwait(false);
            return null;
        }
        catch (HttpRequestException)
        {
            return saved.Authorization.OfflineValidUntil > now ? saved : null;
        }
    }

    public async Task<PinAttemptResponse> ElevateAsync(ProtectedStationState state, string pin, bool networkAvailable, CancellationToken cancellationToken = default)
    {
        state = await store.LoadAsync(cancellationToken).ConfigureAwait(false) ?? state;
        PinAttemptResponse response;
        OfflinePinState nextOffline = state.OfflinePin;
        if (networkAvailable)
        {
            try
            {
                response = await api.ElevateAsync(state.Session.OrganizationId, options.Id, pin,
                    state.Tokens.AccessToken, cancellationToken).ConfigureAwait(false);
            }
            catch (HttpRequestException exception) when (exception.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.Unauthorized)
            {
                await store.ClearAuthorizationAsync(cancellationToken).ConfigureAwait(false);
                return new PinAttemptResponse("REAUTHENTICATION_REQUIRED", null, null);
            }
            catch (HttpRequestException)
            {
                if (state.Authorization.OfflineValidUntil <= timeProvider.GetUtcNow())
                    return new PinAttemptResponse("OFFLINE_EXPIRED", null, null);
                (response, nextOffline) = EvaluateOfflinePin(pin, state.Authorization.PinVerifier, state.OfflinePin);
            }
        }
        else
        {
            if (state.Authorization.OfflineValidUntil <= timeProvider.GetUtcNow())
                return new PinAttemptResponse("OFFLINE_EXPIRED", null, null);
            (response, nextOffline) = EvaluateOfflinePin(pin, state.Authorization.PinVerifier, state.OfflinePin);
        }

        EvidenceCaptureResult captured = await evidence.CaptureAsync(cancellationToken).ConfigureAwait(false);
        var stationEvent = new PendingStationEvent(Guid.NewGuid(), "PRIVILEGE_ELEVATION",
            timeProvider.GetUtcNow(), $"{response.Result}:EVIDENCE_{(captured.Present ? "PRESENT" : "ABSENT")}");
        var updated = state with { PendingEvents = [.. state.PendingEvents, stationEvent], OfflinePin = nextOffline };
        await store.SaveAsync(updated, cancellationToken).ConfigureAwait(false);
        return response;
    }

    public Task RequestPasswordRecoveryAsync(string email, CancellationToken cancellationToken = default) =>
        auth.RequestPasswordRecoveryAsync(email, cancellationToken);

    private (PinAttemptResponse Response, OfflinePinState State) EvaluateOfflinePin(
        string pin, string verifier, OfflinePinState state)
    {
        DateTimeOffset now = timeProvider.GetUtcNow();
        if (state.ResetRequired) return (new("RESET_REQUIRED", null, null), state);
        if (state.BlockedUntil > now) return (new("BLOCKED", null, state.BlockedUntil), state);
        if (VerifyPin(pin, verifier)) return (new("ACCEPTED", null, null), OfflinePinState.Empty with { LastBlockedAt = state.LastBlockedAt });

        bool newWindow = state.WindowStartedAt is null || state.WindowStartedAt <= now.AddMinutes(-15);
        int attempts = newWindow ? 1 : state.FailedAttempts + 1;
        if (attempts < 5)
        {
            var rejected = state with { FailedAttempts = attempts, WindowStartedAt = newWindow ? now : state.WindowStartedAt, BlockedUntil = null };
            return (new("REJECTED", 5 - attempts, null), rejected);
        }
        if (state.LastBlockedAt > now.AddHours(-24))
        {
            var reset = new OfflinePinState(0, null, null, now, true);
            return (new("RESET_REQUIRED", 0, null), reset);
        }
        var blocked = new OfflinePinState(0, null, now.AddMinutes(15), now, false);
        return (new("BLOCKED", 0, blocked.BlockedUntil), blocked);
    }

    private static bool VerifyPin(string pin, string verifier)
    {
        try
        {
            string[] parts = verifier.Split('$');
            if (parts.Length != 4 || parts[0] != "pbkdf2-sha256" || !int.TryParse(parts[1], out int iterations) || iterations != 600_000)
                return false;
            byte[] salt = Convert.FromBase64String(parts[2]);
            byte[] expected = Convert.FromBase64String(parts[3]);
            if (salt.Length != 16 || expected.Length != 32)
                return false;
            byte[] actual = Rfc2898DeriveBytes.Pbkdf2(pin, salt, iterations, HashAlgorithmName.SHA256, expected.Length);
            return CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        catch (FormatException)
        {
            return false;
        }
    }
}
