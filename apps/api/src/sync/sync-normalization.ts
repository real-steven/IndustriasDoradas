import { createHash } from "node:crypto";
import { isUUID } from "class-validator";

import {
  SYNC_OPERATION_TYPES,
  type NormalizedSyncItem,
  type SyncEnvelopeItem,
  type SyncOperationType,
} from "./sync.contracts";

interface NormalizationScope {
  organizationId: string;
  plantId: string;
  stationId: string;
}

interface PayloadResult {
  payload: Record<string, unknown>;
  code: string | null;
}

const OPERATION_SCHEMAS: Readonly<
  Record<SyncOperationType, { aggregateType: string; version: number }>
> = {
  OPERATION_STARTED: { aggregateType: "shipment", version: 1 },
  RESPONSIBLE_RELIEVED: { aggregateType: "shipment", version: 1 },
  OPERATION_COMPLETED: { aggregateType: "shipment", version: 1 },
  PRODUCTION_EVENT_CREATED: {
    aggregateType: "production_event",
    version: 2,
  },
  PRODUCTION_SWEEP_RECORDED: {
    aggregateType: "production_sweep",
    version: 1,
  },
  MERCURY_MOVEMENT_RECORDED: {
    aggregateType: "mercury_movement",
    version: 1,
  },
  ATTENDANCE_EVENT_RECORDED: {
    aggregateType: "attendance_event",
    version: 1,
  },
  INVENTORY_MOVEMENT_RECORDED: {
    aggregateType: "inventory_movement",
    version: 1,
  },
  INVENTORY_REVIEW_RECORDED: {
    aggregateType: "inventory_review",
    version: 1,
  },
};

export function normalizeSyncItem(
  item: SyncEnvelopeItem,
  scope: NormalizationScope,
): NormalizedSyncItem {
  const operationType = SYNC_OPERATION_TYPES.includes(
    item.operationType as SyncOperationType,
  )
    ? (item.operationType as SyncOperationType)
    : null;
  let precheckCode: string | null;
  let normalizedPayload: Record<string, unknown> = canonicalObject(
    item.payload,
  );

  if (operationType === null) {
    precheckCode = "INVALID_EVENT";
  } else {
    const schema = OPERATION_SCHEMAS[operationType];
    const supportedVersion =
      operationType === "INVENTORY_MOVEMENT_RECORDED"
        ? item.payloadSchemaVersion === 1 || item.payloadSchemaVersion === 2
        : item.payloadSchemaVersion === schema.version;
    if (!supportedVersion || item.aggregateType !== schema.aggregateType) {
      precheckCode = "UNSUPPORTED_PAYLOAD_SCHEMA";
    } else {
      const result = normalizePayload(operationType, item, scope);
      normalizedPayload = result.payload;
      precheckCode = result.code;
    }
  }

  const authorization = {
    ...item.authorization,
    validatedAtUtc: normalizeDate(item.authorization.validatedAtUtc),
    offlineValidUntilUtc: normalizeDate(
      item.authorization.offlineValidUntilUtc,
    ),
  };
  const normalized: Omit<NormalizedSyncItem, "contentHash"> = {
    ...item,
    operationType: operationType ?? "PRODUCTION_EVENT_CREATED",
    createdAtUtc: normalizeDate(item.createdAtUtc),
    authorization,
    payload: normalizedPayload,
    precheckCode,
  };
  const contentHash = createHash("sha256")
    .update(
      JSON.stringify(
        canonicalize({
          scope,
          outboxMessageId: normalized.outboxMessageId,
          stationSequence: normalized.stationSequence,
          operationType: item.operationType,
          aggregateType: normalized.aggregateType,
          aggregateId: normalized.aggregateId,
          payloadSchemaVersion: normalized.payloadSchemaVersion,
          createdAtUtc: normalized.createdAtUtc,
          authorization: normalized.authorization,
          payload: normalized.payload,
        }),
      ),
    )
    .digest("hex");

  return { ...normalized, contentHash };
}

