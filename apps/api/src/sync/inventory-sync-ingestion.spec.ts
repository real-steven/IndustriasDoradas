import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { SyncService } from "./sync.service";
import type {
  SyncEnvelopeItem,
  SyncItemResult,
  SyncRepository,
} from "./sync.contracts";
import type { AuthenticatedContext } from "../auth/auth.contracts";

const organizationId = "30000000-0000-4000-8000-000000000001";
const plantId = "31000000-0000-4000-8000-000000000001";
const firstStationId = "34000000-0000-4000-8000-000000000001";
const secondStationId = "34000000-0000-4000-8000-000000000002";
const actorProfileId = "a1000000-0000-4000-8000-000000000002";
const itemTypeId = "71000000-0000-4000-8000-000000000001";
const unitId = "72000000-0000-4000-8000-000000000001";
const itemId = "73000000-0000-4000-8000-000000000001";
const occurredAtUtc = "2026-09-15T18:00:00.000Z";
const recordedAtUtc = "2026-09-15T18:00:01.000Z";

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
    organizationId,
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
    permissions: ["stations.open", "inventory.manage"],
  },
};

describe("inventory sync ingestion with PostgreSQL", () => {
  let db: PGlite;
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
    await db.query(
      `insert into app.stations(id, organization_id, plant_id, code, name, device_key)
       values ($1, $2, $3, 'ESTACION_2', 'Estación ficticia 2', 'station-demo-2')
       on conflict (id) do nothing`,
      [secondStationId, organizationId, plantId],
    );
    await db.query(
      `insert into app.station_user_authorizations(
         id, organization_id, plant_id, station_id, user_profile_id, authorized_by_profile_id)
       values ($1, $2, $3, $4, $5, $5) on conflict do nothing`,
      [randomUUID(), organizationId, plantId, secondStationId, actorProfileId],
    );
    await db.query(
      `insert into app.inventory_item_types(id, organization_id, code, name)
       values ($1, $2, 'HERRAMIENTA', 'Herramienta')`,
      [itemTypeId, organizationId],
    );
    await db.query(
      `insert into app.inventory_units(id, organization_id, code, name, decimal_places)
       values ($1, $2, 'UNIDAD', 'Unidad', 0)`,
      [unitId, organizationId],
    );
    await db.query(
      `insert into app.inventory_items(
         id, organization_id, plant_id, item_type_id, unit_id, name)
       values ($1, $2, $3, $4, $5, 'Martillo')`,
      [itemId, organizationId, plantId, itemTypeId, unitId],
    );

    const repository: SyncRepository = {
      findPushStationScope: () => Promise.resolve({ permissionVersion: 1 }),
      findActivePullScope: () => Promise.resolve(null),
      listChanges: () => Promise.resolve([]),
      ingestItem: async (input) => {
        const result = await db.query<{ result: SyncItemResult }>(
          "select app.ingest_inventory_sync_item_v1($1::jsonb) as result",
          [
            JSON.stringify({
              organizationId: input.organizationId,
              plantId: input.plantId,
              stationId: input.stationId,
              correlationId: input.correlationId,
              batchId: input.batchId,
              clientApplication: input.clientApplication,
              clientApplicationVersion: input.clientApplicationVersion,
              clientSentAtUtc: input.clientSentAtUtc,
              receiptId: randomUUID(),
              auditEventId: randomUUID(),
              processedAtUtc: input.serverReceivedAtUtc,
              ...input.item,
            }),
          ],
        );
        return result.rows[0]!.result;
      },
    };
    service = new SyncService(repository);
  });

  afterEach(async () => db.exec("rollback;"));
  afterAll(async () => db.close());

  it("keeps the first offline exit and rejects the one that exceeds central stock", async () => {
    const entry = movement(firstStationId, 500, "ENTRY", 10);
    expect((await push(firstStationId, [entry])).results[0]?.status).toBe(
      "APPLIED",
    );

    const firstExit = movement(firstStationId, 900, "EXIT", -6);
    const secondExit = movement(secondStationId, 700, "EXIT", -6);
    const accepted = (await push(firstStationId, [firstExit])).results[0];
    const rejected = (await push(secondStationId, [secondExit])).results[0];

    expect(accepted).toMatchObject({ status: "APPLIED", code: "APPLIED" });
    expect(rejected).toMatchObject({
      status: "FAILED_REVIEW",
      code: "INVENTORY_STOCK_INSUFFICIENT",
    });
    expect((await push(secondStationId, [secondExit])).results[0]).toEqual(
      rejected,
    );
    expect(await balance()).toBe(4);
    expect(
      (
        await db.query<{ count: number }>(
          "select count(*)::int as count from app.inventory_movements",
        )
      ).rows[0]?.count,
    ).toBe(2);
    expect(
      (
        await db.query<{ result_code: string }>(
          "select result_code from app.sync_receipts where aggregate_id = $1",
          [secondExit.aggregateId],
        )
      ).rows[0]?.result_code,
    ).toBe("INVENTORY_STOCK_INSUFFICIENT");
  });

  it("accepts out-of-order station sequences and publishes catalog and kardex", async () => {
    const later = movement(firstStationId, 1002, "ENTRY", 3);
    const earlier = movement(firstStationId, 1001, "ENTRY", 2);

    expect((await push(firstStationId, [later])).results[0]?.status).toBe(
      "APPLIED",
    );
    expect((await push(firstStationId, [earlier])).results[0]?.status).toBe(
      "APPLIED",
    );
    expect(await balance()).toBe(5);
    const changes = await db.query<{ entity_type: string }>(
      `select entity_type from app.sync_changes
       where entity_type like 'INVENTORY_%' order by server_sequence`,
    );
    expect(changes.rows.map((row) => row.entity_type)).toEqual(
      expect.arrayContaining([
        "INVENTORY_ITEM_TYPE",
        "INVENTORY_UNIT",
        "INVENTORY_ITEM",
        "INVENTORY_MOVEMENT",
      ]),
    );
  });

  it("records a physical review atomically and replays its receipt", async () => {
    const reviewId = randomUUID();
    const review: SyncEnvelopeItem = {
      ...movement(firstStationId, 1200, "ENTRY", 1),
      operationType: "INVENTORY_REVIEW_RECORDED",
      aggregateType: "inventory_review",
      aggregateId: reviewId,
      payload: {
        schemaVersion: 1,
        reviewId,
        organizationId,
        plantId,
        stationId: firstStationId,
        clientSequence: 1200,
        status: "WITH_DIFFERENCES",
        reviewedByProfileId: actorProfileId,
        reviewedAtUtc: occurredAtUtc,
        recordedAtUtc,
        notes: "Conteo físico",
        lines: [
          {
            inventoryItemId: itemId,
            unitId,
            expectedQuantity: 0,
            countedQuantity: 1,
            differenceQuantity: 1,
          },
        ],
      },
    };

    const first = (await push(firstStationId, [review])).results[0];
    expect(first).toMatchObject({ status: "APPLIED", code: "APPLIED" });
    expect((await push(firstStationId, [review])).results[0]).toMatchObject({
      status: "ALREADY_APPLIED",
      code: "ALREADY_APPLIED",
      receiptId: first?.receiptId,
    });
    expect(
      (
        await db.query<{ count: number }>(
          "select count(*)::int as count from app.inventory_review_lines",
        )
      ).rows[0]?.count,
    ).toBe(1);
    expect(
      (
        await db.query<{ count: number }>(
          `select count(*)::int as count from app.sync_changes
           where entity_type = 'INVENTORY_REVIEW' and entity_id = $1`,
          [reviewId],
        )
      ).rows[0]?.count,
    ).toBe(1);
  });

  async function push(stationId: string, items: SyncEnvelopeItem[]) {
    return service.push(
      organizationId,
      stationId,
      {
        contractVersion: 1,
        batchId: randomUUID(),
        sentAtUtc: recordedAtUtc,
        client: { application: "desktop", applicationVersion: "0.3.0" },
        scope: { organizationId, plantId, stationId },
        items,
      },
      auth,
      randomUUID(),
    );
  }

  async function balance(): Promise<number> {
    return (
      await db.query<{ balance: number }>(
        "select app.inventory_balance_v1($1, $2, $3)::float as balance",
        [organizationId, plantId, itemId],
      )
    ).rows[0]!.balance;
  }
});

function movement(
  stationId: string,
  sequence: number,
  movementType: "ENTRY" | "EXIT",
  quantityDelta: number,
): SyncEnvelopeItem {
  const id = randomUUID();
  return {
    outboxMessageId: randomUUID(),
    stationSequence: sequence,
    operationType: "INVENTORY_MOVEMENT_RECORDED",
    aggregateType: "inventory_movement",
    aggregateId: id,
    payloadSchemaVersion: 1,
    createdAtUtc: recordedAtUtc,
    authorization: {
      actorProfileId,
      permissionVersion: 1,
      validatedAtUtc: "2026-09-15T17:00:00.000Z",
      offlineValidUntilUtc: "2026-09-16T17:00:00.000Z",
      stateAtCapture: "VALID",
    },
    payload: {
      schemaVersion: 1,
      clientMovementId: id,
      organizationId,
      plantId,
      stationId,
      clientSequence: sequence,
      inventoryItemId: itemId,
      unitId,
      movementType,
      quantityDelta,
      actorProfileId,
      responsibleWorkerId: null,
      occurredAtUtc,
      recordedAtUtc,
      reason: null,
      destination: null,
      notes: null,
      relatedMovementId: null,
    },
  };
}
