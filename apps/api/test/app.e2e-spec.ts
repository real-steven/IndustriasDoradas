import { type INestApplication, UnauthorizedException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Server } from "node:http";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { configureApplication } from "../src/app.setup";
import {
  ACCESS_TOKEN_VERIFIER,
  PROFILE_REPOSITORY,
  type AccessTokenVerifier,
  type AuthorizedProfile,
  type ProfileRepository,
  type VerifiedAccessToken,
} from "../src/auth/auth.contracts";

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
  permissions: ["reports.read", "audit.read_redacted"],
};

describe("API smoke (e2e)", () => {
  let app: INestApplication;
  let httpServer: Server;
  let tokenVerifier: jest.Mocked<AccessTokenVerifier>;
  let profiles: jest.Mocked<ProfileRepository>;

  beforeAll(async () => {
    tokenVerifier = { verify: jest.fn() };
    profiles = { findByAuthUserId: jest.fn() };
    const testingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ACCESS_TOKEN_VERIFIER)
      .useValue(tokenVerifier)
      .overrideProvider(PROFILE_REPOSITORY)
      .useValue(profiles)
      .compile();

    app = testingModule.createNestApplication();
    configureApplication(app);
    await app.init();
    httpServer = app.getHttpServer() as Server;
  });

  beforeEach(() => {
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

  it("rejects a protected endpoint without a token", async () => {
    const response = await request(httpServer)
      .get("/api/v1/auth/session")
      .expect(401);

    expect(response.body).toMatchObject({
      statusCode: 401,
      code: "HTTP_401",
      message: "Authentication required",
    });
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
      issuedAt: "2023-11-14T22:13:20.000Z",
      expiresAt: "2023-11-14T23:13:20.000Z",
    });
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
      permissions: ["reports.read", "audit.read_redacted"],
    });
  });
});
