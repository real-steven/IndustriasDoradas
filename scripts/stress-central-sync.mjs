import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";

const concurrentClients = positiveInteger("STRESS_CLIENTS", 50);
const cyclesPerClient = positiveInteger("STRESS_CYCLES_PER_CLIENT", 2);
const eventsPerClient = cyclesPerClient * 2;
const expectedEvents = concurrentClients * eventsPerClient;
const firstSequence = 2_000_000;
const organizationId = "30000000-0000-4000-8000-000000000001";
const plantId = "31000000-0000-4000-8000-000000000001";
const stationId = "34000000-0000-4000-8000-000000000001";
const actorProfileId = "a1000000-0000-4000-8000-000000000002";
const workerId = "b1000000-0000-4000-8000-000000000001";
const baseTime = Date.parse("2026-10-20T12:00:00.000Z");
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(scriptDirectory, "..");
const migrationsDirectory = join(repositoryRoot, "supabase", "migrations");
const seedPath = join(repositoryRoot, "supabase", "seed.sql");
const workerFixturePath = join(
  repositoryRoot,
  "supabase",
  "tests",
  "002_worker_lifecycle.sql",
);
const database = await PGlite.create();

try {
  await database.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
  `);
  for (const migration of await readSqlFiles(migrationsDirectory))
    await database.exec(migration.sql);
  await database.exec(await readFile(seedPath, "utf8"));
  await database.exec(await readFile(workerFixturePath, "utf8"));

  const firstInputs = [];
  const latencies = [];
  const startedAt = performance.now();
  const clientResults = await Promise.all(
    Array.from({ length: concurrentClients }, (_, clientIndex) =>
      runClient(clientIndex),
    ),
  );
  const elapsedMilliseconds = performance.now() - startedAt;
  const results = clientResults.flat();
  assertAll(results, "APPLIED", expectedEvents, "carga inicial");

  const replayStartedAt = performance.now();
  const replayResults = await Promise.all(
    firstInputs.map((item) =>
      ingest({
        ...item,
        receiptId: randomUUID(),
        auditEventId: randomUUID(),
        correlationId: randomUUID(),
      }),
    ),
  );
  const replayMilliseconds = performance.now() - replayStartedAt;
  assertAll(
    replayResults,
    "ALREADY_APPLIED",
    concurrentClients,
    "reintentos idempotentes",
  );

  await database.exec("analyze;");
  const counts = (
    await database.query(
      `select
         (select count(*)::integer from app.attendance_events
           where station_id = $1 and client_sequence >= $2
             and client_sequence < $3) as attendance_events,
         (select count(distinct client_sequence)::integer from app.attendance_events
           where station_id = $1 and client_sequence >= $2
             and client_sequence < $3) as distinct_sequences,
         (select count(*)::integer from app.sync_receipts
           where station_id = $1 and station_sequence >= $2
             and station_sequence < $3) as sync_receipts,
         (select count(*)::integer from app.audit_events as audit
           join app.attendance_events as event on event.id = audit.entity_id
          where event.station_id = $1 and event.client_sequence >= $2
            and event.client_sequence < $3) as audit_events,
         (select count(*)::integer from app.sync_changes as change
           join app.attendance_events as event on event.id = change.entity_id
          where event.station_id = $1 and event.client_sequence >= $2
            and event.client_sequence < $3) as sync_changes`,
      [stationId, firstSequence, firstSequence + expectedEvents],
    )
  ).rows[0];
  for (const [name, value] of Object.entries(counts)) {
    if (Number(value) !== expectedEvents)
      throw new Error(
        `${name}: se esperaban ${expectedEvents}, se obtuvieron ${value}.`,
      );
  }

  const readSamples = [];
  let readRows = 0;
  for (let repetition = 0; repetition < 5; repetition += 1) {
    const readStartedAt = performance.now();
    const readResult = await database.query(
      `select id, worker_id, event_type, occurred_at_utc, client_sequence
         from app.attendance_events
        where station_id = $1 and client_sequence >= $2
          and client_sequence < $3
        order by client_sequence`,
      [stationId, firstSequence, firstSequence + expectedEvents],
    );
    readSamples.push(performance.now() - readStartedAt);
    readRows = readResult.rows.length;
  }
  if (readRows !== expectedEvents)
    throw new Error(`Lectura final incompleta: ${readRows}/${expectedEvents}.`);

  latencies.sort((left, right) => left - right);
  readSamples.sort((left, right) => left - right);
  console.log(
    JSON.stringify(
      {
        concurrentClients,
        cyclesPerClient,
        events: expectedEvents,
        applied: results.length,
        idempotentReplays: replayResults.length,
        elapsedMilliseconds: round(elapsedMilliseconds),
        throughputEventsPerSecond: round(
          expectedEvents / (elapsedMilliseconds / 1000),
        ),
        ingestionLatencyMilliseconds: {
          p50: percentile(latencies, 0.5),
          p95: percentile(latencies, 0.95),
          maximum: round(latencies.at(-1) ?? 0),
        },
        replayMilliseconds: round(replayMilliseconds),
        integrityCounts: counts,
        finalRead: {
          rows: readRows,
          medianMilliseconds: percentile(readSamples, 0.5),
          maximumMilliseconds: round(readSamples.at(-1) ?? 0),
        },
        result: "PASS",
        environment:
          "PGlite temporal local; no se usaron credenciales ni datos remotos.",
      },
      null,
      2,
    ),
  );

  async function runClient(clientIndex) {
    const clientResults = [];
    for (let eventIndex = 0; eventIndex < eventsPerClient; eventIndex += 1) {
      const itemIndex = clientIndex * eventsPerClient + eventIndex;
      const sequence = firstSequence + itemIndex;
      const occurredAt = new Date(
        baseTime + clientIndex * 60_000 + eventIndex * 30_000,
      ).toISOString();
      const recordedAt = new Date(Date.parse(occurredAt) + 1000).toISOString();
      const clientEventId = randomUUID();
      const payload = {
        schemaVersion: 1,
        clientEventId,
        organizationId,
        plantId,
        stationId,
        workerId,
        eventType: eventIndex % 2 === 0 ? "CHECK_IN" : "CHECK_OUT",
        clientSequence: sequence,
        occurredAtUtc: occurredAt,
        recordedAtUtc: recordedAt,
        correctedByProfileId: null,
        correctionReason: null,
        relatedEventId: null,
      };
      const item = {
        organizationId,
        plantId,
        stationId,
        correlationId: randomUUID(),
        clientApplication: "desktop-stress",
        clientApplicationVersion: "0.0.0-local",
        clientSentAtUtc: recordedAt,
        processedAtUtc: new Date(Date.parse(recordedAt) + 1000).toISOString(),
        authorization: {
          actorProfileId,
          permissionVersion: 1,
          validatedAtUtc: "2026-10-19T12:00:00.000Z",
          offlineValidUntilUtc: "2026-10-21T12:00:00.000Z",
          stateAtCapture: "VALID",
        },
        operationType: "ATTENDANCE_EVENT_RECORDED",
        aggregateType: "attendance_event",
        aggregateId: clientEventId,
        outboxMessageId: randomUUID(),
        stationSequence: sequence,
        contentHash: createHash("sha256")
          .update(JSON.stringify(payload))
          .digest("hex"),
        receiptId: randomUUID(),
        auditEventId: randomUUID(),
        createdAtUtc: recordedAt,
        payloadSchemaVersion: 1,
        payload,
        precheckCode: null,
      };
      if (eventIndex === 0) firstInputs.push(item);
      const itemStartedAt = performance.now();
      clientResults.push(await ingest(item));
      latencies.push(performance.now() - itemStartedAt);
    }
    return clientResults;
  }
} finally {
  await database.close();
}

async function ingest(item) {
  const response = await database.query(
    "select app.ingest_attendance_sync_item_v1($1::jsonb) as result",
    [JSON.stringify(item)],
  );
  const result = response.rows[0]?.result;
  return typeof result === "string" ? JSON.parse(result) : result;
}

function assertAll(results, status, expectedCount, label) {
  if (results.length !== expectedCount)
    throw new Error(`${label}: ${results.length}/${expectedCount} resultados.`);
  const failures = results.filter((result) => result?.status !== status);
  if (failures.length > 0)
    throw new Error(
      `${label}: ${failures.length} respuestas inesperadas. Ejemplo: ${JSON.stringify(failures[0])}`,
    );
}

async function readSqlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  return Promise.all(
    names.map(async (name) => ({
      name,
      sql: await readFile(join(directory, name), "utf8"),
    })),
  );
}

function positiveInteger(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error(`${name} debe ser un entero positivo.`);
  return value;
}

function percentile(sortedValues, ratio) {
  const index = Math.max(
    0,
    Math.min(
      sortedValues.length - 1,
      Math.ceil(sortedValues.length * ratio) - 1,
    ),
  );
  return round(sortedValues[index] ?? 0);
}

function round(value) {
  return Math.round(value * 100) / 100;
}
