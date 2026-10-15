import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(scriptDirectory, "..");
const migrationsDirectory = join(repositoryRoot, "supabase", "migrations");
const seedPath = join(repositoryRoot, "supabase", "seed.sql");
const days = positiveInteger("MANAGEMENT_BENCHMARK_DAYS", 365);
const shipmentsPerDay = positiveInteger(
  "MANAGEMENT_BENCHMARK_SHIPMENTS_PER_DAY",
  4,
);
const eventsPerShipment = positiveInteger(
  "MANAGEMENT_BENCHMARK_EVENTS_PER_SHIPMENT",
  25,
);
const organizationId = "30000000-0000-4000-8000-000000000001";

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

  const fixtureStartedAt = performance.now();
  await insertFixture(database, { days, shipmentsPerDay, eventsPerShipment });
  const fixtureMilliseconds = performance.now() - fixtureStartedAt;

  const counts = await database.query(
    `select
       (select count(*)::integer from app.shipments
          where organization_id = $1) as shipments,
       (select count(*)::integer from app.production_events
          where organization_id = $1) as production_events,
       (select count(*)::integer from app.sync_changes
          where organization_id = $1) as sync_changes`,
    [organizationId],
  );
  const measurements = [];
  measurements.push(
    await measure(
      database,
      "freshness-latest-change",
      `select server_sequence, changed_at_utc
         from app.sync_changes
        where organization_id = $1
        order by server_sequence desc
        limit 1`,
      [organizationId],
    ),
  );
  measurements.push(
    await measure(
      database,
      "shipments-first-page",
      `select shipment_id, completed_at_utc, production_line_id, supplier_id,
              cajuela_total, sweep_count, last_activity_at_utc
         from app.management_shipment_facts
        where organization_id = $1 and status = 'COMPLETED'
          and completed_at_utc >= '2025-01-01T00:00:00Z'
          and completed_at_utc < '2026-01-01T00:00:00Z'
        order by completed_at_utc desc, shipment_id asc
        limit 20`,
      [organizationId],
    ),
  );
  const deepOffset = Math.max(days * shipmentsPerDay - 20, 0);
  measurements.push(
    await measure(
      database,
      "shipments-last-page",
      `select shipment_id, completed_at_utc, production_line_id, supplier_id,
              cajuela_total, sweep_count, last_activity_at_utc
         from app.management_shipment_facts
        where organization_id = $1 and status = 'COMPLETED'
          and completed_at_utc >= '2025-01-01T00:00:00Z'
          and completed_at_utc < '2026-01-01T00:00:00Z'
        order by completed_at_utc desc, shipment_id asc
        limit 20 offset $2`,
      [organizationId, deepOffset],
    ),
  );

  console.log(
    JSON.stringify(
      {
        fixture: {
          days,
          shipmentsPerDay,
          eventsPerShipment,
          creationMilliseconds: round(fixtureMilliseconds),
          counts: counts.rows[0],
        },
        measurements,
        note: "Medición local reproducible en PGlite; confirme API y render en DevTools antes de fijar umbrales de producción.",
      },
      null,
      2,
    ),
  );
} finally {
  await database.close();
}

