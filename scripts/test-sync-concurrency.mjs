import { randomUUID } from "node:crypto";

const supabaseUrl = requiredEnvironment("SUPABASE_URL").replace(/\/$/u, "");
const secret = requiredEnvironment("SUPABASE_SECRET_KEY");
const restUrl = `${supabaseUrl}/rest/v1`;
const headers = {
  Accept: "application/json",
  "Accept-Profile": "app",
  apikey: secret,
  Authorization: `Bearer ${secret}`,
  "Content-Profile": "app",
  "Content-Type": "application/json",
};

const authorizations = await request(
  "station_user_authorizations?select=organization_id,plant_id,station_id,user_profile_id&is_active=eq.true&limit=1",
);
const scope = authorizations[0];
if (scope === undefined) {
  throw new Error(
    "No active station authorization exists for the concurrency test",
  );
}

const [lineScopes, suppliers, workers, stations, activeShipments] =
  await Promise.all([
    request(
      `station_line_scopes?select=production_line_id&organization_id=eq.${scope.organization_id}&plant_id=eq.${scope.plant_id}&station_id=eq.${scope.station_id}&is_active=eq.true&order=production_line_id.asc`,
    ),
    request(
      `suppliers?select=id&organization_id=eq.${scope.organization_id}&is_active=eq.true&limit=1`,
    ),
    request(
      `workers?select=id&organization_id=eq.${scope.organization_id}&plant_id=eq.${scope.plant_id}&is_active=eq.true&limit=1`,
    ),
    request(
      `stations?select=permission_version&id=eq.${scope.station_id}&is_active=eq.true&limit=1`,
    ),
    request(
      `shipments?select=production_line_id&organization_id=eq.${scope.organization_id}&plant_id=eq.${scope.plant_id}&status=eq.ACTIVE`,
    ),
  ]);
const occupiedLineIds = new Set(
  activeShipments.map((shipment) => shipment.production_line_id),
);
const lineScope = lineScopes.find(
  (candidate) => !occupiedLineIds.has(candidate.production_line_id),
);
if (lineScope === undefined) {
  throw new Error(
    "No free authorized production line exists for the concurrency test; close a test shipment and retry",
  );
}
const supplier = requiredRow(suppliers, "active supplier");
const worker = requiredRow(workers, "active worker");
const station = requiredRow(stations, "active station");