function normalizePayload(
  operationType: SyncOperationType,
  item: SyncEnvelopeItem,
  scope: NormalizationScope,
): PayloadResult {
  try {
    const payload = item.payload;
    if (operationType === "PRODUCTION_EVENT_CREATED") {
      return normalizeProductionEvent(payload, item, scope);
    }
    if (operationType === "PRODUCTION_SWEEP_RECORDED") {
      return normalizeProductionSweep(payload, item, scope);
    }
    if (operationType === "MERCURY_MOVEMENT_RECORDED") {
      return normalizeMercuryMovement(payload, item, scope);
    }
    if (operationType === "ATTENDANCE_EVENT_RECORDED") {
      return normalizeAttendanceEvent(payload, item, scope);
    }
    if (operationType === "INVENTORY_MOVEMENT_RECORDED") {
      return normalizeInventoryMovement(payload, item, scope);
    }
    if (operationType === "INVENTORY_REVIEW_RECORDED") {
      return normalizeInventoryReview(payload, item, scope);
    }
    const common = normalizeOperationalCommon(payload, scope, item);
    if (operationType === "OPERATION_STARTED") {
      requireExactKeys(payload, [
        "schemaVersion",
        "shipmentId",
        "feedCycleId",
        "responsibilityAssignmentId",
        "organizationId",
        "plantId",
        "stationId",
        "lineId",
        "supplierId",
        "responsibleWorkerId",
        "actorProfileId",
        "permissionVersion",
        "occurredAtUtc",
      ]);
      const normalized = {
        ...common,
        responsibilityAssignmentId: requireUuid(
          payload,
          "responsibilityAssignmentId",
        ),
        supplierId: requireUuid(payload, "supplierId"),
        responsibleWorkerId: requireUuid(payload, "responsibleWorkerId"),
      };
      requireAggregate(item, normalized.shipmentId);
      return { payload: canonicalObject(normalized), code: null };
    }

    if (operationType === "RESPONSIBLE_RELIEVED") {
      requireExactKeys(payload, [
        "schemaVersion",
        "shipmentId",
        "feedCycleId",
        "responsibilityAssignmentId",
        "previousResponsibleWorkerId",
        "nextResponsibleWorkerId",
        "organizationId",
        "plantId",
        "stationId",
        "lineId",
        "actorProfileId",
        "permissionVersion",
        "occurredAtUtc",
      ]);
      const normalized = {
        ...common,
        responsibilityAssignmentId: requireUuid(
          payload,
          "responsibilityAssignmentId",
        ),
        previousResponsibleWorkerId: requireUuid(
          payload,
          "previousResponsibleWorkerId",
        ),
        nextResponsibleWorkerId: requireUuid(
          payload,
          "nextResponsibleWorkerId",
        ),
      };
      requireAggregate(item, normalized.shipmentId);
      return { payload: canonicalObject(normalized), code: null };
    }

    if (operationType === "OPERATION_COMPLETED") {
      requireExactKeys(payload, [
        "schemaVersion",
        "shipmentId",
        "feedCycleId",
        "organizationId",
        "plantId",
        "stationId",
        "lineId",
        "responsibleWorkerId",
        "actorProfileId",
        "permissionVersion",
        "occurredAtUtc",
      ]);
      const normalized = {
        ...common,
        responsibleWorkerId: requireUuid(payload, "responsibleWorkerId"),
      };
      requireAggregate(item, normalized.shipmentId);
      return { payload: canonicalObject(normalized), code: null };
    }

    throw new Error("unsupported operation type");
  } catch {
    return { payload: canonicalObject(item.payload), code: "INVALID_EVENT" };
  }
}

