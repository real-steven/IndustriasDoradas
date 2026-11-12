using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using IndustriasDoradas.Desktop.Application.Profile;

namespace IndustriasDoradas.Desktop.Infrastructure.Profile;

/// <summary>Cliente del perfil propio contra la API NestJS (nunca contra Supabase).</summary>
public sealed class ProfileApi(HttpClient httpClient) : IProfileApi
{
    public async Task<RemoteSelfProfile> GetSelfProfileAsync(string accessToken, CancellationToken cancellationToken = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "api/v1/me/profile");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        using HttpResponseMessage response = await httpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();
        SelfProfileResponse body = await response.Content.ReadFromJsonAsync<SelfProfileResponse>(cancellationToken).ConfigureAwait(false)
            ?? throw new HttpRequestException("La API devolvió un perfil vacío.");
        return new RemoteSelfProfile(body.DisplayName, body.Email, body.Phone);
    }

    public async Task<PhoneUpdateResult> UpdatePhoneAsync(
        Guid organizationId,
        Guid stationId,
        string? phone,
        string pin,
        string accessToken,
        CancellationToken cancellationToken = default)
    {
        using var request = new HttpRequestMessage(
            HttpMethod.Put,
            $"api/v1/organizations/{organizationId:D}/stations/{stationId:D}/profile/phone")
        {
            Content = JsonContent.Create(new { phone, pin }),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        using HttpResponseMessage response = await httpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
        if (response.IsSuccessStatusCode)
        {
            PhoneResponse body = await response.Content.ReadFromJsonAsync<PhoneResponse>(cancellationToken).ConfigureAwait(false)
                ?? throw new HttpRequestException("La API devolvió una respuesta vacía.");
            return new PhoneUpdateResult(PhoneUpdateStatus.Saved, body.Phone);
        }

        ErrorResponse? error = null;
        try
        {
            error = await response.Content.ReadFromJsonAsync<ErrorResponse>(cancellationToken).ConfigureAwait(false);
        }
        catch (System.Text.Json.JsonException)
        {
            // Respuesta sin cuerpo JSON: se clasifica solo por estado HTTP.
        }

        return (response.StatusCode, error?.Code) switch
        {
            (HttpStatusCode.BadRequest, "PHONE_INVALID") => new PhoneUpdateResult(PhoneUpdateStatus.InvalidPhone),
            (HttpStatusCode.BadRequest, _) => new PhoneUpdateResult(PhoneUpdateStatus.InvalidPhone),
            (HttpStatusCode.Forbidden, "ELEVATION_REJECTED") => new PhoneUpdateResult(PhoneUpdateStatus.PinRejected),
            (HttpStatusCode.Forbidden, "ELEVATION_BLOCKED" or "ELEVATION_RESET_REQUIRED") =>
                new PhoneUpdateResult(PhoneUpdateStatus.PinBlocked),
            (HttpStatusCode.Unauthorized, _) or (HttpStatusCode.Forbidden, _) =>
                new PhoneUpdateResult(PhoneUpdateStatus.SessionExpired),
            ( >= HttpStatusCode.InternalServerError, _) => new PhoneUpdateResult(PhoneUpdateStatus.ConnectionRequired),
            _ => new PhoneUpdateResult(PhoneUpdateStatus.Failed),
        };
    }

    private sealed record SelfProfileResponse(string DisplayName, string? Email, string? Phone);
    private sealed record PhoneResponse(string? Phone);
    private sealed record ErrorResponse(string? Code);
}
