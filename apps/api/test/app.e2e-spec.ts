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
  WORKERS_REPOSITORY,
  type WorkersRepository,
} from "../src/workers/workers.contracts";
import {
  STATION_REPOSITORY,
  type StationRepository,
} from "../src/station/station.contracts";

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
    "administrators.govern",
    "administrators.create",
    "administrators.permissions.manage",
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
  let accounts: jest.Mocked<AccountsRepository>;
  let stations: jest.Mocked<StationRepository>;

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
      expire: jest.fn().mockResolvedValue(0),
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
      listAdministratorPermissions: jest.fn().mockResolvedValue([]),
      replaceAdministratorPermissions: jest.fn().mockResolvedValue(undefined),
    };
    stations = {
      getSnapshot: jest.fn(),
      recordPinAttempt: jest.fn(),
      setPinVerifier: jest.fn(),
      resetPinBlocks: jest.fn(),
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
      .overrideProvider(ACCOUNTS_REPOSITORY)
      .useValue(accounts)
      .overrideProvider(STATION_REPOSITORY)
      .useValue(stations)
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
    accounts.replaceAdministratorPermissions.mockClear();
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
});

function administratorAccount() {
  return {
    id: "a1000000-0000-4000-8000-000000000099",
    organizationId: ACTIVE_PROFILE.organizationId,
    displayName: "Administrador ficticio",
    preferredLocale: "es" as const,
    accountStatus: "ACTIVE" as const,
    roleCode: "ADMINISTRADOR" as const,
    statusReason: null,
    isActive: true,
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
  };
}