function normalizeInventoryMovement(
  payload: Record<string, unknown>,
  item: SyncEnvelopeItem,
  scope: NormalizationScope,
): PayloadResult {
  const keys = [
    "schemaVersion",
    "clientMovementId",
    "organizationId",
    "plantId",
    "stationId",
    "clientSequence",
    "inventoryItemId",
    "unitId",
    "movementType",
    "quantityDelta",
    "actorProfileId",
    "responsibleWorkerId",
    "occurredAtUtc",
    "recordedAtUtc",
    "reason",
    "destination",
    "notes",
    "relatedMovementId",
  ];
  if (item.payloadSchemaVersion === 2) keys.push("linkedSweepId");
  requireExactKeys(payload, keys);
  const movementType = requireText(payload, "movementType", 40);
  const quantityDelta = requireQuantity(payload, "quantityDelta", false);
  const occurredAtUtc = requireDate(payload, "occurredAtUtc");
  const recordedAtUtc = requireDate(payload, "recordedAtUtc");
  const normalized = {
    schemaVersion: requirePositiveInteger(payload, "schemaVersion"),
    clientMovementId: requireUuid(payload, "clientMovementId"),
    organizationId: requireUuid(payload, "organizationId"),
    plantId: requireUuid(payload, "plantId"),
    stationId: requireUuid(payload, "stationId"),
    clientSequence: requirePositiveInteger(payload, "clientSequence"),
    inventoryItemId: requireUuid(payload, "inventoryItemId"),
    unitId: requireUuid(payload, "unitId"),
    movementType,
    quantityDelta,
    actorProfileId: requireUuid(payload, "actorProfileId"),
    responsibleWorkerId: requireNullableUuid(payload, "responsibleWorkerId"),
    occurredAtUtc,
    recordedAtUtc,
    reason: requireNullableText(payload, "reason", 500),
    destination: requireNullableText(payload, "destination", 500),
    notes: requireNullableText(payload, "notes", 500),
    relatedMovementId: requireNullableUuid(payload, "relatedMovementId"),
    ...(item.payloadSchemaVersion === 2
      ? { linkedSweepId: requireNullableUuid(payload, "linkedSweepId") }
      : {}),
  };
  const negative = ["EXIT", "CONSUMPTION"].includes(movementType);
  const positive = ["ENTRY", "RETURN"].includes(movementType);
  if (
    normalized.schemaVersion !== item.payloadSchemaVersion ||
    normalized.organizationId !== scope.organizationId ||
    normalized.plantId !== scope.plantId ||
    normalized.stationId !== scope.stationId ||
    normalized.clientSequence !== item.stationSequence ||
    normalized.clientMovementId !== item.aggregateId ||
    normalized.actorProfileId !== item.authorization.actorProfileId ||
    ![
      "ENTRY",
      "EXIT",
      "CONSUMPTION",
      "RETURN",
      "ADJUSTMENT",
      "REVERSAL",
    ].includes(movementType) ||
    (negative && quantityDelta >= 0) ||
    (positive && quantityDelta <= 0) ||
    (movementType === "ENTRY" && normalized.responsibleWorkerId !== null) ||
    ((movementType === "ADJUSTMENT" || movementType === "REVERSAL") &&
      normalized.reason === null) ||
    (movementType === "REVERSAL" && normalized.relatedMovementId === null) ||
    (movementType !== "RETURN" &&
      movementType !== "REVERSAL" &&
      normalized.relatedMovementId !== null) ||
    Date.parse(recordedAtUtc) < Date.parse(occurredAtUtc)
  )
    throw new Error("invalid inventory movement");
  validateAuthorizationWindow(item, occurredAtUtc);
  return { payload: canonicalObject(normalized), code: null };
}

