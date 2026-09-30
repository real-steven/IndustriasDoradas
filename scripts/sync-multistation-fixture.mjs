import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const mode = process.argv[2] ?? "snapshot";
const statePath = path.resolve("TestResults", "sprint-03-10-multistation.json");
const stationTwoId = "34000000-0000-4000-8000-000000000002";
const authorizationTwoId = "a2000000-0000-4000-8000-000000000002";
const supabaseUrl = requiredEnvironment("SUPABASE_URL").replace(/\/$/u, "");
const secret = requiredEnvironment("SUPABASE_SECRET_KEY");
const restUrl = `${supabaseUrl}/rest/v1`;
const commonHeaders = {
  Accept: "application/json",
  "Accept-Profile": "app",
  apikey: secret,
  Authorization: `Bearer ${secret}`,
  "Content-Profile": "app",
  "Content-Type": "application/json",
};

switch (mode) {
  case "prepare":
    await prepare();
    break;
  case "catalog-change":
    await changeCatalog();
    break;
  case "catalog-restore":
    await restoreCatalog();
    break;
  case "snapshot":
    await snapshot();
    break;
  case "rebaseline":
    await rebaseline();
    break;
  case "cleanup":
    await cleanup();
    break;
  default:
    throw new Error(
      "Use prepare, catalog-change, catalog-restore, snapshot, rebaseline or cleanup",
    );
}

async function prepare() {
  const existingState = await readState(false);
  if (existingState !== null && existingState.cleanedAtUtc === undefined) {
    throw new Error(
      `An active fixture already exists at ${statePath}; run snapshot or cleanup first`,
    );
  }

  const authorizations = await request(
    "station_user_authorizations?select=id,organization_id,plant_id,station_id,user_profile_id,authorized_by_profile_id&is_active=eq.true&order=authorized_at.asc&limit=1",
  );
  const primary = requiredRow(authorizations, "active station authorization");
  if (primary.station_id === stationTwoId) {
    throw new Error("The primary station cannot be the Sprint 3.10 fixture");
  }

  const [lines, primaryScopes, existingStations] = await Promise.all([
    request(
      `production_lines?select=id,code,name&organization_id=eq.${primary.organization_id}&plant_id=eq.${primary.plant_id}&is_active=eq.true&order=code.asc`,
    ),
    request(
      `station_line_scopes?select=production_line_id,is_active,deactivated_at&organization_id=eq.${primary.organization_id}&station_id=eq.${primary.station_id}&order=production_line_id.asc`,
    ),
    request(`stations?select=id,code,name&id=eq.${stationTwoId}`),
  ]);
  if (lines.length < 4) {
    throw new Error("The integrated test requires at least four active lines");
  }
  const existingStation = existingStations[0];
  if (
    existingStation !== undefined &&
    existingStation.code !== "ESTACION_2_PRUEBA_3_10"
  ) {
    throw new Error(
      `Station ${stationTwoId} already exists with code ${existingStation.code}`,
    );
  }

  const now = new Date().toISOString();
  const firstPair = lines.slice(0, 2);
  const secondPair = lines.slice(2, 4);
  const state = {
    preparedAtUtc: now,
    organizationId: primary.organization_id,
    plantId: primary.plant_id,
    profileId: primary.user_profile_id,
    authorizedByProfileId: primary.authorized_by_profile_id,
    stationOneId: primary.station_id,
    stationTwoId,
    linePairOne: firstPair,
    linePairTwo: secondPair,
    originalStationOneScopes: primaryScopes,
  };
  await writeState(state);

  try {
    await upsert("stations", "id", [
      {
        id: stationTwoId,
        organization_id: state.organizationId,
        plant_id: state.plantId,
        code: "ESTACION_2_PRUEBA_3_10",
        name: "Estación secundaria prueba Sprint 3.10",
        device_key: "station-sprint-03-10-000000000002",
        permission_version: 1,
        is_active: true,
        deactivated_at: null,
      },
    ]);
    await upsert(
      "station_user_authorizations",
      "organization_id,station_id,user_profile_id",
      [
        {
          id: authorizationTwoId,
          organization_id: state.organizationId,
          plant_id: state.plantId,
          station_id: stationTwoId,
          user_profile_id: state.profileId,
          authorized_by_profile_id: state.authorizedByProfileId,
          is_active: true,
          deactivated_at: null,
          deactivated_by_profile_id: null,
          deactivation_reason: null,
        },
      ],
    );
    await setScopes(
      state,
      state.stationOneId,
      lines,
      new Set(firstPair.map(rowId)),
    );
    await setScopes(
      state,
      stationTwoId,
      secondPair,
      new Set(secondPair.map(rowId)),
    );
  } catch (error) {
    await writeState({ ...state, preparationError: String(error) });
    throw error;
  }

  console.log(
    JSON.stringify(
      {
        outcome: "fixture-ready",
        stationOne: { id: state.stationOneId, lines: firstPair },
        stationTwo: { id: stationTwoId, lines: secondPair },
        stateFile: statePath,
      },
      null,
      2,
    ),
  );
}

