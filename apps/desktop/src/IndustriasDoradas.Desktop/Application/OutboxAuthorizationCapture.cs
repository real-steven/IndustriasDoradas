using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain;

namespace IndustriasDoradas.Desktop.Application;

internal static class OutboxAuthorizationCapture
{
    public static OutboxAuthorizationEvidence From(
        ProtectedStationState state,
        DateTimeOffset occurredAt)
    {
        ArgumentNullException.ThrowIfNull(state);
        return new OutboxAuthorizationEvidence(
            state.Session.ProfileId,
            state.Authorization.PermissionVersion,
            state.Authorization.ValidatedAt,
            state.Authorization.OfflineValidUntil,
            occurredAt < state.Authorization.OfflineValidUntil
                ? "VALID"
                : "EXPIRED_CONTINGENCY");
    }
}
