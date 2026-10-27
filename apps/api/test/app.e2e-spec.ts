import { type INestApplication, UnauthorizedException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Server } from "node:http";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { configureApplication } from "../src/app.setup";
import {
  ACCOUNTS_REPOSITORY,
  type AccountsRepository,
} from "../src/accounts/accounts.contracts";
import {
  AUDIT_EVENT_REPOSITORY,
  AUDIT_QUERY_REPOSITORY,
  type AuditQueryRepository,
  type AuditEventRepository,
  type AuditEventRecord,
} from "../src/audit/audit.contracts";
import {
  ATTENDANCE_QUERY_REPOSITORY,
  type AttendanceQueryRepository,
} from "../src/attendance/attendance.contracts";
import {
  ACCESS_TOKEN_VERIFIER,
  PROFILE_REPOSITORY,
  type AccessTokenVerifier,
  type AuthorizedProfile,
  type ProfileRepository,
  type VerifiedAccessToken,
} from "../src/auth/auth.contracts";
import {
  CATALOG_REPOSITORY,
  type CatalogRepository,
} from "../src/catalogs/catalogs.contracts";
import { SupabaseDataError } from "../src/catalogs/supabase-catalog.repository";
import {
  GOLD_REPOSITORY,
  type GoldRepository,
} from "../src/gold/gold.contracts";
import {
  INVENTORY_REPOSITORY,
  type InventoryMovement,
  type InventoryRepository,
} from "../src/inventory/inventory.contracts";
import {
  WORKERS_REPOSITORY,
  type WorkersRepository,
} from "../src/workers/workers.contracts";
import {
  STATION_REPOSITORY,
  type StationRepository,
} from "../src/station/station.contracts";
import {
  MANAGEMENT_QUERY_REPOSITORY,
  type ManagementQueryRepository,
} from "../src/management/management.contracts";
import {
  SYNC_REPOSITORY,
  type SyncRepository,
} from "../src/sync/sync.contracts";

const VERIFIED_TOKEN: VerifiedAccessToken = {
  subject: "a0000000-0000-4000-8000-000000000001",
  sessionId: "a0000000-0000-4000-8000-000000000002",
  email: "manager@example.invalid",
  issuedAt: 1_700_000_000,
  expiresAt: 1_700_003_600,
};

const ACTIVE_PROFILE: AuthorizedProfile = {
  id: "a1000000-0000-4000-8000-000000000001",
  organizationId: "30000000-0000-4000-8000-000000000001",
  authUserId: VERIFIED_TOKEN.subject,
  displayName: "Jefe ficticio",
  preferredLocale: "es",
  accountStatus: "ACTIVE",
  isActive: true,
  role: {
    id: "20000000-0000-4000-8000-000000000001",
    code: "JEFE_EMPRESA",
    isActive: true,
  },
  permissions: [
    "reports.read",
    "audit.read_redacted",
    "audit.read_operational",
    "organization_catalogs.read",
    "organization_catalogs.manage",
    "suppliers.manage",
    "workers.read",
    "attendance.read",
    "gold.read",
    "gold.results.manage",
    "inventory.manage",
    "administrators.govern",
    "administrators.create",
    "administrators.permissions.manage",
    "plant_managers.manage",
  ],
};