async function changeCatalog() {
  const state = await readState();
  const suppliers = await request(
    `suppliers?select=id,name&organization_id=eq.${state.organizationId}&is_active=eq.true&order=name.asc&limit=1`,
  );
  const supplier = requiredRow(suppliers, "active supplier");
  const originalName = state.originalSupplierName ?? supplier.name;
  const changedName = `${originalName} prueba 3.10`;
  await patchRows("suppliers", `id=eq.${supplier.id}`, {
    name: changedName,
    updated_at: new Date().toISOString(),
  });
  await writeState({
    ...state,
    supplierId: supplier.id,
    originalSupplierName: originalName,
    changedSupplierName: changedName,
    catalogChangedAtUtc: new Date().toISOString(),
  });
  console.log(
    JSON.stringify(
      { outcome: "catalog-changed", supplierId: supplier.id, changedName },
      null,
      2,
    ),
  );
}

async function restoreCatalog() {
  const state = await readState();
  if (
    state.supplierId === undefined ||
    state.originalSupplierName === undefined
  ) {
    console.log(JSON.stringify({ outcome: "catalog-not-changed" }, null, 2));
    return;
  }
  await patchRows("suppliers", `id=eq.${state.supplierId}`, {
    name: state.originalSupplierName,
    updated_at: new Date().toISOString(),
  });
  await writeState({
    ...state,
    catalogRestoredAtUtc: new Date().toISOString(),
  });
  console.log(
    JSON.stringify(
      {
        outcome: "catalog-restored",
        supplierId: state.supplierId,
        name: state.originalSupplierName,
      },
      null,
      2,
    ),
  );
}

