using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Configuration;
using IndustriasDoradas.Desktop.Domain;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Application.Profile;

/// <summary>Perfil del jefe de planta que se muestra en el avatar.</summary>
public sealed record ProfileSnapshot(
    Guid ProfileId,
    string DisplayName,
    string? Email,
    string? Phone,
    bool IsCurrent);

public interface IProfileContactService
{
    Task<ProfileSnapshot?> LoadAsync(CancellationToken cancellationToken = default);

    Task<PhoneUpdateResult> SavePhoneAsync(string? phoneInput, string pin, CancellationToken cancellationToken = default);
}

/// <summary>
/// Lee el perfil central por la API (con respaldo local de solo lectura sin Internet) y cambia el
/// teléfono únicamente por la API, que exige rol JEFE_PLANTA y vuelve a verificar el PIN.
/// </summary>
public sealed class ProfileContactService(
    IProtectedStationStore store,
    StationCoordinator coordinator,
    IProfileApi api,
    IProfileContactCache cache,
    IOptions<StationOptions> stationOptions) : IProfileContactService
{
    public async Task<ProfileSnapshot?> LoadAsync(CancellationToken cancellationToken = default)
    {
        ProtectedStationState? state = await store.LoadAsync(cancellationToken).ConfigureAwait(false);
        if (state is null || state.IsClosed) return null;
        Guid profileId = state.Session.ProfileId;
        RemoteSelfProfile? cached = cache.Load(profileId);
        string? tokenEmail = EmailFromAccessToken(state.Tokens.AccessToken);

        try
        {
            ProtectedStationState? refreshed = await coordinator
                .MaintainSessionAsync(state, networkAvailable: true, cancellationToken)
                .ConfigureAwait(false);
            if (refreshed is null) return Offline(state, cached, tokenEmail);
            RemoteSelfProfile remote = await api
                .GetSelfProfileAsync(refreshed.Tokens.AccessToken, cancellationToken)
                .ConfigureAwait(false);
            cache.Save(profileId, remote);
            return new ProfileSnapshot(profileId, remote.DisplayName, remote.Email ?? tokenEmail, remote.Phone, true);
        }
        catch (HttpRequestException)
        {
            return Offline(state, cached, tokenEmail);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return Offline(state, cached, tokenEmail);
        }
    }

    public async Task<PhoneUpdateResult> SavePhoneAsync(
        string? phoneInput,
        string pin,
        CancellationToken cancellationToken = default)
    {
        string? phone = null;
        if (!string.IsNullOrWhiteSpace(phoneInput))
        {
            phone = PhoneNumber.Normalize(phoneInput);
            if (phone is null) return new PhoneUpdateResult(PhoneUpdateStatus.InvalidPhone);
        }

        ProtectedStationState? state = await store.LoadAsync(cancellationToken).ConfigureAwait(false);
        if (state is null || state.IsClosed) return new PhoneUpdateResult(PhoneUpdateStatus.SessionExpired);

        try
        {
            ProtectedStationState? refreshed = await coordinator
                .MaintainSessionAsync(state, networkAvailable: true, cancellationToken)
                .ConfigureAwait(false);
            if (refreshed is null) return new PhoneUpdateResult(PhoneUpdateStatus.SessionExpired);
            PhoneUpdateResult result = await api.UpdatePhoneAsync(
                    refreshed.Session.OrganizationId,
                    stationOptions.Value.Id,
                    phone,
                    pin,
                    refreshed.Tokens.AccessToken,
                    cancellationToken)
                .ConfigureAwait(false);
            if (result.Status == PhoneUpdateStatus.Saved)
            {
                RemoteSelfProfile previous = cache.Load(refreshed.Session.ProfileId)
                    ?? new RemoteSelfProfile(refreshed.Session.DisplayName, EmailFromAccessToken(refreshed.Tokens.AccessToken), null);
                cache.Save(refreshed.Session.ProfileId, previous with { Phone = result.Phone });
            }
            return result;
        }
        catch (HttpRequestException exception) when (exception.StatusCode is null or >= HttpStatusCode.InternalServerError)
        {
            return new PhoneUpdateResult(PhoneUpdateStatus.ConnectionRequired);
        }
        catch (HttpRequestException)
        {
            return new PhoneUpdateResult(PhoneUpdateStatus.Failed);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return new PhoneUpdateResult(PhoneUpdateStatus.ConnectionRequired);
        }
    }

    private static ProfileSnapshot Offline(ProtectedStationState state, RemoteSelfProfile? cached, string? tokenEmail) =>
        new(
            state.Session.ProfileId,
            cached?.DisplayName ?? state.Session.DisplayName,
            tokenEmail ?? cached?.Email,
            cached?.Phone,
            false);

    /// <summary>Solo para mostrar: lee el claim email del token ya emitido por Supabase Auth.</summary>
    internal static string? EmailFromAccessToken(string accessToken)
    {
        try
        {
            string[] parts = accessToken.Split('.');
            if (parts.Length != 3) return null;
            string payload = parts[1].Replace('-', '+').Replace('_', '/');
            payload = payload.PadRight(payload.Length + ((4 - (payload.Length % 4)) % 4), '=');
            using JsonDocument document = JsonDocument.Parse(Encoding.UTF8.GetString(Convert.FromBase64String(payload)));
            return document.RootElement.TryGetProperty("email", out JsonElement email) && email.ValueKind == JsonValueKind.String
                ? email.GetString()
                : null;
        }
        catch (Exception exception) when (exception is FormatException or JsonException or ArgumentException)
        {
            return null;
        }
    }
}