describe("API smoke (e2e)", () => {
  let app: INestApplication;
  let httpServer: Server;
  let tokenVerifier: jest.Mocked<AccessTokenVerifier>;
  let profiles: jest.Mocked<ProfileRepository>;
  let auditEvents: jest.Mocked<AuditEventRepository>;
  let auditQuery: jest.Mocked<AuditQueryRepository>;
  let catalogs: jest.Mocked<CatalogRepository>;
  let workers: jest.Mocked<WorkersRepository>;
  let attendance: jest.Mocked<AttendanceQueryRepository>;
  let accounts: jest.Mocked<AccountsRepository>;
  let gold: jest.Mocked<GoldRepository>;
  let inventory: jest.Mocked<InventoryRepository>;
  let stations: jest.Mocked<StationRepository>;
  let management: jest.Mocked<ManagementQueryRepository>;
  let sync: jest.Mocked<SyncRepository>;

  beforeAll(async () => {
    tokenVerifier = { verify: jest.fn() };
    profiles = { findByAuthUserId: jest.fn() };
    auditEvents = { insert: jest.fn().mockResolvedValue(undefined) };
    auditQuery = {
      list: jest.fn().mockResolvedValue({
        items: [],
        page: 1,
        pageSize: 25,
        total: 0,
        totalPages: 0,
      }),
    };
    catalogs = {
      list: jest.fn().mockResolvedValue({
        items: [],
        page: 1,
        pageSize: 25,
        total: 0,
        totalPages: 0,
      }),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      setActive: jest.fn(),
      listComponentTypes: jest.fn().mockResolvedValue([]),
    };
    workers = {
      listRequests: jest.fn().mockResolvedValue({
        items: [],
        page: 1,
        pageSize: 25,
        total: 0,
        totalPages: 0,
      }),
      listWorkers: jest.fn().mockResolvedValue({
        items: [],
        page: 1,
        pageSize: 25,
        total: 0,
        totalPages: 0,
      }),
      requestWorker: jest.fn(),
      resolveRequest: jest.fn(),
      findWorker: jest.fn(),
      setWorkerActive: jest.fn(),
    };
    attendance = {
      listHistory: jest.fn().mockResolvedValue([]),
    };
    accounts = {
      list: jest.fn().mockResolvedValue({
        items: [],
        page: 1,
        pageSize: 25,
        total: 0,
        totalPages: 0,
      }),
      find: jest.fn(),
      govern: jest.fn(),
      updateLocale: jest.fn(),
      createAdministrator: jest.fn(),
      createPlantManager: jest.fn(),
      listAdministratorPermissions: jest.fn().mockResolvedValue([]),
      replaceAdministratorPermissions: jest.fn().mockResolvedValue(undefined),
    };
    gold = {
      listShipmentFacts: jest.fn().mockResolvedValue([]),
      listResults: jest.fn().mockResolvedValue([]),
      createResult: jest.fn(),
    };
    inventory = {
      hasPlantScope: jest.fn().mockResolvedValue(true),
      listCatalog: jest.fn().mockResolvedValue({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 0,
      }),
      findCatalog: jest.fn().mockResolvedValue(inventoryItem()),
      createCatalog: jest.fn(),
      setCatalogActive: jest.fn(),
      listMovements: jest.fn().mockResolvedValue({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 0,
      }),
      findMovement: jest.fn(),
      getBalance: jest.fn().mockResolvedValue(10),
      createMovement: jest.fn(),
      createReview: jest.fn(),
      createComponentChange: jest.fn(),
    };
    stations = {
      getSnapshot: jest.fn(),
      recordPinAttempt: jest.fn(),
      setPinVerifier: jest.fn(),
      resetPinBlocks: jest.fn(),
    };
    management = {
      findLatestChange: jest.fn().mockResolvedValue({
        serverSequence: "42",
        changedAtUtc: "2026-10-13T06:00:00.000Z",
      }),
      listOperationLines: jest.fn().mockResolvedValue({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 0,
      }),
      listShipments: jest.fn().mockResolvedValue({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 0,
      }),
      findShipment: jest.fn(),
      listShipmentSweeps: jest.fn().mockResolvedValue({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 0,
      }),
    };
    sync = {
      findPushStationScope: jest.fn(),
      findActivePullScope: jest.fn(),
      listChanges: jest.fn(),
      ingestItem: jest.fn(),
    };
    const testingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ACCESS_TOKEN_VERIFIER)
      .useValue(tokenVerifier)
      .overrideProvider(PROFILE_REPOSITORY)
      .useValue(profiles)
      .overrideProvider(AUDIT_EVENT_REPOSITORY)
      .useValue(auditEvents)
      .overrideProvider(AUDIT_QUERY_REPOSITORY)
      .useValue(auditQuery)
      .overrideProvider(CATALOG_REPOSITORY)
      .useValue(catalogs)
      .overrideProvider(WORKERS_REPOSITORY)
      .useValue(workers)
      .overrideProvider(ATTENDANCE_QUERY_REPOSITORY)
      .useValue(attendance)
      .overrideProvider(ACCOUNTS_REPOSITORY)
      .useValue(accounts)
      .overrideProvider(GOLD_REPOSITORY)
      .useValue(gold)
      .overrideProvider(INVENTORY_REPOSITORY)
      .useValue(inventory)
      .overrideProvider(STATION_REPOSITORY)
      .useValue(stations)
      .overrideProvider(MANAGEMENT_QUERY_REPOSITORY)
      .useValue(management)
      .overrideProvider(SYNC_REPOSITORY)
      .useValue(sync)
      .compile();

    app = testingModule.createNestApplication();
    configureApplication(app);
    await app.init();
    httpServer = app.getHttpServer() as Server;
  });

  beforeEach(() => {
    auditEvents.insert.mockClear();
    catalogs.create.mockClear();
    accounts.list.mockClear();
    accounts.find.mockClear();
    accounts.find.mockResolvedValue(null);
    accounts.createAdministrator.mockClear();
    accounts.createPlantManager.mockClear();
    accounts.replaceAdministratorPermissions.mockClear();
    gold.listShipmentFacts.mockClear();
    gold.listResults.mockClear();
    gold.createResult.mockReset();
    inventory.findMovement.mockReset();
    inventory.createMovement.mockReset();
    inventory.getBalance.mockResolvedValue(10);
    attendance.listHistory.mockClear();
    management.listOperationLines.mockClear();
    management.findLatestChange.mockClear();
    management.listShipments.mockClear();
    management.findShipment.mockClear();
    management.listShipmentSweeps.mockClear();
    sync.findPushStationScope.mockReset();
    sync.findActivePullScope.mockReset();
    sync.listChanges.mockReset();
    sync.ingestItem.mockReset();
    tokenVerifier.verify.mockImplementation((token) => {
      if (token === "valid-token") {
        return Promise.resolve(VERIFIED_TOKEN);
      }

      return Promise.reject(
        new UnauthorizedException("Invalid or expired access token"),
      );
    });
    profiles.findByAuthUserId.mockResolvedValue(ACTIVE_PROFILE);
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/v1/health reports a healthy API", async () => {
    const response = await request(httpServer)
      .get("/api/v1/health")
      .expect(200);
    const body = response.body as Record<string, unknown>;

    expect(body).toMatchObject({
      status: "ok",
      service: "industrias-doradas-api",
    });
    expect(Number.isNaN(Date.parse(body.timestamp as string))).toBe(false);
  });

  it("uses the uniform error contract", async () => {
    const response = await request(httpServer)
      .get("/api/v1/does-not-exist")
      .expect(404);
    const body = response.body as Record<string, unknown>;

    expect(body).toMatchObject({
      statusCode: 404,
      code: "HTTP_404",
      message: "Cannot GET /api/v1/does-not-exist",
      path: "/api/v1/does-not-exist",
    });
    expect(Number.isNaN(Date.parse(body.timestamp as string))).toBe(false);
  });

  it("serves a bearer-secured OpenAPI contract", async () => {
    const response = await request(httpServer)
      .get("/api/openapi.json")
      .expect(200);
    const body = response.body as {
      paths: Record<string, { get?: { security?: unknown } }>;
      components: { schemas: Record<string, unknown> };
    };

    expect(body.paths["/api/v1/auth/session"]?.get?.security).toEqual([
      { supabase: [] },
    ]);
    expect(body.components.schemas).toHaveProperty("ErrorResponse");
    expect(body.components.schemas).toHaveProperty("PageCatalog");
    expect(body.components.schemas).toHaveProperty("PageManagementShipment");
    expect(body.components.schemas).toHaveProperty("GoldResultEntry");
    expect(body.components.schemas).toHaveProperty("GoldSummary");
    expect(body.components.schemas).toHaveProperty("InventoryMovement");
    expect(body.paths).toHaveProperty(
      "/api/v1/organizations/{organizationId}/management/shipments",
    );
    expect(body.paths).toHaveProperty(
      "/api/v1/organizations/{organizationId}/management/gold-summary",
    );
    expect(body.paths).toHaveProperty(
      "/api/v1/organizations/{organizationId}/management/shipments/{shipmentId}/gold-results",
    );
    expect(body.paths).toHaveProperty(
      "/api/v1/organizations/{organizationId}/inventory/plants/{plantId}/movements",
    );
    expect(body.paths).toHaveProperty(
      "/api/v1/organizations/{organizationId}/inventory/plants/{plantId}/movements/{movementId}/reversal",
    );
  });

  it("excludes query credentials from error bodies", async () => {
    const response = await request(httpServer)
      .get("/api/v1/does-not-exist?access_token=must-not-be-returned")
      .expect(404);
    const body = response.body as Record<string, unknown>;

    expect(body.path).toBe("/api/v1/does-not-exist");
    expect(JSON.stringify(body)).not.toContain("must-not-be-returned");
  });

  it("rejects a protected endpoint without a token", async () => {
    const response = await request(httpServer)
      .get("/api/v1/auth/session")
      .expect(401);
    const body = response.body as Record<string, unknown>;

    expect(body).toMatchObject({
      statusCode: 401,
      code: "HTTP_401",
      message: "Authentication required",
    });
    expect(typeof body.correlationId).toBe("string");
    expect(response.headers["x-correlation-id"]).toBe(body.correlationId);
    expect(auditEvents.insert.mock.calls).toHaveLength(1);
    expect(auditEvents.insert.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        result: "REJECTED",
        reasonCode: "AUTHENTICATION_REQUIRED",
        changes: {},
      }),
    );
  });

  it("rejects an invalid token", async () => {
    await request(httpServer)
      .get("/api/v1/auth/session")
      .set("Authorization", "Bearer invalid-token")
      .expect(401);
  });

  it("rejects an authenticated user without an application profile", async () => {
    profiles.findByAuthUserId.mockResolvedValueOnce(null);

    await request(httpServer)
      .get("/api/v1/auth/profile")
      .set("Authorization", "Bearer valid-token")
      .expect(403);
  });

  it("rejects a suspended application profile", async () => {
    profiles.findByAuthUserId.mockResolvedValueOnce({
      ...ACTIVE_PROFILE,
      accountStatus: "SUSPENDED",
    });

    await request(httpServer)
      .get("/api/v1/auth/profile")
      .set("Authorization", "Bearer valid-token")
      .expect(403);
  });

  it("returns the validated session context", async () => {
    const response = await request(httpServer)
      .get("/api/v1/auth/session")
      .set("Authorization", "Bearer valid-token")
      .expect(200);

    expect(response.body).toEqual({
      userId: VERIFIED_TOKEN.subject,
      sessionId: VERIFIED_TOKEN.sessionId,
      profileId: ACTIVE_PROFILE.id,
      displayName: ACTIVE_PROFILE.displayName,
      organizationId: ACTIVE_PROFILE.organizationId,
      role: "JEFE_EMPRESA",
      permissions: ACTIVE_PROFILE.permissions,
      issuedAt: "2023-11-14T22:13:20.000Z",
      expiresAt: "2023-11-14T23:13:20.000Z",
    });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(auditEvents.insert.mock.calls).toHaveLength(1);
    expect(auditEvents.insert.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        organizationId: ACTIVE_PROFILE.organizationId,
        result: "SUCCEEDED",
      }),
    );
    const event: AuditEventRecord | undefined =
      auditEvents.insert.mock.calls[0]?.[0];
    expect(event).toBeDefined();
    expect(event?.actor.profileId).toBe(ACTIVE_PROFILE.id);
    expect(event?.actor.roleCode).toBe("JEFE_EMPRESA");
    expect(JSON.stringify(event)).not.toMatch(
      /authorization|password|pin|token|photo/iu,
    );
  });

  it("returns only the current authorized profile", async () => {
    const response = await request(httpServer)
      .get("/api/v1/auth/profile")
      .set("Authorization", "Bearer valid-token")
      .expect(200);

    expect(response.body).toEqual({
      id: ACTIVE_PROFILE.id,
      organizationId: ACTIVE_PROFILE.organizationId,
      displayName: "Jefe ficticio",
      preferredLocale: "es",
      accountStatus: "ACTIVE",
      role: "JEFE_EMPRESA",
      permissions: ACTIVE_PROFILE.permissions,
    });
  });

  it("returns a paginated catalog only inside the authenticated organization", async () => {
    await request(httpServer)
      .get(
        `/api/v1/organizations/${ACTIVE_PROFILE.organizationId}/plants?page=1&pageSize=25`,
      )
      .set("Authorization", "Bearer valid-token")
      .expect(200)
      .expect({ items: [], page: 1, pageSize: 25, total: 0, totalPages: 0 });

    expect(catalogs.list.mock.calls).toContainEqual([
      "plants",
      ACTIVE_PROFILE.organizationId,
      expect.objectContaining({ page: 1, pageSize: 25 }),
    ]);

    await request(httpServer)
      .get("/api/v1/organizations/30000000-0000-4000-8000-000000000099/plants")
      .set("Authorization", "Bearer valid-token")
      .expect(403);
  });

  it("allows a company manager to use business mutations in one account", async () => {
    catalogs.create.mockResolvedValueOnce({
      id: "35000000-0000-4000-8000-000000000099",
      organizationId: ACTIVE_PROFILE.organizationId,
      name: "Proveedor ficticio",
      isActive: true,
      deactivatedAt: null,
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
    });
    await request(httpServer)
      .post(`/api/v1/organizations/${ACTIVE_PROFILE.organizationId}/suppliers`)
      .set("Authorization", "Bearer valid-token")
      .send({ name: "Proveedor ficticio" })
      .expect(201);

    expect(catalogs.create.mock.calls).toHaveLength(1);
  });

  it("validates catalog payloads before reaching storage", async () => {
    profiles.findByAuthUserId.mockResolvedValueOnce({
      ...ACTIVE_PROFILE,
      role: { ...ACTIVE_PROFILE.role, code: "ADMINISTRADOR" },
      permissions: ["organization_catalogs.manage"],
    });

    const response = await request(httpServer)
      .post(`/api/v1/organizations/${ACTIVE_PROFILE.organizationId}/plants`)
      .set("Authorization", "Bearer valid-token")
      .send({ code: "codigo con espacios", name: "" })
      .expect(400);

    expect(response.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(catalogs.create.mock.calls).toHaveLength(0);
  });

  it("limits account governance listings to the actor hierarchy", async () => {
    await request(httpServer)
      .get(`/api/v1/organizations/${ACTIVE_PROFILE.organizationId}/accounts`)
      .set("Authorization", "Bearer valid-token")
      .expect(200);

    expect(accounts.list.mock.calls).toContainEqual([
      ACTIVE_PROFILE.organizationId,
      expect.objectContaining({ roleCode: "ADMINISTRADOR" }),
    ]);
  });

  it("lets the company manager replace administrator permissions", async () => {
    accounts.find.mockResolvedValue(administratorAccount());
    accounts.listAdministratorPermissions.mockResolvedValue([
      {
        code: "inventory.manage",
        description: "Gestionar inventario.",
        assigned: false,
      },
    ]);

    await request(httpServer)
      .put(
        `/api/v1/organizations/${ACTIVE_PROFILE.organizationId}/accounts/a1000000-0000-4000-8000-000000000099/permissions`,
      )
      .set("Authorization", "Bearer valid-token")
      .send({ permissionCodes: ["inventory.manage"] })
      .expect(200);

    expect(accounts.replaceAdministratorPermissions.mock.calls).toContainEqual([
      expect.objectContaining({
        organizationId: ACTIVE_PROFILE.organizationId,
        profileId: "a1000000-0000-4000-8000-000000000099",
        governorProfileId: ACTIVE_PROFILE.id,
        permissionCodes: ["inventory.manage"],
      }),
    ]);
  });

  it("reports a duplicate administrator email as a conflict", async () => {
    accounts.createAdministrator.mockRejectedValueOnce(
      new SupabaseDataError("email_exists", "auth.users"),
    );

    const response = await request(httpServer)
      .post(
        `/api/v1/organizations/${ACTIVE_PROFILE.organizationId}/accounts/administrators`,
      )
      .set("Authorization", "Bearer valid-token")
      .send({
        displayName: "Administración duplicada",
        email: "existing@example.com",
        preferredLocale: "es",
        permissionCodes: [],
      })
      .expect(409);

    expect(response.body).toMatchObject({
      code: "ACCOUNT_EMAIL_ALREADY_REGISTERED",
    });
  });

  it("provisions a complete pending plant manager without exposing the PIN", async () => {
    accounts.createPlantManager.mockResolvedValueOnce(plantManagerAccount());

    const response = await request(httpServer)
      .post(
        `/api/v1/organizations/${ACTIVE_PROFILE.organizationId}/accounts/plant-managers`,
      )
      .set("Authorization", "Bearer valid-token")
      .send({
        displayName: "Jefe de planta nuevo",
        email: "plant.manager@example.invalid",
        password: "StrongPassword1!",
        pin: "123456",
        plantId: "31000000-0000-4000-8000-000000000001",
        stationIds: ["34000000-0000-4000-8000-000000000001"],
        preferredLocale: "es",
      })
      .expect(201);

    expect(response.body).toMatchObject({
      accountStatus: "PENDING_APPROVAL",
      roleCode: "JEFE_PLANTA",
      provisioningMethod: "DIRECT",
    });
    expect(accounts.createPlantManager.mock.calls).toHaveLength(1);
    const provisionInput = accounts.createPlantManager.mock.calls[0]?.[0];
    expect(provisionInput).toBeDefined();
    if (provisionInput === undefined) {
      throw new Error("Expected plant manager provisioning input");
    }
    expect(provisionInput).toMatchObject({
      email: "plant.manager@example.invalid",
      password: "StrongPassword1!",
      creatorProfileId: ACTIVE_PROFILE.id,
      plantId: "31000000-0000-4000-8000-000000000001",
      stationIds: ["34000000-0000-4000-8000-000000000001"],
    });
    expect(provisionInput.pinVerifier).toMatch(/^pbkdf2-sha256\$/u);
    expect(JSON.stringify(auditEvents.insert.mock.calls)).not.toContain(
      "123456",
    );
    expect(JSON.stringify(auditEvents.insert.mock.calls)).not.toContain(
      "StrongPassword1!",
    );
  });

  it("rejects an invalid plant manager PIN before provisioning", async () => {
    await request(httpServer)
      .post(
        `/api/v1/organizations/${ACTIVE_PROFILE.organizationId}/accounts/plant-managers`,
      )
      .set("Authorization", "Bearer valid-token")
      .send({
        displayName: "Jefe de planta nuevo",
        email: "plant.manager@example.invalid",
        password: "StrongPassword1!",
        pin: "12ab",
        plantId: "31000000-0000-4000-8000-000000000001",
        stationIds: ["34000000-0000-4000-8000-000000000001"],
        preferredLocale: "es",
      })
      .expect(400);

    expect(accounts.createPlantManager.mock.calls).toHaveLength(0);
  });

  it("prevents an administrator from delegating a permission it does not own", async () => {
    profiles.findByAuthUserId.mockResolvedValueOnce({
      ...ACTIVE_PROFILE,
      role: { ...ACTIVE_PROFILE.role, code: "ADMINISTRADOR" },
      permissions: ["administrators.permissions.manage", "inventory.manage"],
    });
    accounts.find.mockResolvedValueOnce(administratorAccount());
    accounts.listAdministratorPermissions.mockResolvedValueOnce([
      {
        code: "inventory.manage",
        description: "Gestionar inventario.",
        assigned: false,
      },
      {
        code: "workers.resolve",
        description: "Resolver trabajadores.",
        assigned: false,
      },
    ]);

    await request(httpServer)
      .put(
        `/api/v1/organizations/${ACTIVE_PROFILE.organizationId}/accounts/a1000000-0000-4000-8000-000000000099/permissions`,
      )
      .set("Authorization", "Bearer valid-token")
      .send({ permissionCodes: ["workers.resolve"] })
      .expect(403);

    expect(accounts.replaceAdministratorPermissions.mock.calls).toHaveLength(0);
  });

  it("authorizes only a plant manager assigned to the station", async () => {
    profiles.findByAuthUserId.mockResolvedValueOnce({
      ...ACTIVE_PROFILE,
      role: { ...ACTIVE_PROFILE.role, code: "JEFE_PLANTA" },
      permissions: ["station.open"],
    });
    stations.getSnapshot.mockResolvedValueOnce(null);

    await request(httpServer)
      .get(
        `/api/v1/organizations/${ACTIVE_PROFILE.organizationId}/stations/34000000-0000-4000-8000-000000000001/session-snapshot`,
      )
      .set("Authorization", "Bearer valid-token")
      .expect(403);
  });

  it("completes the identity-to-station contract for an assigned plant manager", async () => {
    profiles.findByAuthUserId.mockResolvedValueOnce({
      ...ACTIVE_PROFILE,
      role: { ...ACTIVE_PROFILE.role, code: "JEFE_PLANTA" },
      permissions: ["station.open"],
    });
    stations.getSnapshot.mockResolvedValueOnce({
      stationId: "34000000-0000-4000-8000-000000000001",
      plantId: "31000000-0000-4000-8000-000000000001",
      organizationId: ACTIVE_PROFILE.organizationId,
      stationName: "Estación ficticia",
      permissionVersion: 1,
      pinVerifier:
        "pbkdf2-sha256$600000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      validatedAt: "2026-08-19T00:00:00.000Z",
      offlineValidUntil: "2026-08-20T00:00:00.000Z",
      nextStationSequence: 50,
    });

    const response = await request(httpServer)
      .get(
        `/api/v1/organizations/${ACTIVE_PROFILE.organizationId}/stations/34000000-0000-4000-8000-000000000001/session-snapshot`,
      )
      .set("Authorization", "Bearer valid-token")
      .expect(200);

    expect(response.body).toMatchObject({
      organizationId: ACTIVE_PROFILE.organizationId,
      stationName: "Estación ficticia",
      permissionVersion: 1,
      nextStationSequence: 50,
    });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(stations.getSnapshot.mock.calls).toContainEqual([
      expect.objectContaining({
        organizationId: ACTIVE_PROFILE.organizationId,
        profileId: ACTIVE_PROFILE.id,
      }),
    ]);
  });

  it("serves paginated audit without authentication identifiers", async () => {
    const response = await request(httpServer)
      .get(
        `/api/v1/organizations/${ACTIVE_PROFILE.organizationId}/audit-events`,
      )
      .set("Authorization", "Bearer valid-token")
      .expect(200);

    expect(response.body).toEqual({
      items: [],
      page: 1,
      pageSize: 25,
      total: 0,
      totalPages: 0,
    });
    expect(JSON.stringify(response.body)).not.toContain("authUserId");
  });

  it("combines management filters for the company manager", async () => {
    management.listShipments.mockResolvedValueOnce({
      items: [],
      page: 2,
      pageSize: 10,
      total: 14,
      totalPages: 2,
    });

    await request(httpServer)
      .get(
        `/api/v1/organizations/${ACTIVE_PROFILE.organizationId}/management/shipments`,
      )
      .query({
        page: 2,
        pageSize: 10,
        fromUtc: "2026-10-01T00:00:00.000Z",
        toUtc: "2026-10-08T00:00:00.000Z",
        plantId: "31000000-0000-4000-8000-000000000001",
        productionLineId: "32000000-0000-4000-8000-000000000001",
        supplierId: "35000000-0000-4000-8000-000000000001",
        responsibleWorkerId: "b1000000-0000-4000-8000-000000000001",
        shipmentId: "42000000-0000-4000-8000-000000000001",
      })
      .set("Authorization", "Bearer valid-token")
      .expect(200)
      .expect({ items: [], page: 2, pageSize: 10, total: 14, totalPages: 2 });

    expect(management.listShipments.mock.calls).toContainEqual([
      ACTIVE_PROFILE.organizationId,
      expect.objectContaining({
        page: 2,
        pageSize: 10,
        plantId: "31000000-0000-4000-8000-000000000001",
        productionLineId: "32000000-0000-4000-8000-000000000001",
        supplierId: "35000000-0000-4000-8000-000000000001",
        responsibleWorkerId: "b1000000-0000-4000-8000-000000000001",
        shipmentId: "42000000-0000-4000-8000-000000000001",
      }),
    ]);
  });

  it("reserves management queries exclusively for JEFE_EMPRESA", async () => {
    await request(httpServer)
      .get(
        `/api/v1/organizations/${ACTIVE_PROFILE.organizationId}/management/operation-lines`,
      )
      .expect(401);

    profiles.findByAuthUserId.mockResolvedValueOnce({
      ...ACTIVE_PROFILE,
      role: { ...ACTIVE_PROFILE.role, code: "ADMINISTRADOR" },
      permissions: ["reports.read"],
    });

    await request(httpServer)
      .get(
        `/api/v1/organizations/${ACTIVE_PROFILE.organizationId}/management/operation-lines`,
      )
      .set("Authorization", "Bearer valid-token")
      .expect(403);

    expect(management.listOperationLines.mock.calls).toHaveLength(0);
  });

  it("returns an opaque management freshness cursor and detects advancement", async () => {
    const first = await request(httpServer)
      .get(
        `/api/v1/organizations/${ACTIVE_PROFILE.organizationId}/management/freshness`,
      )
      .set("Authorization", "Bearer valid-token")
      .expect(200);
    const firstBody = first.body as {
      cursor: string;
      hasChanges: boolean;
      effectiveAtUtc: string | null;
      pollAfterSeconds: number;
    };

    expect(firstBody).toMatchObject({
      hasChanges: false,
      effectiveAtUtc: "2026-10-13T06:00:00.000Z",
      pollAfterSeconds: 30,
    });
    const previousCursor = Buffer.from("v1:41", "utf8").toString("base64url");
    await request(httpServer)
      .get(
        `/api/v1/organizations/${ACTIVE_PROFILE.organizationId}/management/freshness`,
      )
      .query({ cursor: previousCursor })
      .set("Authorization", "Bearer valid-token")
      .expect(200)
      .expect((response) => {
        const body = response.body as Record<string, unknown>;
        expect(body).toMatchObject({
          cursor: firstBody.cursor,
          hasChanges: true,
        });
      });
  });

  it("rejects invalid management ranges and page limits", async () => {
    await request(httpServer)
      .get(
        `/api/v1/organizations/${ACTIVE_PROFILE.organizationId}/management/shipments`,
      )
      .query({
        pageSize: 101,
        fromUtc: "2026-10-08T00:00:00.000Z",
        toUtc: "2026-10-01T00:00:00.000Z",
      })
      .set("Authorization", "Bearer valid-token")
      .expect(400);

    await request(httpServer)
      .get(
        `/api/v1/organizations/${ACTIVE_PROFILE.organizationId}/management/shipments`,
      )
      .query({
        fromUtc: "2026-10-08T00:00:00.000Z",
        toUtc: "2026-10-01T00:00:00.000Z",
      })
      .set("Authorization", "Bearer valid-token")
      .expect(400);

    expect(management.listShipments.mock.calls).toHaveLength(0);
  });

  it("returns versioned attendance hours with Costa Rica date boundaries", async () => {
    attendance.listHistory.mockResolvedValueOnce([
      {
        id: "61000000-0000-4000-8000-000000000001",
        organizationId: ACTIVE_PROFILE.organizationId,
        plantId: "31000000-0000-4000-8000-000000000001",
        stationId: "34000000-0000-4000-8000-000000000001",
        workerId: "b1000000-0000-4000-8000-000000000001",
        workerName: "Operario ficticio",
        clientSequence: "1",
        eventType: "CHECK_IN",
        occurredAtUtc: "2026-10-20T12:00:00.000Z",
        recordedAtUtc: "2026-10-20T12:00:00.000Z",
        confirmedAtUtc: "2026-10-20T12:00:01.000Z",
        syncStatus: "SYNCHRONIZED",
        correctedByProfileId: null,
        correctedByDisplayName: null,
        correctionReason: null,
        relatedEventId: null,
      },
      {
        id: "61000000-0000-4000-8000-000000000002",
        organizationId: ACTIVE_PROFILE.organizationId,
        plantId: "31000000-0000-4000-8000-000000000001",
        stationId: "34000000-0000-4000-8000-000000000001",
        workerId: "b1000000-0000-4000-8000-000000000001",
        workerName: "Operario ficticio",
        clientSequence: "2",
        eventType: "CHECK_OUT",
        occurredAtUtc: "2026-10-20T20:00:00.000Z",
        recordedAtUtc: "2026-10-20T20:00:00.000Z",
        confirmedAtUtc: "2026-10-20T20:00:01.000Z",
        syncStatus: "SYNCHRONIZED",
        correctedByProfileId: null,
        correctedByDisplayName: null,
        correctionReason: null,
        relatedEventId: null,
      },
    ]);

    const response = await request(httpServer)
      .get(
        `/api/v1/organizations/${ACTIVE_PROFILE.organizationId}/management/attendance/hours`,
      )
      .query({ fromDate: "2026-10-20", toDate: "2026-10-20" })
      .set("Authorization", "Bearer valid-token")
      .expect(200);

    expect(response.body).toMatchObject({
      version: "attendance-hours-v1",
      timezone: "America/Costa_Rica",
      period: {
        fromUtc: "2026-10-20T06:00:00.000Z",
        toUtc: "2026-10-21T06:00:00.000Z",
      },
      summary: {
        confirmedShiftCount: 1,
        openShiftCount: 0,
        totalConfirmedMinutes: 480,
      },
    });
    expect(attendance.listHistory.mock.calls).toContainEqual([
      ACTIVE_PROFILE.organizationId,
      {
        plantId: undefined,
        workerId: undefined,
      },
    ]);
  });

  it("rejects attendance dates that do not exist", async () => {
    await request(httpServer)
      .get(
        `/api/v1/organizations/${ACTIVE_PROFILE.organizationId}/management/attendance/hours`,
      )
      .query({ fromDate: "2026-02-30", toDate: "2026-03-01" })
      .set("Authorization", "Bearer valid-token")
      .expect(422);
    expect(attendance.listHistory.mock.calls).toHaveLength(0);
  });

  it("reports gold coverage without excluding a recorded zero", async () => {
    gold.listShipmentFacts.mockResolvedValueOnce([
      {
        shipmentId: "42000000-0000-4000-8000-000000000001",
        supplierId: "35000000-0000-4000-8000-000000000001",
        supplierName: "Proveedor ficticio",
        cajuelaTotal: 100,
        hasGoldResult: true,
        goldAmountGrams: 0,
      },
      {
        shipmentId: "42000000-0000-4000-8000-000000000002",
        supplierId: "35000000-0000-4000-8000-000000000001",
        supplierName: "Proveedor ficticio",
        cajuelaTotal: 150,
        hasGoldResult: false,
        goldAmountGrams: null,
      },
    ]);

    const response = await request(httpServer)
      .get(
        `/api/v1/organizations/${ACTIVE_PROFILE.organizationId}/management/gold-summary`,
      )
      .set("Authorization", "Bearer valid-token")
      .expect(200);

    expect(response.body).toMatchObject({
      totalShipments: 2,
      registeredShipments: 1,
      excludedShipments: 1,
      totalGoldGrams: 0,
    });
  });

  it("records an initial shipment gold total and audits the mutation", async () => {
    management.findShipment.mockResolvedValueOnce(managementShipment());
    gold.createResult.mockImplementationOnce((input) =>
      Promise.resolve({
        id: input.id,
        organizationId: input.organizationId,
        shipmentId: input.shipmentId,
        amountGrams: input.amountGrams,
        unitCode: "g",
        recordedAtUtc: input.recordedAtUtc,
        recordedByProfileId: input.recordedByProfileId,
        recordedByDisplayName: input.recordedByDisplayName,
        supersedesResultId: input.supersedesResultId,
        correctionReason: input.correctionReason,
      }),
    );

    const response = await request(httpServer)
      .post(
        `/api/v1/organizations/${ACTIVE_PROFILE.organizationId}/management/shipments/42000000-0000-4000-8000-000000000001/gold-results`,
      )
      .set("Authorization", "Bearer valid-token")
      .send({ amountGrams: 0 })
      .expect(201);

    expect(response.body).toMatchObject({ amountGrams: 0, unitCode: "g" });
    expect(gold.createResult.mock.calls[0]?.[0]).toMatchObject({
      amountGrams: 0,
      supersedesResultId: null,
      recordedByProfileId: ACTIVE_PROFILE.id,
    });
    expect(
      auditEvents.insert.mock.calls.some(
        ([event]) =>
          event.action === "business.mutation" &&
          event.entityId === "42000000-0000-4000-8000-000000000001",
      ),
    ).toBe(true);
  });

  it("does not turn an empty gold amount into zero", async () => {
    await request(httpServer)
      .post(
        `/api/v1/organizations/${ACTIVE_PROFILE.organizationId}/management/shipments/42000000-0000-4000-8000-000000000001/gold-results`,
      )
      .set("Authorization", "Bearer valid-token")
      .send({ amountGrams: "" })
      .expect(400);

    expect(gold.createResult.mock.calls).toHaveLength(0);
  });

  it("exposes the audited inventory entry to exit to reversal to adjustment flow", async () => {
    inventory.createMovement.mockImplementation((input) =>
      Promise.resolve({
        ...input,
        responsibleWorkerId: input.responsibleWorkerId ?? null,
        reason: input.reason ?? null,
        destination: input.destination ?? null,
        notes: input.notes ?? null,
        relatedMovementId: input.relatedMovementId ?? null,
      }),
    );

    const base = `/api/v1/organizations/${ACTIVE_PROFILE.organizationId}/inventory/plants/31000000-0000-4000-8000-000000000001`;
    const entry = await request(httpServer)
      .post(`${base}/movements`)
      .set("Authorization", "Bearer valid-token")
      .send({
        inventoryItemId: "77200000-0000-4000-8000-000000000001",
        unitId: "77100000-0000-4000-8000-000000000001",
        movementType: "ENTRY",
        quantity: 10,
        occurredAtUtc: "2026-10-26T18:00:00.000Z",
      })
      .expect(201);
    const exit = await request(httpServer)
      .post(`${base}/movements`)
      .set("Authorization", "Bearer valid-token")
      .send({
        inventoryItemId: "77200000-0000-4000-8000-000000000001",
        unitId: "77100000-0000-4000-8000-000000000001",
        movementType: "EXIT",
        quantity: 4,
        occurredAtUtc: "2026-10-26T18:01:00.000Z",
      })
      .expect(201);
    const exitBody = exit.body as InventoryMovement;
    inventory.findMovement.mockResolvedValueOnce(exitBody);
    const reversal = await request(httpServer)
      .post(`${base}/movements/${exitBody.id}/reversal`)
      .set("Authorization", "Bearer valid-token")
      .send({
        reason: "Salida registrada por error",
        occurredAtUtc: "2026-10-26T18:02:00.000Z",
      })
      .expect(201);
    const adjustment = await request(httpServer)
      .post(`${base}/adjustments`)
      .set("Authorization", "Bearer valid-token")
      .send({
        inventoryItemId: "77200000-0000-4000-8000-000000000001",
        unitId: "77100000-0000-4000-8000-000000000001",
        quantityDelta: -1,
        reason: "Diferencia confirmada en conteo",
        occurredAtUtc: "2026-10-26T18:03:00.000Z",
      })
      .expect(201);

    expect(entry.body).toMatchObject({
      movementType: "ENTRY",
      quantityDelta: 10,
    });
    expect(exit.body).toMatchObject({
      movementType: "EXIT",
      quantityDelta: -4,
    });
    expect(reversal.body).toMatchObject({
      movementType: "REVERSAL",
      quantityDelta: 4,
      relatedMovementId: exitBody.id,
    });
    expect(adjustment.body).toMatchObject({
      movementType: "ADJUSTMENT",
      quantityDelta: -1,
    });
    expect(inventory.createMovement.mock.calls).toHaveLength(4);
  });

  it("rejects inventory access without the inventory permission", async () => {
    profiles.findByAuthUserId.mockResolvedValueOnce({
      ...ACTIVE_PROFILE,
      permissions: ACTIVE_PROFILE.permissions.filter(
        (permission) => permission !== "inventory.manage",
      ),
    });

    await request(httpServer)
      .get(
        `/api/v1/organizations/${ACTIVE_PROFILE.organizationId}/inventory/item-types`,
      )
      .set("Authorization", "Bearer valid-token")
      .expect(403);

    expect(inventory.listCatalog.mock.calls).toHaveLength(0);
  });

  it("accepts a versioned sync batch for an assigned plant manager", async () => {
    profiles.findByAuthUserId.mockResolvedValueOnce({
      ...ACTIVE_PROFILE,
      role: { ...ACTIVE_PROFILE.role, code: "JEFE_PLANTA" },
      permissions: ["station.open"],
    });
    sync.findPushStationScope.mockResolvedValueOnce({ permissionVersion: 1 });
    sync.ingestItem.mockImplementationOnce((input) =>
      Promise.resolve({
        outboxMessageId: input.item.outboxMessageId,
        stationSequence: input.item.stationSequence,
        status: "APPLIED",
        receiptId: "49000000-0000-4000-8000-000000000001",
        code: "APPLIED",
        processedAtUtc: "2026-09-15T18:10:00.000Z",
      }),
    );

    const response = await request(httpServer)
      .post(
        `/api/v1/organizations/${ACTIVE_PROFILE.organizationId}/stations/34000000-0000-4000-8000-000000000001/sync/push`,
      )
      .set("Authorization", "Bearer valid-token")
      .send(syncEnvelope())
      .expect(200);

    expect(response.body).toMatchObject({
      contractVersion: 1,
      results: [{ status: "APPLIED", code: "APPLIED" }],
    });
  });
});