function normalizeInventoryReview(
  payload: Record<string, unknown>,
  item: SyncEnvelopeItem,
  scope: NormalizationScope,
): PayloadResult {
  requireExactKeys(payload, [
    "schemaVersion",
    "reviewId",
    "organizationId",
    "plantId",
    "stationId",
    "clientSequence",
    "status",
    "reviewedByProfileId",
    "reviewedAtUtc",
    "recordedAtUtc",
    "notes",
    "lines",
  ]);
  const reviewedAtUtc = requireDate(payload, "reviewedAtUtc");
  const recordedAtUtc = requireDate(payload, "recordedAtUtc");
  const linesValue = payload.lines;
  if (
    !Array.isArray(linesValue) ||
    linesValue.length === 0 ||
    linesValue.length > 500
  )
    throw new Error("invalid inventory review lines");
  const lines = linesValue.map((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value))
      throw new Error("invalid inventory review line");
    const line = value as Record<string, unknown>;
    requireExactKeys(line, [
      "inventoryItemId",
      "unitId",
      "expectedQuantity",
      "countedQuantity",
      "differenceQuantity",
    ]);
    const expectedQuantity = requireQuantity(line, "expectedQuantity", true);
    const countedQuantity = requireQuantity(line, "countedQuantity", true);
    const differenceQuantity = requireQuantity(
      line,
      "differenceQuantity",
      true,
    );
    if (
      expectedQuantity < 0 ||
      countedQuantity < 0 ||
      differenceQuantity !==
        Math.round((countedQuantity - expectedQuantity) * 1000) / 1000
    )
      throw new Error("invalid inventory review difference");
    return {
      inventoryItemId: requireUuid(line, "inventoryItemId"),
      unitId: requireUuid(line, "unitId"),
      expectedQuantity,
      countedQuantity,
      differenceQuantity,
    };
  });
  const status = requireText(payload, "status", 40);
  const normalized = {
    schemaVersion: requirePositiveInteger(payload, "schemaVersion"),
    reviewId: requireUuid(payload, "reviewId"),
    organizationId: requireUuid(payload, "organizationId"),
    plantId: requireUuid(payload, "plantId"),
    stationId: requireUuid(payload, "stationId"),
    clientSequence: requirePositiveInteger(payload, "clientSequence"),
    status,
    reviewedByProfileId: requireUuid(payload, "reviewedByProfileId"),
    reviewedAtUtc,
    recordedAtUtc,
    notes: requireNullableText(payload, "notes", 500),
    lines,
  };
  const hasDifferences = lines.some((line) => line.differenceQuantity !== 0);
  if (
    normalized.schemaVersion !== 1 ||
    normalized.organizationId !== scope.organizationId ||
    normalized.plantId !== scope.plantId ||
    normalized.stationId !== scope.stationId ||
    normalized.clientSequence !== item.stationSequence ||
    normalized.reviewId !== item.aggregateId ||
    normalized.reviewedByProfileId !== item.authorization.actorProfileId ||
    !["WITHOUT_DIFFERENCES", "WITH_DIFFERENCES"].includes(status) ||
    (status === "WITH_DIFFERENCES") !== hasDifferences ||
    new Set(lines.map((line) => line.inventoryItemId)).size !== lines.length ||
    Date.parse(recordedAtUtc) < Date.parse(reviewedAtUtc)
  )
    throw new Error("invalid inventory review");
  validateAuthorizationWindow(item, reviewedAtUtc);
  return { payload: canonicalObject(normalized), code: null };
}

