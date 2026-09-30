import { normalizeSyncItem } from "./sync-normalization";
import type { SyncEnvelopeItem } from "./sync.contracts";

const scope = {
  organizationId: "30000000-0000-4000-8000-000000000001",
  plantId: "31000000-0000-4000-8000-000000000001",
  stationId: "34000000-0000-4000-8000-000000000001",
};

describe("normalizeSyncItem", () => {
  it("accepts a cajuela with authorization in the envelope only", () => {
    const item = productionEvent();
    expect(normalizeSyncItem(item, scope).precheckCode).toBeNull();
  });

  it("accepts an immediate reversal without adding authorization to its payload", () => {
    const item = productionEvent();
    Object.assign(item.payload, {
      eventType: "CAJUELA_REVERSED",
      quantityDelta: -1,
      reversesClientEventId: "45000000-0000-4000-8000-000000000002",
      confirmationId: "46000000-0000-4000-8000-000000000001",
      reasonCode: "IMMEDIATE_INPUT_ERROR",
      preparedAtUtc: "2026-09-15T18:00:59.000Z",
    });
    expect(normalizeSyncItem(item, scope).precheckCode).toBeNull();
  });

  it.each([
    ["organizationId", "30000000-0000-4000-8000-000000000099"],
    ["workPeriod", "NIGHT"],
    ["occurredAtUtc", "2026-09-17T18:01:00.000Z"],
    ["actorProfileId", "a1000000-0000-4000-8000-000000000002"],
  ])("still rejects an invalid production field %s", (field, value) => {
    const item = productionEvent();
    item.payload[field] = value;
    expect(normalizeSyncItem(item, scope).precheckCode).toBe("INVALID_EVENT");
  });

  it("produces the same fingerprint for equivalent property ordering", () => {
    const first = operationStarted();
    const second = operationStarted();
    second.payload = Object.fromEntries(
      Object.entries(second.payload).reverse(),
    );

    expect(normalizeSyncItem(first, scope).contentHash).toBe(
      normalizeSyncItem(second, scope).contentHash,
    );
  });

  it("normalizes equivalent timestamps before fingerprinting", () => {
    const first = operationStarted();
    const second = operationStarted();
    second.createdAtUtc = "2026-09-15T12:00:00-06:00";
    second.payload.occurredAtUtc = "2026-09-15T12:00:00-06:00";

    expect(normalizeSyncItem(first, scope).contentHash).toBe(
      normalizeSyncItem(second, scope).contentHash,
    );
  });

  it("classifies an unsupported payload schema per item", () => {
    const item = operationStarted();
    item.payloadSchemaVersion = 99;

    expect(normalizeSyncItem(item, scope).precheckCode).toBe(
      "UNSUPPORTED_PAYLOAD_SCHEMA",
    );
  });

  it("rejects derived production values that disagree with the event", () => {
    const item = productionEvent();
    item.payload.quantityDelta = -1;

    expect(normalizeSyncItem(item, scope).precheckCode).toBe("INVALID_EVENT");
  });
});

function operationStarted(): SyncEnvelopeItem {
  return {
    outboxMessageId: "41000000-0000-4000-8000-000000000001",
    stationSequence: 1,
    operationType: "OPERATION_STARTED",
    aggregateType: "shipment",
    aggregateId: "42000000-0000-4000-8000-000000000001",
    payloadSchemaVersion: 1,
    createdAtUtc: "2026-09-15T18:00:00.000Z",
    authorization: {
      actorProfileId: "a1000000-0000-4000-8000-000000000002",
      permissionVersion: 1,
      validatedAtUtc: "2026-09-15T17:00:00.000Z",
      offlineValidUntilUtc: "2026-09-16T17:00:00.000Z",
      stateAtCapture: "VALID",
    },
    payload: {
      schemaVersion: 1,
      shipmentId: "42000000-0000-4000-8000-000000000001",
      feedCycleId: "43000000-0000-4000-8000-000000000001",
      responsibilityAssignmentId: "44000000-0000-4000-8000-000000000001",
      organizationId: scope.organizationId,
      plantId: scope.plantId,
      stationId: scope.stationId,
      lineId: "32000000-0000-4000-8000-000000000001",
      supplierId: "35000000-0000-4000-8000-000000000001",
      responsibleWorkerId: "b1000000-0000-4000-8000-000000000001",
      actorProfileId: "a1000000-0000-4000-8000-000000000002",
      permissionVersion: 1,
      occurredAtUtc: "2026-09-15T18:00:00.000Z",
    },
  };
}

function productionEvent(): SyncEnvelopeItem {
  return {
    outboxMessageId: "41000000-0000-4000-8000-000000000002",
    stationSequence: 2,
    operationType: "PRODUCTION_EVENT_CREATED",
    aggregateType: "production_event",
    aggregateId: "45000000-0000-4000-8000-000000000001",
    payloadSchemaVersion: 2,
    createdAtUtc: "2026-09-15T18:01:00.000Z",
    authorization: operationStarted().authorization,
    payload: {
      schemaVersion: 2,
      clientEventId: "45000000-0000-4000-8000-000000000001",
      organizationId: scope.organizationId,
      plantId: scope.plantId,
      stationId: scope.stationId,
      lineId: "32000000-0000-4000-8000-000000000001",
      feedCycleId: "43000000-0000-4000-8000-000000000001",
      shipmentId: "42000000-0000-4000-8000-000000000001",
      responsibleWorkerId: "b1000000-0000-4000-8000-000000000001",
      eventType: "CAJUELA_ADDED",
      workPeriod: "DAY",
      occurredAtUtc: "2026-09-15T18:01:00.000Z",
      recordedAtUtc: "2026-09-15T18:01:01.000Z",
      clientSequence: 1,
      quantityDelta: 1,
      inputSourceKind: "CLICK",
      inputControllerId: "shared-pointer",
      inputSignalCode: "RegisterCajuela",
      inputLineSlot: 1,
      inputWasRepeat: false,
    },
  };
}
