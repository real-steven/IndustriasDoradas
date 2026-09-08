using System.Net;
using System.Net.Http.Headers;
using System.Text;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Infrastructure.Station;

namespace IndustriasDoradas.Desktop.Tests.Infrastructure;

[TestClass]
public sealed class StationApiTests
{
    [TestMethod]
    public async Task OperationCatalogMapsAuthorizedApiPagesForLocalCache()
    {
        var handler = new CatalogHandler();
        var client = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        var api = new StationApi(client);
        Guid organizationId = Guid.Parse("30000000-0000-4000-8000-000000000001");
        Guid plantId = Guid.Parse("31000000-0000-4000-8000-000000000001");

        LocalOperationCatalogSnapshot result = await api.GetOperationCatalogAsync(
            organizationId,
            plantId,
            "access-token");

        Assert.AreEqual("La Esperanza", result.Suppliers.Single().Name);
        Assert.AreEqual("Marta", result.Workers.Single().Name);
        Assert.AreEqual("Línea 1", result.Lines.Single().Name);
        Assert.AreEqual(plantId, result.Lines.Single().PlantId);
        Assert.AreEqual(3, handler.Requests.Count);
        Assert.IsTrue(handler.Requests.All(request => request.Contains("state=all", StringComparison.Ordinal)));
    }

    private sealed class CatalogHandler : HttpMessageHandler
    {
        public List<string> Requests { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            Assert.AreEqual(new AuthenticationHeaderValue("Bearer", "access-token"), request.Headers.Authorization);
            string path = request.RequestUri!.PathAndQuery;
            Requests.Add(path);
            string item = path.Contains("/suppliers", StringComparison.Ordinal)
                ? """{"id":"42000000-0000-4000-8000-000000000001","organizationId":"30000000-0000-4000-8000-000000000001","name":"La Esperanza","isActive":true,"plantId":null,"updatedAt":"2026-08-27T12:00:00Z"}"""
                : path.Contains("/workers", StringComparison.Ordinal)
                    ? """{"id":"45000000-0000-4000-8000-000000000001","organizationId":"30000000-0000-4000-8000-000000000001","name":"Marta","isActive":true,"statusChangedAt":"2026-08-27T12:00:00Z"}"""
                    : """{"id":"43000000-0000-4000-8000-000000000001","organizationId":"30000000-0000-4000-8000-000000000001","name":"Línea 1","isActive":true,"plantId":"31000000-0000-4000-8000-000000000001","updatedAt":"2026-08-27T12:00:00Z"}""";
            string json = $$"""{"items":[{{item}}],"page":1,"pageSize":100,"total":1,"totalPages":1}""";
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(json, Encoding.UTF8, "application/json"),
            });
        }
    }
}