function normalizeAttendanceEvent(
  payload: Record<string, unknown>,
  item: SyncEnvelopeItem,
  scope: NormalizationScope,
): PayloadResult {
  requireExactKeys(payload, [
    "schemaVersion",
    "clientEventId",
    "organizationId",
    "plantId",
    "stationId",
    "workerId",
    "eventType",
    "clientSequence",
    "occurredAtUtc",
    "recordedAtUtc",
    "correctedByProfileId",
    "correctionReason",
    "relatedEventId",
  ]);
  const eventType = requireText(payload, "eventType", 40);
  const occurredAtUtc = requireDate(payload, "occurredAtUtc");
  const recordedAtUtc = requireDate(payload, "recordedAtUtc");
  const correctedByProfileId = requireNullableUuid(
    payload,
    "correctedByProfileId",
  );
  const correctionReason = requireNullableText(
    payload,
    "correctionReason",
    500,
  );
  const relatedEventId = requireNullableUuid(payload, "relatedEventId");
  const clientEventId = requireUuid(payload, "clientEventId");
  const normalized = {
    schemaVersion: requirePositiveInteger(payload, "schemaVersion"),
    clientEventId,
    organizationId: requireUuid(payload, "organizationId"),
    plantId: requireUuid(payload, "plantId"),
    stationId: requireUuid(payload, "stationId"),
    workerId: requireUuid(payload, "workerId"),
    eventType,
    clientSequence: requirePositiveInteger(payload, "clientSequence"),
    occurredAtUtc,
    recordedAtUtc,
    correctedByProfileId,
    correctionReason,
    relatedEventId,
  };
  const isAdjustment = ["ADJUSTED_CHECK_IN", "ADJUSTED_CHECK_OUT"].includes(
    eventType,
  );
  if (
    normalized.schemaVersion !== 1 ||
    normalized.organizationId !== scope.organizationId ||
    normalized.plantId !== scope.plantId ||
    normalized.stationId !== scope.stationId ||
    normalized.clientEventId !== item.aggregateId ||
    normalized.clientSequence !== item.stationSequence ||
    ![
      "CHECK_IN",
      "CHECK_OUT",
      "ADJUSTED_CHECK_IN",
      "ADJUSTED_CHECK_OUT",
    ].includes(eventType) ||
    Date.parse(recordedAtUtc) < Date.parse(occurredAtUtc) ||
    (isAdjustment &&
      (correctedByProfileId !== item.authorization.actorProfileId ||
        correctionReason === null ||
        relatedEventId === null ||
        relatedEventId === clientEventId)) ||
    (!isAdjustment &&
      (correctedByProfileId !== null ||
        correctionReason !== null ||
        relatedEventId !== null))
  ) {
    throw new Error("invalid attendance event");
  }

  // La marca puede describir una salida olvidada del pasado. La autorización
  // corresponde al momento en que el evento se registró, no a la hora corregida.
  validateAuthorizationWindow(item, recordedAtUtc);
  return { payload: canonicalObject(normalized), code: null };
}

function normalizeProductionSweep(
  payload: Record<string, unknown>,
  item: SyncEnvelopeItem,
  scope: NormalizationScope,
): PayloadResult {
  requireExactKeys(payload, [
    "schemaVersion",
    "sweepId",
    "organizationId",
    "plantId",
    "stationId",
    "lineId",
    "feedCycleId",
    "shipmentId",
    "clientSequence",
    "cajuelaCount",
    "eventIds",
    "sweptAtUtc",
    "recordedAtUtc",
    "recordedByProfileId",
    "isFinal",
    "notes",
  ]);
  const sweptAtUtc = requireDate(payload, "sweptAtUtc");
  const recordedAtUtc = requireDate(payload, "recordedAtUtc");
  const eventIds = requireUuidArray(payload, "eventIds");
  const normalized = {
    schemaVersion: requirePositiveInteger(payload, "schemaVersion"),
    sweepId: requireUuid(payload, "sweepId"),
    organizationId: requireUuid(payload, "organizationId"),
    plantId: requireUuid(payload, "plantId"),
    stationId: requireUuid(payload, "stationId"),
    lineId: requireUuid(payload, "lineId"),
    feedCycleId: requireUuid(payload, "feedCycleId"),
    shipmentId: requireUuid(payload, "shipmentId"),
    clientSequence: requirePositiveInteger(payload, "clientSequence"),
    cajuelaCount: requirePositiveInteger(payload, "cajuelaCount"),
    eventIds,
    sweptAtUtc,
    recordedAtUtc,
    recordedByProfileId: requireUuid(payload, "recordedByProfileId"),
    isFinal: requireBoolean(payload, "isFinal"),
    notes: requireNullableText(payload, "notes", 500),
  };
  if (
    normalized.schemaVersion !== 1 ||
    normalized.organizationId !== scope.organizationId ||
    normalized.plantId !== scope.plantId ||
    normalized.stationId !== scope.stationId ||
    normalized.sweepId !== item.aggregateId ||
    normalized.recordedByProfileId !== item.authorization.actorProfileId ||
    Date.parse(recordedAtUtc) < Date.parse(sweptAtUtc) ||
    eventIds.length === 0 ||
    new Set(eventIds).size !== eventIds.length
  )
    throw new Error("invalid production sweep");
  validateAuthorizationWindow(item, sweptAtUtc);
  return { payload: canonicalObject(normalized), code: null };
}