const outboxMessageId = randomUUID();
const shipmentId = randomUUID();
const feedCycleId = randomUUID();
const responsibilityAssignmentId = randomUUID();
const now = new Date();
const common = {
  organizationId: scope.organization_id,
  plantId: scope.plant_id,
  stationId: scope.station_id,
  outboxMessageId,
  stationSequence: 9_000_000_000 + Math.floor(Math.random() * 999_999_999),
  contentHash: "c".repeat(64),
  operationType: "OPERATION_STARTED",
  aggregateType: "shipment",
  aggregateId: shipmentId,
  payloadSchemaVersion: 1,
  createdAtUtc: now.toISOString(),
  authorization: {
    actorProfileId: scope.user_profile_id,
    permissionVersion: station.permission_version,
    validatedAtUtc: new Date(now.getTime() - 60_000).toISOString(),
    offlineValidUntilUtc: new Date(now.getTime() + 86_400_000).toISOString(),
    stateAtCapture: "VALID",
  },
  payload: {
    schemaVersion: 1,
    shipmentId,
    feedCycleId,
    responsibilityAssignmentId,
    organizationId: scope.organization_id,
    plantId: scope.plant_id,
    stationId: scope.station_id,
    lineId: lineScope.production_line_id,
    supplierId: supplier.id,
    responsibleWorkerId: worker.id,
    actorProfileId: scope.user_profile_id,
    permissionVersion: station.permission_version,
    occurredAtUtc: now.toISOString(),
  },
  precheckCode: null,
};
const left = attempt(common);
const right = attempt(common);
let testSucceeded = false;
let primaryError;
try {
  const [leftResult, rightResult] = await Promise.all([
    rpc("ingest_sync_item_v1", left),
    rpc("ingest_sync_item_v1", right),
  ]);
  if (
    leftResult.receiptId !== rightResult.receiptId ||
    [leftResult.status, rightResult.status].sort().join(",") !==
      "ALREADY_APPLIED,APPLIED"
  ) {
    throw new Error(
      `Concurrent responses were not stable: ${JSON.stringify([leftResult, rightResult])}`,
    );
  }

  const receipts = await request(
    `sync_receipts?select=id,correlation_id&outbox_message_id=eq.${outboxMessageId}`,
  );
  const auditEvents = await request(
    `audit_events?select=id,correlation_id&entity_id=eq.${shipmentId}&action=eq.sync.ingest`,
  );
  const shipments = await request(`shipments?select=id&id=eq.${shipmentId}`);
  const assignments = await request(
    `responsibility_assignments?select=id&id=eq.${responsibilityAssignmentId}`,
  );
  if (
    receipts.length !== 1 ||
    auditEvents.length !== 1 ||
    shipments.length !== 1 ||
    assignments.length !== 1
  ) {
    throw new Error(
      "Expected one shipment, assignment, receipt and audit event after the race",
    );
  }
  if (receipts[0].correlation_id !== auditEvents[0].correlation_id) {
    throw new Error("Receipt and audit event lost their shared correlation ID");
  }

  testSucceeded = true;
  console.log(
    JSON.stringify(
      {
        outcome: "concurrency-safe",
        productionLineId: lineScope.production_line_id,
        outboxMessageId,
        receiptId: leftResult.receiptId,
        responseStatuses: [leftResult.status, rightResult.status],
        shipments: shipments.length,
        responsibilityAssignments: assignments.length,
        receipts: receipts.length,
        auditEvents: auditEvents.length,
        correlationId: receipts[0].correlation_id,
      },
      null,
      2,
    ),
  );
} catch (error) {
  primaryError = error;
  throw error;
} finally {
  try {
    await completeTestShipmentIfActive(common);
  } catch (cleanupError) {
    if (primaryError !== undefined) {
      console.error("Concurrency test cleanup also failed:", cleanupError);
    } else {
      throw cleanupError;
    }
  }
}

if (!testSucceeded) process.exitCode = 1;

function attempt(base) {
  return {
    ...base,
    correlationId: randomUUID(),
    receiptId: randomUUID(),
    auditEventId: randomUUID(),
    processedAtUtc: new Date().toISOString(),
  };
}

async function rpc(name, inputItem) {
  return request(`rpc/${name}`, {
    method: "POST",
    body: JSON.stringify({ input_item: inputItem }),
  });
}

async function completeTestShipmentIfActive(startItem) {
  const active = await request(
    `shipments?select=id&id=eq.${shipmentId}&status=eq.ACTIVE`,
  );
  if (active.length === 0) return;

  const completedAt = new Date(Math.max(Date.now(), now.getTime() + 1_000));
  const completion = attempt({
    ...startItem,
    outboxMessageId: randomUUID(),
    stationSequence: startItem.stationSequence + 1,
    contentHash: "d".repeat(64),
    operationType: "OPERATION_COMPLETED",
    createdAtUtc: completedAt.toISOString(),
    payload: {
      schemaVersion: 1,
      shipmentId,
      feedCycleId,
      organizationId: scope.organization_id,
      plantId: scope.plant_id,
      stationId: scope.station_id,
      lineId: lineScope.production_line_id,
      responsibleWorkerId: worker.id,
      actorProfileId: scope.user_profile_id,
      permissionVersion: station.permission_version,
      occurredAtUtc: completedAt.toISOString(),
    },
  });
  const result = await rpc("ingest_sync_item_v1", completion);
  if (!["APPLIED", "ALREADY_APPLIED"].includes(result.status)) {
    throw new Error(
      `Could not complete concurrency test shipment: ${JSON.stringify(result)}`,
    );
  }
}

async function request(path, init = {}) {
  const response = await fetch(`${restUrl}/${path}`, {
    ...init,
    headers: { ...headers, ...init.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = typeof body.code === "string" ? body.code : "UNKNOWN";
    throw new Error(
      `Supabase request failed with HTTP ${response.status} (${code})`,
    );
  }
  return body;
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

function requiredRow(rows, description) {
  const row = rows[0];
  if (row === undefined) throw new Error(`No ${description} exists`);
  return row;
}