function administratorAccount() {
  return {
    id: "a1000000-0000-4000-8000-000000000099",
    organizationId: ACTIVE_PROFILE.organizationId,
    displayName: "Administrador ficticio",
    preferredLocale: "es" as const,
    accountStatus: "ACTIVE" as const,
    roleCode: "ADMINISTRADOR" as const,
    provisioningMethod: "EMAIL_INVITATION" as const,
    statusReason: null,
    isActive: true,
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
  };
}

function plantManagerAccount() {
  return {
    id: "a1000000-0000-4000-8000-000000000098",
    organizationId: ACTIVE_PROFILE.organizationId,
    displayName: "Jefe de planta nuevo",
    preferredLocale: "es" as const,
    accountStatus: "PENDING_APPROVAL" as const,
    roleCode: "JEFE_PLANTA" as const,
    provisioningMethod: "DIRECT" as const,
    statusReason: null,
    isActive: true,
    createdAt: "2026-10-18T12:00:00.000Z",
    updatedAt: "2026-10-18T12:00:00.000Z",
  };
}

function managementShipment() {
  return {
    organizationId: ACTIVE_PROFILE.organizationId,
    plantId: "31000000-0000-4000-8000-000000000001",
    stationId: "34000000-0000-4000-8000-000000000001",
    stationName: "Estación ficticia",
    shipmentId: "42000000-0000-4000-8000-000000000001",
    feedCycleId: "41000000-0000-4000-8000-000000000001",
    productionLineId: "32000000-0000-4000-8000-000000000001",
    productionLineName: "Línea 1",
    productionLineOrder: 1,
    supplierId: "35000000-0000-4000-8000-000000000001",
    supplierName: "Proveedor ficticio",
    responsibleWorkerId: null,
    responsibleWorkerName: null,
    startedAtUtc: "2026-10-01T12:00:00.000Z",
    cajuelaTotal: 100,
    sweepCount: 1,
    sweptCajuelas: 100,
    cajuelasSinceLastSweep: 0,
    nextSweepAt: 350,
    sweepPending: false,
    lastActivityAtUtc: "2026-10-01T18:00:00.000Z",
    status: "COMPLETED" as const,
    completedAtUtc: "2026-10-01T18:00:00.000Z",
    goldResultId: null,
    goldAmountGrams: null,
    goldUnitCode: null,
    goldRecordedAtUtc: null,
    goldRecordedByProfileId: null,
    goldRevisionCount: null,
    hasGoldResult: false,
  };
}