function normalizeMercuryMovement(
  payload: Record<string, unknown>,
  item: SyncEnvelopeItem,
  scope: NormalizationScope,
): PayloadResult {
  requireExactKeys(payload, [
    "schemaVersion",
    "movementId",
    "organizationId",
    "plantId",
    "stationId",
    "lineId",
    "feedCycleId",
    "shipmentId",
    "lineComponentId",
    "sweepId",
    "clientSequence",
    "movementKind",
    "amountGrams",
    "unitCode",
    "occurredAtUtc",
    "recordedAtUtc",
    "recordedByProfileId",
    "supersedesMovementId",
    "notes",
  ]);
  const kind = requireText(payload, "movementKind", 40);
  const sweepId = requireNullableUuid(payload, "sweepId");
  const amountGrams = requireNullableAmount(payload, "amountGrams");
  const occurredAtUtc = requireDate(payload, "occurredAtUtc");
  const recordedAtUtc = requireDate(payload, "recordedAtUtc");
  const normalized = {
    schemaVersion: requirePositiveInteger(payload, "schemaVersion"),
    movementId: requireUuid(payload, "movementId"),
    organizationId: requireUuid(payload, "organizationId"),
    plantId: requireUuid(payload, "plantId"),
    stationId: requireUuid(payload, "stationId"),
    lineId: requireUuid(payload, "lineId"),
    feedCycleId: requireUuid(payload, "feedCycleId"),
    shipmentId: requireUuid(payload, "shipmentId"),
    lineComponentId: requireUuid(payload, "lineComponentId"),
    sweepId,
    clientSequence: requirePositiveInteger(payload, "clientSequence"),
    movementKind: kind,
    amountGrams,
    unitCode: requireText(payload, "unitCode", 4),
    occurredAtUtc,
    recordedAtUtc,
    recordedByProfileId: requireUuid(payload, "recordedByProfileId"),
    supersedesMovementId: requireNullableUuid(payload, "supersedesMovementId"),
    notes: requireNullableText(payload, "notes", 500),
  };
  if (
    normalized.schemaVersion !== 1 ||
    normalized.organizationId !== scope.organizationId ||
    normalized.plantId !== scope.plantId ||
    normalized.stationId !== scope.stationId ||
    normalized.movementId !== item.aggregateId ||
    normalized.recordedByProfileId !== item.authorization.actorProfileId ||
    normalized.unitCode !== "g" ||
    !["SWEEP_INPUT", "SWEEP_REMAINDER"].includes(kind) ||
    sweepId === null ||
    Date.parse(recordedAtUtc) < Date.parse(occurredAtUtc)
  )
    throw new Error("invalid mercury movement");
  validateAuthorizationWindow(item, occurredAtUtc);
  return { payload: canonicalObject(normalized), code: null };
}

function normalizeOperationalCommon(
  payload: Record<string, unknown>,
  scope: NormalizationScope,
  item: SyncEnvelopeItem,
) {
  const normalized = {
    schemaVersion: requirePositiveInteger(payload, "schemaVersion"),
    shipmentId: requireUuid(payload, "shipmentId"),
    feedCycleId: requireUuid(payload, "feedCycleId"),
    organizationId: requireUuid(payload, "organizationId"),
    plantId: requireUuid(payload, "plantId"),
    stationId: requireUuid(payload, "stationId"),
    lineId: requireUuid(payload, "lineId"),
    actorProfileId: requireUuid(payload, "actorProfileId"),
    permissionVersion: requirePositiveInteger(payload, "permissionVersion"),
    occurredAtUtc: requireDate(payload, "occurredAtUtc"),
  };
  if (
    normalized.schemaVersion !== item.payloadSchemaVersion ||
    normalized.organizationId !== scope.organizationId ||
    normalized.plantId !== scope.plantId ||
    normalized.stationId !== scope.stationId ||
    normalized.actorProfileId !== item.authorization.actorProfileId ||
    normalized.permissionVersion !== item.authorization.permissionVersion
  ) {
    throw new Error("scope mismatch");
  }
  validateAuthorizationWindow(item, normalized.occurredAtUtc);
  return normalized;
}