async function insertFixture(
  target,
  { days: fixtureDays, shipmentsPerDay: daily, eventsPerShipment: events },
) {
  await target.exec(`
    insert into auth.users (id, email) values
      ('71000000-0000-4000-8000-000000000001', 'benchmark@example.invalid');

    insert into app.user_profiles (
      id, organization_id, auth_user_id, role_id, display_name, account_status
    )
    select '72000000-0000-4000-8000-000000000001', '${organizationId}',
           '71000000-0000-4000-8000-000000000001', roles.id,
           'Perfil benchmark', 'ACTIVE'
      from app.roles as roles where roles.code = 'JEFE_PLANTA';

    insert into app.worker_requests (
      id, organization_id, plant_id, requested_by_profile_id, requested_name,
      status, requested_at, review_due_at
    ) values (
      '73000000-0000-4000-8000-000000000001', '${organizationId}',
      '31000000-0000-4000-8000-000000000001',
      '72000000-0000-4000-8000-000000000001', 'Trabajador benchmark',
      'PENDING', '2025-01-01T00:00:00Z', '2025-01-04T00:00:00Z'
    );

    insert into app.workers (
      id, organization_id, plant_id, source_request_id, name, status,
      status_changed_at
    ) values (
      '74000000-0000-4000-8000-000000000001', '${organizationId}',
      '31000000-0000-4000-8000-000000000001',
      '73000000-0000-4000-8000-000000000001', 'Trabajador benchmark',
      'ACTIVO', '2025-01-01T00:00:00Z'
    );
  `);

  await target.query(
    `with fixture as (
       select
         ((day_number - 1) * $2 + line_number)::integer as fixture_number,
         day_number,
         line_number,
         ('2025-01-01T06:00:00Z'::timestamptz
           + (day_number - 1) * interval '1 day'
           + (line_number - 1) * interval '2 hours') as started_at
       from generate_series(1, $1) as day_number
       cross join generate_series(1, $2) as line_number
     )
     insert into app.shipments (
       id, organization_id, plant_id, station_id, production_line_id,
       supplier_id, feed_cycle_id, started_by_profile_id, started_at_utc,
       completed_at_utc, status
     )
     select md5('benchmark-shipment-' || fixture_number)::uuid, $3,
            '31000000-0000-4000-8000-000000000001',
            '34000000-0000-4000-8000-000000000001',
            ('32000000-0000-4000-8000-' || lpad(line_number::text, 12, '0'))::uuid,
            ('35000000-0000-4000-8000-' || lpad((((fixture_number - 1) % 3) + 1)::text, 12, '0'))::uuid,
            md5('benchmark-cycle-' || fixture_number)::uuid,
            '72000000-0000-4000-8000-000000000001', started_at,
            started_at + interval '8 hours', 'COMPLETED'
       from fixture`,
    [fixtureDays, daily, organizationId],
  );

  await target.query(
    `insert into app.responsibility_assignments (
       id, organization_id, shipment_id, worker_id, assigned_by_profile_id,
       started_at_utc, ended_at_utc
     )
     select md5('benchmark-responsibility-' || shipments.id)::uuid,
            shipments.organization_id, shipments.id,
            '74000000-0000-4000-8000-000000000001',
            '72000000-0000-4000-8000-000000000001',
            shipments.started_at_utc, shipments.completed_at_utc
       from app.shipments as shipments
      where shipments.organization_id = $1
        and shipments.started_by_profile_id = '72000000-0000-4000-8000-000000000001'`,
    [organizationId],
  );

  await target.query(
    `with fixture_shipments as (
       select shipments.*,
              row_number() over (order by started_at_utc, id)::bigint as shipment_number
         from app.shipments as shipments
        where organization_id = $1
          and started_by_profile_id = '72000000-0000-4000-8000-000000000001'
     )
     insert into app.production_events (
       id, organization_id, plant_id, station_id, production_line_id,
       feed_cycle_id, shipment_id, responsible_worker_id, event_type,
       work_period, occurred_at_utc, recorded_at_utc, client_sequence,
       quantity_delta, input_source_kind, input_controller_id,
       input_signal_code, input_line_slot, input_was_repeat,
       authorization_profile_id, authorization_permission_version,
       authorization_state
     )
     select md5('benchmark-event-' || shipments.id || '-' || event_number)::uuid,
            shipments.organization_id, shipments.plant_id, shipments.station_id,
            shipments.production_line_id, shipments.feed_cycle_id, shipments.id,
            '74000000-0000-4000-8000-000000000001', 'CAJUELA_ADDED',
            'DAY', shipments.started_at_utc + event_number * interval '1 minute',
            shipments.started_at_utc + event_number * interval '1 minute'
              + interval '5 seconds',
            ((shipments.shipment_number - 1) * $2 + event_number)::bigint,
            1, 'BENCHMARK', 'benchmark-controller', 'ADD',
            ((shipments.shipment_number - 1) % 4 + 1)::integer, false,
            '72000000-0000-4000-8000-000000000001', 1, 'VALID'
       from fixture_shipments as shipments
       cross join generate_series(1, $2) as event_number`,
    [organizationId, events],
  );

  await target.exec("analyze;");
}

async function measure(target, name, sql, parameters) {
  await target.query(sql, parameters);
  const samples = [];
  let rowCount = 0;
  for (let repetition = 0; repetition < 5; repetition += 1) {
    const startedAt = performance.now();
    const result = await target.query(sql, parameters);
    samples.push(performance.now() - startedAt);
    rowCount = result.rows.length;
  }
  samples.sort((left, right) => left - right);
  return {
    name,
    rowCount,
    medianMilliseconds: round(samples[Math.floor(samples.length / 2)] ?? 0),
    maximumMilliseconds: round(samples.at(-1) ?? 0),
  };
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

function round(value) {
  return Math.round(value * 100) / 100;
}
