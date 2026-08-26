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

internal sealed record ProductionEventReversalOutboxPayload(
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
    int QuantityDelta,
    Guid ReversesClientEventId,
    Guid ConfirmationId,
    string ReasonCode,
    DateTimeOffset PreparedAtUtc);

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(ProductionEventOutboxPayload))]
[JsonSerializable(typeof(ProductionEventReversalOutboxPayload))]
internal sealed partial class LocalStorageJsonSerializerContext : JsonSerializerContext
{
}
