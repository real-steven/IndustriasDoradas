using System.Text.Json.Serialization;

namespace IndustriasDoradas.Desktop.Infrastructure.LocalStorage;

internal sealed record ProductionEventOutboxPayload(
    int SchemaVersion,
    Guid ClientEventId,
    Guid OrganizationId,
    Guid PlantId,
    Guid StationId,
    Guid LineId,
    Guid FeedCycleId,
    Guid ShipmentId,
    Guid ResponsibleWorkerId,
    string EventType,
    string WorkPeriod,
    DateTimeOffset OccurredAtUtc,
    DateTimeOffset RecordedAtUtc,
    long ClientSequence,
    int QuantityDelta);

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(ProductionEventOutboxPayload))]
internal sealed partial class LocalStorageJsonSerializerContext : JsonSerializerContext
{
}
