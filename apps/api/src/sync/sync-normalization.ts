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
    if (
      item.payloadSchemaVersion !== schema.version ||
      item.aggregateType !== schema.aggregateType
    ) {
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
