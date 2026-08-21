namespace IndustriasDoradas.Desktop.Domain;

public sealed record AuthTokens(
    string AccessToken,
    string RefreshToken,
    DateTimeOffset ExpiresAt);

public sealed record ApiSession(
    Guid ProfileId,
    Guid OrganizationId,
    string Role,
    DateTimeOffset ExpiresAt);

public sealed record StationAuthorization(
    Guid StationId,
    Guid PlantId,
    Guid OrganizationId,
    string StationName,
    int PermissionVersion,
    string PinVerifier,
    DateTimeOffset ValidatedAt,
    DateTimeOffset OfflineValidUntil);

public sealed record PendingStationEvent(
    Guid Id,
    string Type,
    DateTimeOffset OccurredAt,
    string Result);

public sealed record OfflinePinState(
    int FailedAttempts,
    DateTimeOffset? WindowStartedAt,
    DateTimeOffset? BlockedUntil,
    DateTimeOffset? LastBlockedAt,
    bool ResetRequired)
{
    public static OfflinePinState Empty { get; } = new(0, null, null, null, false);
}

public sealed record ProtectedStationState(
    AuthTokens Tokens,
    ApiSession Session,
    StationAuthorization Authorization,
    IReadOnlyList<PendingStationEvent> PendingEvents,
    OfflinePinState OfflinePin);

public enum StationMode
{
    SignedOut,
    Operation,
    PlantManager,
}
