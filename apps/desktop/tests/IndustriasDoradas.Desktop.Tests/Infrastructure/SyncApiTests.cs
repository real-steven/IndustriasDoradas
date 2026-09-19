using System.Net;
using System.Text;
using System.Text.Json;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Infrastructure.Sync;

namespace IndustriasDoradas.Desktop.Tests.Infrastructure;

[TestClass]
public sealed class SyncApiTests
{
    private static readonly Guid OrganizationId = Guid.Parse("30000000-0000-4000-8000-000000000001");
    private static readonly Guid PlantId = Guid.Parse("31000000-0000-4000-8000-000000000001");
    private static readonly Guid StationId = Guid.Parse("34000000-0000-4000-8000-000000000001");
    private static readonly Guid MessageId = Guid.Parse("50000000-0000-4000-8000-000000000001");
    private static readonly DateTimeOffset Now = new(2026, 9, 19, 18, 0, 0, TimeSpan.Zero);

    [TestMethod]
    public async Task PushSendsVersionedEnvelopeAndReadsPartialResponse()
    {
        var handler = new DelegateHandler(async request =>
        {
            Assert.AreEqual(
                $"/api/v1/organizations/{OrganizationId:D}/stations/{StationId:D}/sync/push",
                request.RequestUri!.AbsolutePath);
            using JsonDocument json = JsonDocument.Parse(await request.Content!.ReadAsStringAsync());
            Assert.AreEqual(1, json.RootElement.GetProperty("contractVersion").GetInt32());
            Assert.AreEqual(7, json.RootElement.GetProperty("items")[0]
                .GetProperty("stationSequence").GetInt64());
            string response = $$"""
                {"contractVersion":1,"batchId":"{{json.RootElement.GetProperty("batchId").GetGuid():D}}",
                "serverReceivedAtUtc":"2026-09-19T18:00:01Z","serverCompletedAtUtc":"2026-09-19T18:00:02Z",
                "results":[{"outboxMessageId":"{{MessageId:D}}","stationSequence":7,
                "status":"RETRY_LATER","code":"DEPENDENCY_NOT_READY","processedAtUtc":"2026-09-19T18:00:02Z"}]}
                """;
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(response, Encoding.UTF8, "application/json"),
            };
        });
        var api = new SyncApi(new HttpClient(handler) { BaseAddress = new Uri("https://api.example.invalid/") });

        SyncPushResult result = await api.PushAsync(Batch(), "access-token");

        Assert.AreEqual("DEPENDENCY_NOT_READY", result.Results.Single().Code);
    }

    [TestMethod]
    [DataRow(HttpStatusCode.TooManyRequests, true, "RATE_LIMITED")]
    [DataRow(HttpStatusCode.ServiceUnavailable, true, "SERVER_TEMPORARY_FAILURE")]
    [DataRow(HttpStatusCode.BadRequest, false, "HTTP_CLIENT_REJECTION")]
    public async Task PushClassifiesHttpFailure(HttpStatusCode status, bool transient, string code)
    {
        var api = new SyncApi(new HttpClient(new DelegateHandler(
            _ => Task.FromResult(new HttpResponseMessage(status))))
        {
            BaseAddress = new Uri("https://api.example.invalid/"),
        });

        SyncTransportException exception = await Assert.ThrowsExactlyAsync<SyncTransportException>(
            () => api.PushAsync(Batch(), "access-token"));

        Assert.AreEqual(transient, exception.IsTransient);
        Assert.AreEqual(code, exception.Code);
        Assert.AreEqual((int)status, exception.HttpStatus);
    }

    private static SyncPushBatch Batch()
    {
        using JsonDocument payload = JsonDocument.Parse("{\"schemaVersion\":2}");
        return new SyncPushBatch(
            Guid.NewGuid(),
            OrganizationId,
            PlantId,
            StationId,
            Now,
            [new SyncPushItem(
                MessageId,
                7,
                "PRODUCTION_EVENT_CREATED",
                "production_event",
                MessageId,
                2,
                Now,
                new OutboxAuthorizationEvidence(
                    Guid.Parse("a1000000-0000-4000-8000-000000000002"),
                    1,
                    Now.AddHours(-1),
                    Now.AddHours(24),
                    "VALID"),
                payload.RootElement.Clone())]);
    }

    private sealed class DelegateHandler(
        Func<HttpRequestMessage, Task<HttpResponseMessage>> send) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken) => send(request);
    }
}