function normalizeProductionEvent(
  payload: Record<string, unknown>,
  item: SyncEnvelopeItem,
  scope: NormalizationScope,
): PayloadResult {
  const eventType = requireText(payload, "eventType", 40);
  const baseKeys = [
    "schemaVersion",
    "clientEventId",
    "organizationId",
    "plantId",
    "stationId",
    "lineId",
    "feedCycleId",
    "shipmentId",
    "responsibleWorkerId",
    "eventType",
    "workPeriod",
    "occurredAtUtc",
    "recordedAtUtc",
    "clientSequence",
    "quantityDelta",
    "inputSourceKind",
    "inputControllerId",
    "inputSignalCode",
    "inputLineSlot",
    "inputWasRepeat",
  ];
  const reversalKeys = [
    "reversesClientEventId",
    "confirmationId",
    "reasonCode",
    "preparedAtUtc",
  ];
  requireExactKeys(
    payload,
    eventType === "CAJUELA_REVERSED"
      ? [...baseKeys, ...reversalKeys]
      : baseKeys,
  );
  if (eventType !== "CAJUELA_ADDED" && eventType !== "CAJUELA_REVERSED") {
    throw new Error("unsupported event type");
  }

  const occurredAtUtc = requireDate(payload, "occurredAtUtc");
  const recordedAtUtc = requireDate(payload, "recordedAtUtc");
  const clientEventId = requireUuid(payload, "clientEventId");
  const inputLineSlot = requireInteger(payload, "inputLineSlot");
  const normalized: Record<string, unknown> = {
    schemaVersion: requirePositiveInteger(payload, "schemaVersion"),
    clientEventId,
    organizationId: requireUuid(payload, "organizationId"),
    plantId: requireUuid(payload, "plantId"),
    stationId: requireUuid(payload, "stationId"),
    lineId: requireUuid(payload, "lineId"),
    feedCycleId: requireUuid(payload, "feedCycleId"),
    shipmentId: requireUuid(payload, "shipmentId"),
    responsibleWorkerId: requireUuid(payload, "responsibleWorkerId"),
    eventType,
    workPeriod: requireText(payload, "workPeriod", 10),
    occurredAtUtc,
    recordedAtUtc,
    clientSequence: requirePositiveInteger(payload, "clientSequence"),
    quantityDelta: requireInteger(payload, "quantityDelta"),
    inputSourceKind: requireText(payload, "inputSourceKind", 80),
    inputControllerId: requireText(payload, "inputControllerId", 120),
    inputSignalCode: requireText(payload, "inputSignalCode", 120),
    inputLineSlot,
    inputWasRepeat: requireBoolean(payload, "inputWasRepeat"),
  };
  if (
    normalized.schemaVersion !== item.payloadSchemaVersion ||
    normalized.organizationId !== scope.organizationId ||
    normalized.plantId !== scope.plantId ||
    normalized.stationId !== scope.stationId ||
    item.aggregateId !== clientEventId ||
    Date.parse(recordedAtUtc) < Date.parse(occurredAtUtc) ||
    inputLineSlot < 1 ||
    inputLineSlot > 4 ||
    normalized.workPeriod !== workPeriodAt(occurredAtUtc) ||
    normalized.quantityDelta !== (eventType === "CAJUELA_ADDED" ? 1 : -1)
  ) {
    throw new Error("invalid production event");
  }
  validateAuthorizationWindow(item, occurredAtUtc);

  if (eventType === "CAJUELA_REVERSED") {
    const preparedAtUtc = requireDate(payload, "preparedAtUtc");
    if (
      requireText(payload, "reasonCode", 80) !== "IMMEDIATE_INPUT_ERROR" ||
      Date.parse(occurredAtUtc) < Date.parse(preparedAtUtc)
    ) {
      throw new Error("invalid reversal");
    }
    Object.assign(normalized, {
      reversesClientEventId: requireUuid(payload, "reversesClientEventId"),
      confirmationId: requireUuid(payload, "confirmationId"),
      reasonCode: "IMMEDIATE_INPUT_ERROR",
      preparedAtUtc,
    });
  }
  return { payload: canonicalObject(normalized), code: null };
}

