using System.Net;
using System.Text;
using IndustriasDoradas.Desktop.Domain;
using IndustriasDoradas.Desktop.Infrastructure.Auth;

namespace IndustriasDoradas.Desktop.Tests.Infrastructure;

[TestClass]
public sealed class SupabaseAuthServiceTests
{
    [TestMethod]
    public async Task RefreshSessionRotatesBothTokensAndUsesConfiguredClock()
    {
        var handler = new RecordingHandler(
            """
            {
              "access_token": "new-access",
              "refresh_token": "new-refresh",
              "expires_in": 3600
            }
            """);
        using var client = new HttpClient(handler) { BaseAddress = new Uri("https://example.supabase.co/") };
        var time = new FixedTimeProvider();
        var service = new SupabaseAuthService(client, time);

        AuthTokens tokens = await service.RefreshSessionAsync("old-refresh");

        Assert.AreEqual("auth/v1/token?grant_type=refresh_token", handler.RequestUri?.PathAndQuery.TrimStart('/'));
        StringAssert.Contains(handler.RequestBody, "\"refresh_token\":\"old-refresh\"");
        Assert.AreEqual("new-access", tokens.AccessToken);
        Assert.AreEqual("new-refresh", tokens.RefreshToken);
        Assert.AreEqual(time.GetUtcNow().AddHours(1), tokens.ExpiresAt);
    }

    private sealed class FixedTimeProvider : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() =>
            new(2026, 9, 8, 12, 0, 0, TimeSpan.Zero);
    }

    private sealed class RecordingHandler(string responseBody) : HttpMessageHandler
    {
        public Uri? RequestUri { get; private set; }
        public string RequestBody { get; private set; } = string.Empty;

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            RequestUri = request.RequestUri;
            RequestBody = request.Content is null
                ? string.Empty
                : await request.Content.ReadAsStringAsync(cancellationToken);
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(responseBody, Encoding.UTF8, "application/json"),
            };
        }
    }
}
