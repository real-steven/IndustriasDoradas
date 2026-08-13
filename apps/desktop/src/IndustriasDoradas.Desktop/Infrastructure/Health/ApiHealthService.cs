using System.Net.Http.Json;
using System.Net.Http;
using System.Text.Json;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain;

namespace IndustriasDoradas.Desktop.Infrastructure.Health;

public sealed class ApiHealthService(HttpClient httpClient) : IHealthService
{
    public async Task<SystemHealth> CheckAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            using HttpResponseMessage response = await httpClient.GetAsync(
                "api/v1/health",
                cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                return SystemHealth.Unavailable(
                    $"La API respondió con el estado HTTP {(int)response.StatusCode}.");
            }

            HealthResponse? health = await response.Content.ReadFromJsonAsync<HealthResponse>(
                cancellationToken);

            if (health is null
                || !string.Equals(health.Status, "ok", StringComparison.Ordinal)
                || string.IsNullOrWhiteSpace(health.Service))
            {
                return SystemHealth.Unavailable(
                    "La API respondió con un formato de health inválido.");
            }

            return SystemHealth.Available(health.Service, health.Timestamp);
        }
        catch (HttpRequestException)
        {
            return SystemHealth.Unavailable(
                "No fue posible establecer conexión con la API.");
        }
        catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return SystemHealth.Unavailable(
                "La API no respondió dentro del tiempo configurado.");
        }
        catch (JsonException)
        {
            return SystemHealth.Unavailable(
                "La API devolvió una respuesta que no se pudo interpretar.");
        }
    }

    private sealed record HealthResponse(
        string Status,
        string Service,
        DateTimeOffset Timestamp);
}
