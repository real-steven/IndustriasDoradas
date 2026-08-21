using System.Net;
using System.Text;
using IndustriasDoradas.Desktop.Generated;

namespace IndustriasDoradas.Desktop.Tests.Generated;

[TestClass]
public sealed class GeneratedApiClientTests
{
    [TestMethod]
    public async Task GetSessionAsyncConsumesTypedEndpoint()
    {
        var handler = new StubHandler();
        using var http = new HttpClient(handler) { BaseAddress = new Uri("https://api.example.invalid/") };
        var client = new GeneratedApiClient(http);

        var session = await client.GetSessionAsync("fictitious-token");

        Assert.IsNotNull(session);
        Assert.AreEqual("JEFE_PLANTA", session.Role);
        Assert.AreEqual("Bearer fictitious-token", handler.Authorization);
        Assert.AreEqual("/api/v1/auth/session", handler.Path);
    }

    private sealed class StubHandler : HttpMessageHandler
    {
        public string? Authorization { get; private set; }
        public string? Path { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Authorization = request.Headers.Authorization?.ToString();
            Path = request.RequestUri?.AbsolutePath;
            const string body = """{"userId":"a0000000-0000-4000-8000-000000000001","sessionId":"a0000000-0000-4000-8000-000000000002","profileId":"a1000000-0000-4000-8000-000000000001","organizationId":"30000000-0000-4000-8000-000000000001","role":"JEFE_PLANTA","issuedAt":"2026-08-19T00:00:00Z","expiresAt":"2026-08-19T01:00:00Z"}""";
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(body, Encoding.UTF8, "application/json"),
            });
        }
    }
}
