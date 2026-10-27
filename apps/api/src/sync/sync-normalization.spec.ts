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

  it("accepts an exact sweep and rejects duplicate event references", () => {
    const item = productionSweep();
    expect(normalizeSyncItem(item, scope).precheckCode).toBeNull();
    item.payload.eventIds = [
      "45000000-0000-4000-8000-000000000001",
      "45000000-0000-4000-8000-000000000001",
    ];
    expect(normalizeSyncItem(item, scope).precheckCode).toBe("INVALID_EVENT");
  });

  it("accepts optional two-decimal mercury and rejects legacy reloads", () => {
    const item = mercuryMovement();
    expect(normalizeSyncItem(item, scope).precheckCode).toBeNull();
    item.payload.amountGrams = 10.123;
    expect(normalizeSyncItem(item, scope).precheckCode).toBe("INVALID_EVENT");
    item.payload.amountGrams = 10.12;
    item.payload.movementKind = "RELOAD";
    expect(normalizeSyncItem(item, scope).precheckCode).toBe("INVALID_EVENT");
  });

  it("accepts attendance with its original time after 24 hours offline", () => {
    const item = attendanceEvent();
    expect(normalizeSyncItem(item, scope).precheckCode).toBeNull();
  });

  it("validates attendance correction authorship and station sequence", () => {
    const item = attendanceEvent();
    Object.assign(item.payload, {
      eventType: "ADJUSTED_CHECK_OUT",
      correctedByProfileId: item.authorization.actorProfileId,
      correctionReason: "Salida olvidada confirmada por el jefe de planta.",
      relatedEventId: "49000000-0000-4000-8000-000000000002",
    });
    expect(normalizeSyncItem(item, scope).precheckCode).toBeNull();

    item.payload.correctedByProfileId = "a1000000-0000-4000-8000-000000000099";
    expect(normalizeSyncItem(item, scope).precheckCode).toBe("INVALID_EVENT");
    item.payload.correctedByProfileId = item.authorization.actorProfileId;
    item.payload.clientSequence = 99;
    expect(normalizeSyncItem(item, scope).precheckCode).toBe("INVALID_EVENT");
  });

  it("keeps inventory schema 1 compatible and accepts an optional sweep in schema 2", () => {
    const legacy = inventoryMovement(1);
    expect(normalizeSyncItem(legacy, scope).precheckCode).toBeNull();

    const linked = inventoryMovement(2);
    linked.payload.linkedSweepId = "47000000-0000-4000-8000-000000000001";
    expect(normalizeSyncItem(linked, scope).precheckCode).toBeNull();

    delete linked.payload.linkedSweepId;
    expect(normalizeSyncItem(linked, scope).precheckCode).toBe("INVALID_EVENT");
  });

  it("accepts a complete component installation and rejects an ambiguous removal", () => {
    const installation = componentChange();
    expect(normalizeSyncItem(installation, scope).precheckCode).toBeNull();

    installation.payload.changeType = "REMOVAL";
    expect(normalizeSyncItem(installation, scope).precheckCode).toBe(
      "INVALID_EVENT",
    );
  });

  it("accepts novelty opening and requires an empty closure payload", () => {
    const opening = operationalNovelty();
    expect(normalizeSyncItem(opening, scope).precheckCode).toBeNull();

    opening.operationType = "OPERATIONAL_NOVELTY_CLOSED";
    expect(normalizeSyncItem(opening, scope).precheckCode).toBe(
      "INVALID_EVENT",
    );
    opening.payload.lineId = null;
    opening.payload.categoryId = null;
    opening.payload.description = null;
    expect(normalizeSyncItem(opening, scope).precheckCode).toBeNull();
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

function productionSweep(): SyncEnvelopeItem {
  return {
    outboxMessageId: "41000000-0000-4000-8000-000000000003",
    stationSequence: 3,
    operationType: "PRODUCTION_SWEEP_RECORDED",
    aggregateType: "production_sweep",
    aggregateId: "47000000-0000-4000-8000-000000000001",
    payloadSchemaVersion: 1,
    createdAtUtc: "2026-09-15T18:05:00.000Z",
    authorization: operationStarted().authorization,
    payload: {
      schemaVersion: 1,
      sweepId: "47000000-0000-4000-8000-000000000001",
      organizationId: scope.organizationId,
      plantId: scope.plantId,
      stationId: scope.stationId,
      lineId: "32000000-0000-4000-8000-000000000001",
      feedCycleId: "43000000-0000-4000-8000-000000000001",
      shipmentId: "42000000-0000-4000-8000-000000000001",
      clientSequence: 3,
      cajuelaCount: 1,
      eventIds: ["45000000-0000-4000-8000-000000000001"],
      sweptAtUtc: "2026-09-15T18:05:00.000Z",
      recordedAtUtc: "2026-09-15T18:05:01.000Z",
      recordedByProfileId: operationStarted().authorization.actorProfileId,
      isFinal: false,
      notes: null,
    },
  };
}

function mercuryMovement(): SyncEnvelopeItem {
  return {
    outboxMessageId: "41000000-0000-4000-8000-000000000004",
    stationSequence: 4,
    operationType: "MERCURY_MOVEMENT_RECORDED",
    aggregateType: "mercury_movement",
    aggregateId: "48000000-0000-4000-8000-000000000001",
    payloadSchemaVersion: 1,
    createdAtUtc: "2026-09-15T18:06:00.000Z",
    authorization: operationStarted().authorization,
    payload: {
      schemaVersion: 1,
      movementId: "48000000-0000-4000-8000-000000000001",
      organizationId: scope.organizationId,
      plantId: scope.plantId,
      stationId: scope.stationId,
      lineId: "32000000-0000-4000-8000-000000000001",
      feedCycleId: "43000000-0000-4000-8000-000000000001",
      shipmentId: "42000000-0000-4000-8000-000000000001",
      lineComponentId: "46000000-0000-4000-8000-000000000001",
      sweepId: "47000000-0000-4000-8000-000000000001",
      clientSequence: 4,
      movementKind: "SWEEP_INPUT",
      amountGrams: 400.7,
      unitCode: "g",
      occurredAtUtc: "2026-09-15T18:06:00.000Z",
      recordedAtUtc: "2026-09-15T18:06:01.000Z",
      recordedByProfileId: operationStarted().authorization.actorProfileId,
      supersedesMovementId: null,
      notes: null,
    },
  };
}

function attendanceEvent(): SyncEnvelopeItem {
  return {
    outboxMessageId: "49000000-0000-4000-8000-000000000001",
    stationSequence: 5,
    operationType: "ATTENDANCE_EVENT_RECORDED",
    aggregateType: "attendance_event",
    aggregateId: "49000000-0000-4000-8000-000000000001",
    payloadSchemaVersion: 1,
    createdAtUtc: "2026-09-16T18:00:01.000Z",
    authorization: {
      ...operationStarted().authorization,
      validatedAtUtc: "2026-09-16T17:00:00.000Z",
      offlineValidUntilUtc: "2026-09-17T17:00:00.000Z",
    },
    payload: {
      schemaVersion: 1,
      clientEventId: "49000000-0000-4000-8000-000000000001",
      organizationId: scope.organizationId,
      plantId: scope.plantId,
      stationId: scope.stationId,
      workerId: "b1000000-0000-4000-8000-000000000001",
      eventType: "CHECK_IN",
      clientSequence: 5,
      occurredAtUtc: "2026-09-15T18:00:00.000Z",
      recordedAtUtc: "2026-09-16T18:00:01.000Z",
      correctedByProfileId: null,
      correctionReason: null,
      relatedEventId: null,
    },
  };
}

function inventoryMovement(schemaVersion: 1 | 2): SyncEnvelopeItem {
  const movementId = "4a000000-0000-4000-8000-000000000001";
  return {
    outboxMessageId: "4a000000-0000-4000-8000-000000000002",
    stationSequence: 6,
    operationType: "INVENTORY_MOVEMENT_RECORDED",
    aggregateType: "inventory_movement",
    aggregateId: movementId,
    payloadSchemaVersion: schemaVersion,
    createdAtUtc: "2026-09-15T18:07:01.000Z",
    authorization: operationStarted().authorization,
    payload: {
      schemaVersion,
      clientMovementId: movementId,
      organizationId: scope.organizationId,
      plantId: scope.plantId,
      stationId: scope.stationId,
      clientSequence: 6,
      inventoryItemId: "73000000-0000-4000-8000-000000000001",
      unitId: "72000000-0000-4000-8000-000000000001",
      movementType: "CONSUMPTION",
      quantityDelta: -2,
      actorProfileId: operationStarted().authorization.actorProfileId,
      responsibleWorkerId: null,
      occurredAtUtc: "2026-09-15T18:07:00.000Z",
      recordedAtUtc: "2026-09-15T18:07:01.000Z",
      reason: null,
      destination: null,
      notes: null,
      relatedMovementId: null,
      ...(schemaVersion === 2 ? { linkedSweepId: null } : {}),
    },
  };
}

function componentChange(): SyncEnvelopeItem {
  const id = "4b000000-0000-4000-8000-000000000001";
  return {
    outboxMessageId: "4b000000-0000-4000-8000-000000000002",
    stationSequence: 7,
    operationType: "RASTRA_COMPONENT_CHANGE_RECORDED",
    aggregateType: "rastra_component_change",
    aggregateId: id,
    payloadSchemaVersion: 1,
    createdAtUtc: "2026-09-15T18:08:01.000Z",
    authorization: operationStarted().authorization,
    payload: {
      schemaVersion: 1,
      clientChangeId: id,
      organizationId: scope.organizationId,
      plantId: scope.plantId,
      stationId: scope.stationId,
      clientSequence: 7,
      lineId: "32000000-0000-4000-8000-000000000001",
      rastraId: "33000000-0000-4000-8001-000000000002",
      changeType: "INSTALLATION",
      installationId: "4b000000-0000-4000-8000-000000000003",
      replacedInstallationId: null,
      inventoryItemId: "73000000-0000-4000-8000-000000000001",
      unitId: "72000000-0000-4000-8000-000000000001",
      quantity: 1,
      actorProfileId: operationStarted().authorization.actorProfileId,
      responsibleWorkerId: null,
      occurredAtUtc: "2026-09-15T18:08:00.000Z",
      recordedAtUtc: "2026-09-15T18:08:01.000Z",
      componentIdentifier: null,
      installedCondition: "Nuevo",
      removedCondition: null,
      reason: null,
      installationNotes: null,
      removalNotes: null,
    },
  };
}

function operationalNovelty(): SyncEnvelopeItem {
  const id = "4c000000-0000-4000-8000-000000000001";
  return {
    outboxMessageId: "4c000000-0000-4000-8000-000000000002",
    stationSequence: 8,
    operationType: "OPERATIONAL_NOVELTY_OPENED",
    aggregateType: "operational_novelty_change",
    aggregateId: id,
    payloadSchemaVersion: 1,
    createdAtUtc: "2026-09-15T18:09:01.000Z",
    authorization: operationStarted().authorization,
    payload: {
      schemaVersion: 1,
      clientChangeId: id,
      noveltyId: "4c000000-0000-4000-8000-000000000003",
      organizationId: scope.organizationId,
      plantId: scope.plantId,
      stationId: scope.stationId,
      clientSequence: 8,
      lineId: "32000000-0000-4000-8000-000000000001",
      categoryId: null,
      description: "Paro de prueba",
      actorProfileId: operationStarted().authorization.actorProfileId,
      responsibleWorkerId: null,
      occurredAtUtc: "2026-09-15T18:09:00.000Z",
      recordedAtUtc: "2026-09-15T18:09:01.000Z",
    },
  };
}
