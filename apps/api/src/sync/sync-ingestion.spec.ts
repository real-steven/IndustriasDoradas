import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { SyncService } from "./sync.service";
import {
  SyncRepositoryError,
  type SyncEnvelopeItem,
  type SyncItemResult,
  type SyncRepository,
} from "./sync.contracts";
import type { AuthenticatedContext } from "../auth/auth.contracts";

const scope = {
  organizationId: "30000000-0000-4000-8000-000000000001",
  plantId: "31000000-0000-4000-8000-000000000001",
  stationId: "34000000-0000-4000-8000-000000000001",
};
const actorProfileId = "a1000000-0000-4000-8000-000000000002";
const workerId = "b1000000-0000-4000-8000-000000000001";
const authorization = {
  actorProfileId,
  permissionVersion: 1,
  validatedAtUtc: "2026-09-15T17:00:00.000Z",
  offlineValidUntilUtc: "2026-09-16T17:00:00.000Z",
  stateAtCapture: "VALID" as const,
};
const auth: AuthenticatedContext = {
  token: {
    subject: "a0000000-0000-4000-8000-000000000002",
    sessionId: randomUUID(),
    email: "plant@example.invalid",
    issuedAt: 1,
    expiresAt: 2,
  },
  profile: {
    id: actorProfileId,
    organizationId: scope.organizationId,
    authUserId: "a0000000-0000-4000-8000-000000000002",
    displayName: "Jefe ficticio",
    preferredLocale: "es",
    accountStatus: "ACTIVE",
    isActive: true,
    role: {
      id: "20000000-0000-4000-8000-000000000003",
      code: "JEFE_PLANTA",
      isActive: true,
    },
    permissions: ["stations.open"],
  },
};

