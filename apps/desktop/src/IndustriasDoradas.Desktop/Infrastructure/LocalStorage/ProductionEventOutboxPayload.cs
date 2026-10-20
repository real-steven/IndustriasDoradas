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
    int QuantityDelta,
    string InputSourceKind,
    string InputControllerId,
    string InputSignalCode,
    int InputLineSlot,
    bool InputWasRepeat);

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
    DateTimeOffset PreparedAtUtc,
    string InputSourceKind,
    string InputControllerId,
    string InputSignalCode,
    int InputLineSlot,
    bool InputWasRepeat);

internal sealed record ProductionSweepOutboxPayload(
    int SchemaVersion,
    Guid SweepId,
    Guid OrganizationId,
    Guid PlantId,
    Guid StationId,
    Guid LineId,
    Guid FeedCycleId,
    Guid ShipmentId,
    long ClientSequence,
    int CajuelaCount,
    IReadOnlyList<Guid> EventIds,
    DateTimeOffset SweptAtUtc,
    DateTimeOffset RecordedAtUtc,
    Guid RecordedByProfileId,
    bool IsFinal,
    string? Notes);

internal sealed record MercuryMovementOutboxPayload(
    int SchemaVersion,
    Guid MovementId,
    Guid OrganizationId,
    Guid PlantId,
    Guid StationId,
    Guid LineId,
    Guid FeedCycleId,
    Guid ShipmentId,
    Guid LineComponentId,
    Guid? SweepId,
    long ClientSequence,
    string MovementKind,
    decimal? AmountGrams,
    string UnitCode,
    DateTimeOffset OccurredAtUtc,
    DateTimeOffset RecordedAtUtc,
    Guid RecordedByProfileId,
    Guid? SupersedesMovementId,
    string? Notes);

internal sealed record AttendanceEventOutboxPayload(
    int SchemaVersion,
    Guid ClientEventId,
    Guid OrganizationId,
    Guid PlantId,
    Guid StationId,
    Guid WorkerId,
    string EventType,
    long ClientSequence,
    DateTimeOffset OccurredAtUtc,
    DateTimeOffset RecordedAtUtc,
    Guid? CorrectedByProfileId,
    string? CorrectionReason,
    Guid? RelatedEventId);

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(ProductionEventOutboxPayload))]
[JsonSerializable(typeof(ProductionEventReversalOutboxPayload))]
[JsonSerializable(typeof(ProductionSweepOutboxPayload))]
[JsonSerializable(typeof(MercuryMovementOutboxPayload))]
[JsonSerializable(typeof(AttendanceEventOutboxPayload))]
internal sealed partial class LocalStorageJsonSerializerContext : JsonSerializerContext
{
}