async function snapshot() {
  const state = await readState();
  const stationFilter = `in.(${state.stationOneId},${state.stationTwoId})`;
  const lineFilter = `in.(${[...state.linePairOne, ...state.linePairTwo]
    .map(rowId)
    .join(",")})`;
  const [
    shipments,
    events,
    receipts,
    clients,
    catalogChanges,
    activeLineShipments,
  ] = await Promise.all([
    request(
      `shipments?select=id,station_id,production_line_id,status,started_at_utc,completed_at_utc&station_id=${stationFilter}&started_at_utc=gte.${encodeURIComponent(state.preparedAtUtc)}&order=started_at_utc.asc`,
    ),
    request(
      `production_events?select=id,station_id,shipment_id,event_type,quantity_delta,occurred_at_utc&station_id=${stationFilter}&occurred_at_utc=gte.${encodeURIComponent(state.preparedAtUtc)}&order=occurred_at_utc.asc`,
    ),
    request(
      `sync_receipts?select=id,station_id,station_sequence,outbox_message_id,terminal_status,result_code,processed_at_utc&station_id=${stationFilter}&processed_at_utc=gte.${encodeURIComponent(state.preparedAtUtc)}&order=processed_at_utc.asc`,
    ),
    request(
      `sync_clients?select=station_id,application,application_version,last_seen_at_utc,last_clock_skew_seconds&station_id=${stationFilter}`,
    ),
    state.supplierId === undefined
      ? Promise.resolve([])
      : request(
          `sync_changes?select=server_sequence,entity_type,entity_id,action,changed_at_utc,payload&entity_type=eq.SUPPLIER&entity_id=eq.${state.supplierId}&changed_at_utc=gte.${encodeURIComponent(state.preparedAtUtc)}&order=server_sequence.asc`,
        ),
    request(
      `shipments?select=id,station_id,production_line_id,status,started_at_utc&production_line_id=${lineFilter}&status=eq.ACTIVE&order=started_at_utc.asc`,
    ),
  ]);
  const stations = [state.stationOneId, state.stationTwoId].map((stationId) => {
    const stationEvents = events.filter(
      (event) => event.station_id === stationId,
    );
    const stationReceipts = receipts.filter(
      (receipt) => receipt.station_id === stationId,
    );
    return {
      stationId,
      shipments: shipments.filter(
        (shipment) => shipment.station_id === stationId,
      ),
      eventCount: stationEvents.length,
      total: stationEvents.reduce(
        (sum, event) => sum + Number(event.quantity_delta),
        0,
      ),
      receiptCount: stationReceipts.length,
      uniqueOutboxMessages: new Set(
        stationReceipts.map((receipt) => receipt.outbox_message_id),
      ).size,
      failedReview: stationReceipts.filter(
        (receipt) => receipt.terminal_status === "FAILED_REVIEW",
      ),
      client: clients.find((client) => client.station_id === stationId) ?? null,
    };
  });
  const duplicateEventIds = duplicateValues(events.map((event) => event.id));
  if (duplicateEventIds.length > 0) {
    throw new Error(
      `Duplicate central event IDs: ${duplicateEventIds.join(", ")}`,
    );
  }
  const expectedOne = numericArgument("--expected-one");
  const expectedTwo = numericArgument("--expected-two");
  if (expectedOne !== null && stations[0].total !== expectedOne) {
    throw new Error(
      `Station one total is ${stations[0].total}; expected ${expectedOne}`,
    );
  }
  if (expectedTwo !== null && stations[1].total !== expectedTwo) {
    throw new Error(
      `Station two total is ${stations[1].total}; expected ${expectedTwo}`,
    );
  }
  console.log(
    JSON.stringify(
      {
        outcome: "central-snapshot",
        preparedAtUtc: state.preparedAtUtc,
        stations,
        totalEvents: events.length,
        totalQuantity: events.reduce(
          (sum, event) => sum + Number(event.quantity_delta),
          0,
        ),
        duplicateEventIds,
        activeLineShipments,
        catalogChanges: catalogChanges.map((change) => ({
          serverSequence: change.server_sequence,
          action: change.action,
          name: change.payload?.name,
        })),
      },
      null,
      2,
    ),
  );
}

async function rebaseline() {
  const state = await readState();
  const targetLineIds = [
    rowId(state.linePairOne[1]),
    rowId(state.linePairTwo[0]),
  ];
  const lineFilter = `in.(${targetLineIds.join(",")})`;
  const activeShipments = await request(
    `shipments?select=id,station_id,production_line_id,status,started_at_utc&production_line_id=${lineFilter}&status=eq.ACTIVE&order=started_at_utc.asc`,
  );
  if (activeShipments.length > 0) {
    const details = activeShipments
      .map(
        (shipment) =>
          `${shipment.production_line_id}:${shipment.id}@${shipment.station_id}`,
      )
      .join(", ");
    throw new Error(
      `Target lines still have active shipments; close them from desktop before rebaseline: ${details}`,
    );
  }

  const now = new Date().toISOString();
  const nextState = {
    ...state,
    preparedAtUtc: now,
    rebaselinedAtUtc: now,
  };
  delete nextState.supplierId;
  delete nextState.originalSupplierName;
  delete nextState.changedSupplierName;
  delete nextState.catalogChangedAtUtc;
  delete nextState.catalogRestoredAtUtc;
  await writeState(nextState);
  console.log(
    JSON.stringify(
      {
        outcome: "fixture-rebaselined",
        preparedAtUtc: now,
        targetLineIds,
      },
      null,
      2,
    ),
  );
}

