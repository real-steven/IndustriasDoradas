using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain;

namespace IndustriasDoradas.Desktop.Infrastructure.Station;

public sealed class StationApi(HttpClient httpClient) : IStationApi
{
    public Task<ApiSession> GetSessionAsync(string accessToken, CancellationToken cancellationToken = default) =>
        GetAsync<ApiSession>("api/v1/auth/session", accessToken, cancellationToken);

    public Task<StationAuthorization> GetAuthorizationAsync(Guid organizationId, Guid stationId, string accessToken, CancellationToken cancellationToken = default) =>
        GetAsync<StationAuthorization>($"api/v1/organizations/{organizationId:D}/stations/{stationId:D}/session-snapshot", accessToken, cancellationToken);

    public async Task<PinAttemptResponse> ElevateAsync(Guid organizationId, Guid stationId, string pin, string accessToken, CancellationToken cancellationToken = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, $"api/v1/organizations/{organizationId:D}/stations/{stationId:D}/elevations")
        {
            Content = JsonContent.Create(new { pin }),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        using HttpResponseMessage response = await httpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<PinAttemptResponse>(cancellationToken).ConfigureAwait(false)
            ?? throw new InvalidOperationException("The station API returned an empty response.");
    }

    private async Task<T> GetAsync<T>(string path, string accessToken, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        using HttpResponseMessage response = await httpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<T>(cancellationToken).ConfigureAwait(false)
            ?? throw new InvalidOperationException("The API returned an empty response.");
    }
}