function inventoryItem() {
  return {
    id: "77200000-0000-4000-8000-000000000001",
    organizationId: ACTIVE_PROFILE.organizationId,
    plantId: "31000000-0000-4000-8000-000000000001",
    itemTypeId: "77000000-0000-4000-8000-000000000001",
    unitId: "77100000-0000-4000-8000-000000000001",
    name: "Martillo ficticio",
    isActive: true,
    deactivatedAt: null,
    createdAt: "2026-10-26T17:00:00.000Z",
    updatedAt: "2026-10-26T17:00:00.000Z",
  };
}

function syncEnvelope() {
  return {
    contractVersion: 1,
    batchId: "40000000-0000-4000-8000-000000000001",
    sentAtUtc: "2026-09-15T18:10:00.000Z",
    client: { application: "desktop", applicationVersion: "0.1.0" },
    scope: {
      organizationId: ACTIVE_PROFILE.organizationId,
      plantId: "31000000-0000-4000-8000-000000000001",
      stationId: "34000000-0000-4000-8000-000000000001",
    },
    items: [
      {
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
          validatedAtUtc: "2026-09-15T17:55:00.000Z",
          offlineValidUntilUtc: "2026-09-16T17:55:00.000Z",
          stateAtCapture: "VALID",
        },
        payload: {
          organizationId: ACTIVE_PROFILE.organizationId,
          plantId: "31000000-0000-4000-8000-000000000001",
          stationId: "34000000-0000-4000-8000-000000000001",
          productionLineId: "32000000-0000-4000-8000-000000000001",
          inputLineSlot: 1,
          supplierId: "35000000-0000-4000-8000-000000000001",
          responsibleWorkerId: "b1000000-0000-4000-8000-000000000001",
          startedAtUtc: "2026-09-15T18:00:00.000Z",
        },
      },
    ],
  };
}
