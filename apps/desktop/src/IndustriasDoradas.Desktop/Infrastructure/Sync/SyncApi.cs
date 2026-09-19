using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using IndustriasDoradas.Desktop.Application.Abstractions;

namespace IndustriasDoradas.Desktop.Infrastructure.Sync;

public sealed class SyncApi(HttpClient httpClient) : ISyncApi
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<SyncPushResult> PushAsync(
        SyncPushBatch batch,
        string accessToken,
        CancellationToken cancellationToken = default)
    {
        var body = new
        {
            contractVersion = 1,
            batchId = batch.BatchId,
            sentAtUtc = batch.SentAtUtc,
            client = new { application = "desktop", applicationVersion = "0.1.0" },
            scope = new
            {
                organizationId = batch.OrganizationId,
                plantId = batch.PlantId,
                stationId = batch.StationId,
            },
            items = batch.Items.Select(item => new
            {
                outboxMessageId = item.OutboxMessageId,
                stationSequence = item.StationSequence,
                operationType = item.OperationType,
                aggregateType = item.AggregateType,
                aggregateId = item.AggregateId,
                payloadSchemaVersion = item.PayloadSchemaVersion,
                createdAtUtc = item.CreatedAtUtc,
                authorization = new
                {
                    actorProfileId = item.Authorization.ActorProfileId,
                    permissionVersion = item.Authorization.PermissionVersion,
                    validatedAtUtc = item.Authorization.ValidatedAt,
                    offlineValidUntilUtc = item.Authorization.OfflineValidUntil,
                    stateAtCapture = item.Authorization.StateAtCapture,
                },
                payload = item.Payload,
            }),
        };
        using var request = new HttpRequestMessage(HttpMethod.Post,
            $"api/v1/organizations/{batch.OrganizationId:D}/stations/{batch.StationId:D}/sync/push")
        {
            Content = JsonContent.Create(body, options: JsonOptions),
        };
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
            if (!response.IsSuccessStatusCode)
                throw Failure(response.StatusCode);
            SyncPushResult? result;
            try
            {
                result = await response.Content
                    .ReadFromJsonAsync<SyncPushResult>(JsonOptions, cancellationToken)
                    .ConfigureAwait(false);
            }
            catch (JsonException exception)
            {
                throw new SyncTransportException("INVALID_SERVER_RESPONSE", true, innerException: exception);
            }
            if (result is null || result.BatchId != batch.BatchId || result.ContractVersion != 1)
                throw new SyncTransportException("INVALID_SERVER_RESPONSE", true);
            return result;
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
