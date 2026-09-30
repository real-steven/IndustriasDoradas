using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.IO;
using System.Text.Json;
using IndustriasDoradas.Desktop.Application.Abstractions;

namespace IndustriasDoradas.Desktop.Infrastructure.Sync;

public sealed class SyncPullApi(HttpClient httpClient) : ISyncPullApi
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<SyncPullPage> PullAsync(
        Guid organizationId,
        Guid stationId,
        string? cursor,
        int limit,
        string accessToken,
        CancellationToken cancellationToken = default)
    {
        string path = $"api/v1/organizations/{organizationId:D}/stations/{stationId:D}/sync/changes?limit={limit}";
        if (!string.IsNullOrWhiteSpace(cursor))
            path += $"&cursor={Uri.EscapeDataString(cursor)}";
        using var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        HttpResponseMessage response;
        try
        {
            response = await httpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException exception) when (!cancellationToken.IsCancellationRequested)
        {
            throw new SyncTransportException("REQUEST_TIMEOUT", true, innerException: exception);
        }
        catch (HttpRequestException exception)
        {
            throw new SyncTransportException("NETWORK_UNAVAILABLE", true, innerException: exception);
        }

        using (response)
        {
            if (!response.IsSuccessStatusCode) throw Failure(response.StatusCode);
            SyncPullPage? page;
            try
            {
                page = await response.Content.ReadFromJsonAsync<SyncPullPage>(JsonOptions, cancellationToken)
                    .ConfigureAwait(false);
            }
            catch (JsonException exception)
            {
                throw new SyncTransportException("INVALID_SERVER_RESPONSE", true, innerException: exception);
            }
            if (page is null || page.ContractVersion != 1 || string.IsNullOrWhiteSpace(page.NextCursor) ||
                page.Changes.Count > limit || page.Changes.Zip(page.Changes.Skip(1),
                    (left, right) => left.ServerSequence < right.ServerSequence).Any(ordered => !ordered))
                throw new SyncTransportException("INVALID_SERVER_RESPONSE", true);
            return page;
        }
    }

    public async Task WaitForSignalAsync(
        Guid organizationId,
        Guid stationId,
        string? cursor,
        string accessToken,
        CancellationToken cancellationToken = default)
    {
        string path = $"api/v1/organizations/{organizationId:D}/stations/{stationId:D}/sync/signal";
        if (!string.IsNullOrWhiteSpace(cursor)) path += $"?cursor={Uri.EscapeDataString(cursor)}";
        using var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        try
        {
            using HttpResponseMessage response = await httpClient.SendAsync(
                request, HttpCompletionOption.ResponseHeadersRead, cancellationToken).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode) throw Failure(response.StatusCode);
            await using Stream stream = await response.Content.ReadAsStreamAsync(cancellationToken)
                .ConfigureAwait(false);
            using var reader = new StreamReader(stream);
            while (true)
            {
                string? line = await reader.ReadLineAsync(cancellationToken).ConfigureAwait(false);
                if (line is null) break;
                if (line?.StartsWith("data:", StringComparison.Ordinal) == true) return;
            }
            throw new SyncTransportException("INVALID_SERVER_RESPONSE", true);
        }
        catch (OperationCanceledException exception) when (!cancellationToken.IsCancellationRequested)
        {
            throw new SyncTransportException("REQUEST_TIMEOUT", true, innerException: exception);
        }
        catch (HttpRequestException exception)
        {
            throw new SyncTransportException("NETWORK_UNAVAILABLE", true, innerException: exception);
        }
    }

    private static SyncTransportException Failure(HttpStatusCode statusCode)
    {
        int status = (int)statusCode;
        return statusCode switch
        {
            HttpStatusCode.RequestTimeout => new("REQUEST_TIMEOUT", true, status),
            HttpStatusCode.TooManyRequests => new("RATE_LIMITED", true, status),
            HttpStatusCode.Unauthorized => new("AUTH_REFRESH_REQUIRED", true, status),
            _ when status >= 500 => new("SERVER_TEMPORARY_FAILURE", true, status),
            _ => new("HTTP_CLIENT_REJECTION", false, status),
        };
    }
}