// Servicio y normalizacion reales -> RPC SQL real sobre PostgreSQL efimero.
// El adaptador de prueba sustituye solo el transporte HTTP hacia Supabase.
describe("sync ingestion with PostgreSQL", () => {
  let db: PGlite;
  let repository: SyncRepository;
  let service: SyncService;

  beforeAll(async () => {
    db = await PGlite.create();
    await db.exec(`create role anon nologin; create role authenticated nologin;
      create role service_role nologin bypassrls; create schema auth;
      create table auth.users(id uuid primary key, email text);`);
    const root = resolve(__dirname, "../../../..");
    for (const name of (
      await readdir(resolve(root, "supabase/migrations"))
    ).sort()) {
      if (name.endsWith(".sql"))
        await db.exec(
          await readFile(resolve(root, "supabase/migrations", name), "utf8"),
        );
    }
    await db.exec(await readFile(resolve(root, "supabase/seed.sql"), "utf8"));
    await db.exec(
      await readFile(
        resolve(root, "supabase/tests/002_worker_lifecycle.sql"),
        "utf8",
      ),
    );
  }, 60000);

  beforeEach(async () => {
    await db.exec("begin; set local role service_role;");
    repository = {
      findPushStationScope: () => Promise.resolve({ permissionVersion: 1 }),
      findActivePullScope: () => Promise.resolve(null),
      listChanges: () => Promise.resolve([]),
      ingestItem: async (input) => {
        const result = await db.query<{ result: SyncItemResult }>(
          "select app.ingest_sync_item_v1($1::jsonb) as result",
          [
            JSON.stringify({
              ...scope,
              ...input.item,
              correlationId: input.correlationId,
              batchId: input.batchId,
              clientApplication: input.clientApplication,
              clientApplicationVersion: input.clientApplicationVersion,
              clientSentAtUtc: input.clientSentAtUtc,
              receiptId: randomUUID(),
              auditEventId: randomUUID(),
              processedAtUtc: input.serverReceivedAtUtc,
            }),
          ],
        );
        return result.rows[0]!.result;
      },
    };
    service = new SyncService(repository);
  });
  afterEach(async () => {
    await db.exec("rollback;");
  });
  afterAll(async () => {
    await db?.close();
  });

  const push = (items: SyncEnvelopeItem[]) =>
    service.push(
      scope.organizationId,
      scope.stationId,
      {
        contractVersion: 1,
        batchId: randomUUID(),
        sentAtUtc: new Date().toISOString(),
        client: { application: "desktop", applicationVersion: "0.1.0" },
        scope,
        items,
      },
      auth,
      randomUUID(),
    );

  async function count(
    table: "shipments" | "production_events" | "sync_receipts" | "audit_events",
  ) {
    return (
      await db.query<{ count: number }>(
        `select count(*)::int as count from app.${table}`,
      )
    ).rows[0]!.count;
  }

  it("applies start, cajuela, reversal and completion and replays the same receipts", async () => {
    const { start, added, reversed, completed } = scenario();
    const beforeAudit = await count("audit_events");
    const first = await push([completed, reversed, start, added]);
    expect(first.results.map((r) => r.status)).toEqual(
      Array(4).fill("APPLIED"),
    );
    const replay = await push([start, added, reversed, completed]);
    expect(replay.results.map((r) => r.status)).toEqual(
      Array(4).fill("ALREADY_APPLIED"),
    );
    expect(replay.results.map((r) => r.receiptId)).toEqual(
      first.results.map((r) => r.receiptId),
    );
    expect(await count("production_events")).toBe(2);
    expect(await count("sync_receipts")).toBe(4);
    expect(await count("audit_events")).toBe(beforeAudit + 4);
    expect(
      (
        await db.query<{ total: number }>(
          "select sum(quantity_delta)::int as total from app.production_events",
        )
      ).rows[0]?.total,
    ).toBe(0);
    expect(
      (await db.query<{ status: string }>("select status from app.shipments"))
        .rows[0]?.status,
    ).toBe("COMPLETED");
    const mismatched = {
      ...added,
      payload: { ...added.payload, inputSignalCode: "different" },
    };
    expect((await push([mismatched])).results[0]?.code).toBe(
      "IDEMPOTENCY_CONTENT_MISMATCH",
    );
    expect(await count("production_events")).toBe(2);
  });

  it("does not terminally reject an event whose start has not arrived", async () => {
    const { start, added } = scenario();
    const beforeAudit = await count("audit_events");
    expect((await push([added])).results[0]).toMatchObject({
      status: "RETRY_LATER",
      code: "DEPENDENCY_NOT_READY",
    });
    expect(await count("sync_receipts")).toBe(0);
    expect(await count("audit_events")).toBe(beforeAudit);
    expect((await push([start, added])).results.map((r) => r.status)).toEqual([
      "APPLIED",
      "APPLIED",
    ]);
  });

  it("retries a reversal after its original cajuela arrives", async () => {
    const { start, added, reversed } = scenario();
    await push([start]);
    expect((await push([reversed])).results[0]?.code).toBe(
      "DEPENDENCY_NOT_READY",
    );
    expect(await count("sync_receipts")).toBe(1);
    expect(
      (await push([added, reversed])).results.map((r) => r.status),
    ).toEqual(["APPLIED", "APPLIED"]);
  });

  it("waits for a delayed relief before applying the next worker's production", async () => {
    const { start, added } = scenario();
    const nextWorker = "b1000000-0000-4000-8000-000000000003";
    await db.query("update app.workers set status = 'ACTIVO' where id = $1", [
      nextWorker,
    ]);
    const relief: SyncEnvelopeItem = {
      ...start,
      outboxMessageId: randomUUID(),
      stationSequence: 2,
      operationType: "RESPONSIBLE_RELIEVED",
      createdAtUtc: "2026-09-15T18:00:30.000Z",
      payload: {
        schemaVersion: 1,
        ...scope,
        shipmentId: start.aggregateId,
        feedCycleId: start.payload.feedCycleId,
        lineId: start.payload.lineId,
        actorProfileId,
        permissionVersion: 1,
        responsibilityAssignmentId: randomUUID(),
        previousResponsibleWorkerId: workerId,
        nextResponsibleWorkerId: nextWorker,
        occurredAtUtc: "2026-09-15T18:00:30.000Z",
      },
    };
    added.stationSequence = 3;
    added.payload.responsibleWorkerId = nextWorker;
    await push([start]);
    expect((await push([added])).results[0]?.code).toBe("DEPENDENCY_NOT_READY");
    expect(await count("sync_receipts")).toBe(1);
    expect((await push([relief, added])).results.map((r) => r.status)).toEqual([
      "APPLIED",
      "APPLIED",
    ]);
  });

  it("keeps dependent events retryable after a transient start failure in the same batch", async () => {
    const { start, added } = scenario();
    jest
      .spyOn(repository, "ingestItem")
      .mockRejectedValueOnce(new SyncRepositoryError("HTTP_503"));
    expect((await push([start, added])).results.map((r) => r.code)).toEqual([
      "SERVER_TEMPORARY_FAILURE",
      "DEPENDENCY_NOT_READY",
    ]);
    expect((await push([start, added])).results.map((r) => r.status)).toEqual([
      "APPLIED",
      "APPLIED",
    ]);
  });

  it("durably rejects a dependent event when its start was rejected", async () => {
    const { start, added } = scenario();
    start.payloadSchemaVersion = 99;
    const first = await push([start, added]);
    expect(first.results.map((r) => r.code)).toEqual([
      "UNSUPPORTED_PAYLOAD_SCHEMA",
      "DEPENDENCY_REJECTED",
    ]);
    const replay = await push([added]);
    expect(replay.results[0]).toEqual(first.results[1]);
    expect(await count("production_events")).toBe(0);
    expect(await count("sync_receipts")).toBe(2);
  });

  it("durably rejects a reversal when its original cajuela was rejected", async () => {
    const { start, added, reversed } = scenario();
    added.payload.quantityDelta = -1;
    expect(
      (await push([start, added, reversed])).results.map((r) => r.code),
    ).toEqual(["APPLIED", "INVALID_EVENT", "DEPENDENCY_REJECTED"]);
    expect(await count("production_events")).toBe(0);
  });

  it("reports a station sequence collision without confirming with another message's receipt", async () => {
    const { start, added } = scenario();
    await push([start]);
    const collision = { ...added, stationSequence: start.stationSequence };
    const first = (await push([collision])).results[0];
    expect(first).toMatchObject({
      status: "FAILED_REVIEW",
      code: "STATION_SEQUENCE_CONFLICT",
    });
    expect(first?.receiptId).toBeUndefined();
    expect((await push([collision])).results[0]).toEqual(first);
    expect(await count("sync_receipts")).toBe(1);
    expect(await count("production_events")).toBe(0);
    expect((await push([added])).results[0]?.status).toBe("APPLIED");
  });

  it("rolls back a production sequence collision and records a stable rejection", async () => {
    const { start, added } = scenario();
    await push([start, added]);
    const duplicate = {
      ...added,
      outboxMessageId: randomUUID(),
      aggregateId: randomUUID(),
      stationSequence: 3,
      payload: { ...added.payload, clientEventId: randomUUID() },
    };
    duplicate.aggregateId = duplicate.payload.clientEventId;
    const first = (await push([duplicate])).results[0];
    expect(first).toMatchObject({
      status: "FAILED_REVIEW",
      code: "PRODUCTION_SEQUENCE_CONFLICT",
    });
    expect(first?.receiptId).toBeDefined();
    expect((await push([duplicate])).results[0]).toEqual(first);
    expect(await count("production_events")).toBe(1);
    expect(await count("sync_receipts")).toBe(3);
  });

  it("rolls back a partially inserted shipment before recording a constraint rejection", async () => {
    const first = scenario().start;
    await push([first]);
    const second = scenario().start;
    second.stationSequence = 2;
    second.payload.lineId = "32000000-0000-4000-8000-000000000002";
    second.payload.responsibilityAssignmentId =
      first.payload.responsibilityAssignmentId;
    const result = (await push([second])).results[0];
    expect(result).toMatchObject({
      status: "FAILED_REVIEW",
      code: "DATABASE_CONSTRAINT_VIOLATION",
    });
    expect((await push([second])).results[0]).toEqual(result);
    expect(await count("shipments")).toBe(1);
    expect(await count("sync_receipts")).toBe(2);
    const audit = await db.query<{ result: string; correlation_id: string }>(
      "select result, correlation_id from app.audit_events where entity_id = $1",
      [second.aggregateId],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]?.result).toBe("REJECTED");
    const receipt = await db.query<{ correlation_id: string }>(
      "select correlation_id from app.sync_receipts where id = $1",
      [result!.receiptId],
    );
    expect(receipt.rows[0]?.correlation_id).toBe(audit.rows[0]?.correlation_id);
  });

  it("durably rejects a second active shipment on the same line", async () => {
    const first = scenario().start;
    await push([first]);
    const second = scenario().start;
    second.stationSequence = 2;

    const result = (await push([second])).results[0];
    expect(result).toMatchObject({
      status: "FAILED_REVIEW",
      code: "LINE_OPERATION_CONFLICT",
    });
    expect(result?.receiptId).toBeDefined();
    expect((await push([second])).results[0]).toEqual(result);
    expect(await count("shipments")).toBe(1);
    expect(await count("sync_receipts")).toBe(2);
  });
});

