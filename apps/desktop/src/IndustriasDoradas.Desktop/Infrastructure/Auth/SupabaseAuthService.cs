using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain;

namespace IndustriasDoradas.Desktop.Infrastructure.Auth;

public sealed class SupabaseAuthService(HttpClient httpClient, TimeProvider timeProvider) : ISupabaseAuthService
{
    public async Task<AuthTokens> SignInAsync(string email, string password, CancellationToken cancellationToken = default)
    {
        using HttpResponseMessage response = await httpClient.PostAsJsonAsync(
            "auth/v1/token?grant_type=password",
            new { email, password },
            cancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();
        AuthResponse body = await response.Content.ReadFromJsonAsync<AuthResponse>(cancellationToken).ConfigureAwait(false)
            ?? throw new InvalidOperationException("Supabase Auth returned an empty response.");
        return ToTokens(body);
    }

    public async Task<AuthTokens> RefreshSessionAsync(
        string refreshToken,
        CancellationToken cancellationToken = default)
    {
        using HttpResponseMessage response = await httpClient.PostAsJsonAsync(
            "auth/v1/token?grant_type=refresh_token",
            new { refresh_token = refreshToken },
            cancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();
        AuthResponse body = await response.Content.ReadFromJsonAsync<AuthResponse>(cancellationToken).ConfigureAwait(false)
            ?? throw new InvalidOperationException("Supabase Auth returned an empty refresh response.");
        return ToTokens(body);
    }

    public async Task RequestPasswordRecoveryAsync(string email, CancellationToken cancellationToken = default)
    {
        using HttpResponseMessage response = await httpClient.PostAsJsonAsync(
            "auth/v1/recover", new { email }, cancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();
    }

    private AuthTokens ToTokens(AuthResponse body) =>
        new(body.AccessToken, body.RefreshToken, timeProvider.GetUtcNow().AddSeconds(body.ExpiresIn));

    private sealed record AuthResponse(
        [property: JsonPropertyName("access_token")] string AccessToken,
        [property: JsonPropertyName("refresh_token")] string RefreshToken,
        [property: JsonPropertyName("expires_in")] int ExpiresIn);
}