async function cleanup() {
  let state = await readState();
  await restoreCatalog();
  state = await readState();
  const activeShipments = await request(
    `shipments?select=id&station_id=eq.${stationTwoId}&status=eq.ACTIVE&limit=1`,
  );
  if (activeShipments.length > 0) {
    throw new Error(
      "Station two still has an active shipment; close it from desktop before cleanup",
    );
  }
  const now = new Date().toISOString();
  for (const scope of state.originalStationOneScopes) {
    await patchRows(
      "station_line_scopes",
      `organization_id=eq.${state.organizationId}&station_id=eq.${state.stationOneId}&production_line_id=eq.${scope.production_line_id}`,
      {
        is_active: scope.is_active,
        deactivated_at: scope.deactivated_at,
        updated_at: now,
      },
    );
  }
  await patchRows(
    "station_line_scopes",
    `organization_id=eq.${state.organizationId}&station_id=eq.${stationTwoId}`,
    { is_active: false, deactivated_at: now, updated_at: now },
  );
  await patchRows(
    "station_user_authorizations",
    `organization_id=eq.${state.organizationId}&station_id=eq.${stationTwoId}&user_profile_id=eq.${state.profileId}`,
    {
      is_active: false,
      deactivated_at: now,
      deactivated_by_profile_id: state.authorizedByProfileId,
      deactivation_reason: "FIN_PRUEBA_SPRINT_3_10",
      updated_at: now,
    },
  );
  await patchRows("stations", `id=eq.${stationTwoId}`, {
    is_active: false,
    deactivated_at: now,
    updated_at: now,
  });
  await writeState({ ...state, cleanedAtUtc: now });
  console.log(JSON.stringify({ outcome: "fixture-cleaned", at: now }, null, 2));
}

async function setScopes(state, stationId, lines, activeLineIds) {
  const now = new Date().toISOString();
  await upsert(
    "station_line_scopes",
    "organization_id,station_id,production_line_id",
    lines.map((line) => {
      const active = activeLineIds.has(line.id);
      return {
        organization_id: state.organizationId,
        plant_id: state.plantId,
        production_line_id: line.id,
        station_id: stationId,
        is_active: active,
        deactivated_at: active ? null : now,
      };
    }),
  );
}

async function upsert(table, conflict, rows) {
  return request(`${table}?on_conflict=${encodeURIComponent(conflict)}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(rows),
  });
}

async function patchRows(table, filters, body) {
  return request(`${table}?${filters}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
}

async function request(resource, init = {}) {
  const response = await fetch(`${restUrl}/${resource}`, {
    ...init,
    headers: { ...commonHeaders, ...init.headers },
  });
  const text = await response.text();
  const body = text === "" ? [] : JSON.parse(text);
  if (!response.ok) {
    const code = typeof body.code === "string" ? body.code : "UNKNOWN";
    throw new Error(
      `Supabase request failed with HTTP ${response.status} (${code})`,
    );
  }
  return body;
}

async function readState(required = true) {
  try {
    return JSON.parse(await readFile(statePath, "utf8"));
  } catch (error) {
    if (!required && error?.code === "ENOENT") return null;
    throw new Error(`Fixture state is unavailable at ${statePath}`, {
      cause: error,
    });
  }
}

async function writeState(state) {
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function rowId(row) {
  return row.id;
}

function requiredRow(rows, description) {
  const row = rows[0];
  if (row === undefined) throw new Error(`No ${description} exists`);
  return row;
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function numericArgument(name) {
  const prefix = `${name}=`;
  const raw = process.argv.find((argument) => argument.startsWith(prefix));
  if (raw === undefined) return null;
  const value = Number(raw.slice(prefix.length));
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return value;
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}