function validateAuthorizationWindow(
  item: SyncEnvelopeItem,
  occurredAtUtc: string,
): void {
  if (item.authorization.stateAtCapture !== "VALID") return;
  const occurred = Date.parse(occurredAtUtc);
  if (
    occurred < Date.parse(item.authorization.validatedAtUtc) ||
    occurred > Date.parse(item.authorization.offlineValidUntilUtc)
  ) {
    throw new Error("authorization window mismatch");
  }
}

function requireAggregate(item: SyncEnvelopeItem, aggregateId: string): void {
  if (item.aggregateId !== aggregateId) throw new Error("aggregate mismatch");
}

function requireExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    throw new Error("payload fields mismatch");
  }
}

function requireUuid(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== "string" || !isUUID(field)) {
    throw new Error(`invalid ${key}`);
  }
  return field.toLowerCase();
}

function requireNullableUuid(
  value: Record<string, unknown>,
  key: string,
): string | null {
  return value[key] === null ? null : requireUuid(value, key);
}

function requireUuidArray(
  value: Record<string, unknown>,
  key: string,
): string[] {
  const field = value[key];
  if (!Array.isArray(field)) throw new Error(`invalid ${key}`);
  return field.map((item) => {
    if (typeof item !== "string" || !isUUID(item))
      throw new Error(`invalid ${key}`);
    return item.toLowerCase();
  });
}

function requireNullableAmount(
  value: Record<string, unknown>,
  key: string,
): number | null {
  const field = value[key];
  if (field === null) return null;
  if (
    typeof field !== "number" ||
    !Number.isFinite(field) ||
    field < 0 ||
    Math.round(field * 100) !== field * 100
  )
    throw new Error(`invalid ${key}`);
  return field;
}

function requireQuantity(
  value: Record<string, unknown>,
  key: string,
  allowZero: boolean,
): number {
  const field = value[key];
  if (
    typeof field !== "number" ||
    !Number.isFinite(field) ||
    Math.abs(Math.round(field * 1000) - field * 1000) > 1e-9 ||
    (!allowZero && field === 0)
  )
    throw new Error(`invalid ${key}`);
  return field;
}

function requireNullableText(
  value: Record<string, unknown>,
  key: string,
  maxLength: number,
): string | null {
  const field = value[key];
  if (field === null) return null;
  return requireText(value, key, maxLength);
}

function requireDate(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== "string") throw new Error(`invalid ${key}`);
  return normalizeDate(field);
}

function requireText(
  value: Record<string, unknown>,
  key: string,
  maxLength: number,
): string {
  const field = value[key];
  if (
    typeof field !== "string" ||
    field.trim() === "" ||
    field.length > maxLength
  ) {
    throw new Error(`invalid ${key}`);
  }
  return field;
}

function requireInteger(value: Record<string, unknown>, key: string): number {
  const field = value[key];
  if (typeof field !== "number" || !Number.isSafeInteger(field)) {
    throw new Error(`invalid ${key}`);
  }
  return field;
}

function requirePositiveInteger(
  value: Record<string, unknown>,
  key: string,
): number {
  const field = requireInteger(value, key);
  if (field < 1) throw new Error(`invalid ${key}`);
  return field;
}

function requireBoolean(value: Record<string, unknown>, key: string): boolean {
  const field = value[key];
  if (typeof field !== "boolean") throw new Error(`invalid ${key}`);
  return field;
}

function normalizeDate(value: string): string {
  const milliseconds = Date.parse(value);
  if (Number.isNaN(milliseconds)) throw new Error("invalid timestamp");
  return new Date(milliseconds).toISOString();
}

function workPeriodAt(occurredAtUtc: string): "DAY" | "NIGHT" {
  const utcHour = new Date(occurredAtUtc).getUTCHours();
  const costaRicaHour = (utcHour + 18) % 24;
  return costaRicaHour >= 6 && costaRicaHour < 18 ? "DAY" : "NIGHT";
}

function canonicalObject(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return canonicalize(value) as Record<string, unknown>;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}