function scenario() {
  const shipmentId = randomUUID();
  const feedCycleId = randomUUID();
  const lineId = "32000000-0000-4000-8000-000000000001";
  const context = { ...scope, shipmentId, feedCycleId, lineId };
  const operational = {
    schemaVersion: 1,
    ...context,
    actorProfileId,
    permissionVersion: 1,
  };
  function item(
    sequence: number,
    operationType: string,
    payload: Record<string, unknown>,
  ): SyncEnvelopeItem {
    const production = operationType === "PRODUCTION_EVENT_CREATED";
    return {
      outboxMessageId: randomUUID(),
      stationSequence: sequence,
      operationType,
      aggregateType: production ? "production_event" : "shipment",
      aggregateId: production ? String(payload.clientEventId) : shipmentId,
      payloadSchemaVersion: production ? 2 : 1,
      createdAtUtc: String(payload.occurredAtUtc),
      authorization,
      payload,
    };
  }
  const start = item(1, "OPERATION_STARTED", {
    ...operational,
    responsibilityAssignmentId: randomUUID(),
    supplierId: "35000000-0000-4000-8000-000000000001",
    responsibleWorkerId: workerId,
    occurredAtUtc: "2026-09-15T18:00:00.000Z",
  });
  const added = item(2, "PRODUCTION_EVENT_CREATED", {
    schemaVersion: 2,
    ...context,
    clientEventId: randomUUID(),
    responsibleWorkerId: workerId,
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
  });
  const reversed = item(3, "PRODUCTION_EVENT_CREATED", {
    ...added.payload,
    clientEventId: randomUUID(),
    clientSequence: 2,
    eventType: "CAJUELA_REVERSED",
    quantityDelta: -1,
    reversesClientEventId: added.aggregateId,
    confirmationId: randomUUID(),
    reasonCode: "IMMEDIATE_INPUT_ERROR",
    preparedAtUtc: "2026-09-15T18:01:59.000Z",
    occurredAtUtc: "2026-09-15T18:02:00.000Z",
    recordedAtUtc: "2026-09-15T18:02:01.000Z",
  });
  const completed = item(4, "OPERATION_COMPLETED", {
    ...operational,
    responsibleWorkerId: workerId,
    occurredAtUtc: "2026-09-15T18:03:00.000Z",
  });
  return { start, added, reversed, completed };
}
