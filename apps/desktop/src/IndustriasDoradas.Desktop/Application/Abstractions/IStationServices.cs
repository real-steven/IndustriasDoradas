using IndustriasDoradas.Desktop.Domain;

namespace IndustriasDoradas.Desktop.Application.Abstractions;

public interface ISupabaseAuthService
{
    Task<AuthTokens> SignInAsync(string email, string password, CancellationToken cancellationToken = default);
    Task RequestPasswordRecoveryAsync(string email, CancellationToken cancellationToken = default);
}

public interface IStationApi
{
    Task<ApiSession> GetSessionAsync(string accessToken, CancellationToken cancellationToken = default);
    Task<StationAuthorization> GetAuthorizationAsync(Guid organizationId, Guid stationId, string accessToken, CancellationToken cancellationToken = default);
    Task<PinAttemptResponse> ElevateAsync(Guid organizationId, Guid stationId, string pin, string accessToken, CancellationToken cancellationToken = default);
}

public sealed record PinAttemptResponse(string Result, int? RemainingAttempts, DateTimeOffset? BlockedUntil);

public interface IProtectedStationStore
{
    Task SaveAsync(ProtectedStationState state, CancellationToken cancellationToken = default);
    Task<ProtectedStationState?> LoadAsync(CancellationToken cancellationToken = default);
    Task ClearAuthorizationAsync(CancellationToken cancellationToken = default);
}

public interface IElevationEvidenceCapture
{
    Task<EvidenceCaptureResult> CaptureAsync(CancellationToken cancellationToken = default);
}

public sealed record EvidenceCaptureResult(bool Present);
