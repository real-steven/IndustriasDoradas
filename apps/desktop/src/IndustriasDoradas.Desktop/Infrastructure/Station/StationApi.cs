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

    public async Task<LocalOperationCatalogSnapshot> GetOperationCatalogAsync(
        Guid organizationId,
        Guid plantId,
        string accessToken,
        CancellationToken cancellationToken = default)
    {
        IReadOnlyList<CatalogApiItem> suppliers = await ListAllAsync<CatalogApiItem>(
            $"api/v1/organizations/{organizationId:D}/suppliers?state=all",
            accessToken,
            cancellationToken).ConfigureAwait(false);
        IReadOnlyList<CatalogApiItem> lines = await ListAllAsync<CatalogApiItem>(
            $"api/v1/organizations/{organizationId:D}/plants/{plantId:D}/lines?state=all",
            accessToken,
            cancellationToken).ConfigureAwait(false);
        IReadOnlyList<WorkerApiItem> workers = await ListAllAsync<WorkerApiItem>(
            $"api/v1/organizations/{organizationId:D}/workers?state=all&plantId={plantId:D}",
            accessToken,
            cancellationToken).ConfigureAwait(false);

        return new LocalOperationCatalogSnapshot(
            suppliers.Select(item => new CachedSupplier(
                item.Id, item.OrganizationId, item.Name, item.IsActive, item.UpdatedAt)).ToArray(),
            workers.Select(item => new CachedWorker(
                item.Id, item.OrganizationId, item.Name, item.IsActive, item.StatusChangedAt)).ToArray(),
            lines.Select(item => new CachedProductionLine(
                item.Id,
                item.OrganizationId,
                item.PlantId ?? throw new InvalidOperationException("La línea no indicó su planta."),
                item.Name,
                item.IsActive,
                item.UpdatedAt)).ToArray());
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

    private async Task<IReadOnlyList<T>> ListAllAsync<T>(
        string path,
        string accessToken,
        CancellationToken cancellationToken)
    {
        var items = new List<T>();
        for (int page = 1; ; page++)
        {
            string separator = path.Contains('?') ? "&" : "?";
            PageResponse<T> response = await GetAsync<PageResponse<T>>(
                $"{path}{separator}page={page}&pageSize=100",
                accessToken,
                cancellationToken).ConfigureAwait(false);
            items.AddRange(response.Items);
            if (page >= response.TotalPages)
            {
                return items;
            }
        }
    }

    private sealed record PageResponse<T>(IReadOnlyList<T> Items, int Page, int PageSize, int Total, int TotalPages);
    private sealed record CatalogApiItem(
        Guid Id,
        Guid OrganizationId,
        string Name,
        bool IsActive,
        Guid? PlantId,
        DateTimeOffset UpdatedAt);
    private sealed record WorkerApiItem(
        Guid Id,
        Guid OrganizationId,
        string Name,
        bool IsActive,
        DateTimeOffset StatusChangedAt);
}
