import {
  type ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { AuditTrailService } from "../audit/audit-trail.service";
import type {
  AccessTokenVerifier,
  AuthorizedProfile,
  ProfileRepository,
  VerifiedAccessToken,
} from "./auth.contracts";
import { AuthenticationGuard } from "./authentication.guard";
import type { AuthenticatedRequest } from "./authenticated-request";

const TOKEN = "signed-access-token";
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
  permissions: ["reports.read"],
};

describe("AuthenticationGuard", () => {
  let verifier: jest.Mocked<AccessTokenVerifier>;
  let profiles: jest.Mocked<ProfileRepository>;
  let auditTrail: jest.Mocked<
    Pick<AuditTrailService, "record" | "recordBestEffort">
  >;
  let guard: AuthenticationGuard;

  beforeEach(() => {
    verifier = { verify: jest.fn() };
    profiles = { findByAuthUserId: jest.fn() };
    auditTrail = {
      record: jest.fn().mockResolvedValue(undefined),
      recordBestEffort: jest.fn().mockResolvedValue(undefined),
    };
    guard = new AuthenticationGuard(
      new Reflector(),
      verifier,
      profiles,
      auditTrail as unknown as AuditTrailService,
    );
  });

  it("rejects a missing authorization header", async () => {
    const { context } = createContext();

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(verifier.verify.mock.calls).toHaveLength(0);
    expect(auditTrail.recordBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        result: "REJECTED",
        reasonCode: "AUTHENTICATION_REQUIRED",
      }),
    );
  });

  it("rejects a malformed authorization header", async () => {
    const { context } = createContext("Basic credentials");

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(verifier.verify.mock.calls).toHaveLength(0);
    expect(auditTrail.recordBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        result: "REJECTED",
        reasonCode: "AUTHORIZATION_HEADER_INVALID",
      }),
    );
  });

  it("propagates rejection of an invalid token", async () => {
    verifier.verify.mockRejectedValue(
      new UnauthorizedException("Invalid access token"),
    );
    const { context } = createContext(`Bearer ${TOKEN}`);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(auditTrail.recordBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        result: "REJECTED",
        reasonCode: "ACCESS_TOKEN_INVALID_OR_EXPIRED",
      }),
    );
  });

  it("rejects an authenticated account without a profile", async () => {
    verifier.verify.mockResolvedValue(VERIFIED_TOKEN);
    profiles.findByAuthUserId.mockResolvedValue(null);
    const { context } = createContext(`Bearer ${TOKEN}`);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(auditTrail.recordBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        result: "REJECTED",
        reasonCode: "APPLICATION_PROFILE_NOT_FOUND",
      }),
    );
  });

  it.each([
    ["pending", { ...ACTIVE_PROFILE, accountStatus: "PENDING_APPROVAL" }],
    ["suspended", { ...ACTIVE_PROFILE, accountStatus: "SUSPENDED" }],
    ["deactivated", { ...ACTIVE_PROFILE, isActive: false }],
    [
      "inactive role",
      { ...ACTIVE_PROFILE, role: { ...ACTIVE_PROFILE.role, isActive: false } },
    ],
  ] as const)("rejects a %s profile", async (_label, profile) => {
    verifier.verify.mockResolvedValue(VERIFIED_TOKEN);
    profiles.findByAuthUserId.mockResolvedValue(profile);
    const { context } = createContext(`Bearer ${TOKEN}`);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(auditTrail.recordBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        result: "REJECTED",
        reasonCode: "ACCOUNT_INACTIVE",
      }),
    );
  });

  it("attaches the current token and active profile", async () => {
    verifier.verify.mockResolvedValue(VERIFIED_TOKEN);
    profiles.findByAuthUserId.mockResolvedValue(ACTIVE_PROFILE);
    const { context, request } = createContext(`Bearer ${TOKEN}`);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.auth).toEqual({
      token: VERIFIED_TOKEN,
      profile: ACTIVE_PROFILE,
    });
    expect(auditTrail.record).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ACTIVE_PROFILE.organizationId,
        result: "SUCCEEDED",
      }),
    );
  });
});

function createContext(authorization?: string): {
  context: ExecutionContext;
  request: AuthenticatedRequest;
} {
  const request = {
    headers: authorization === undefined ? {} : { authorization },
    params: {},
    method: "GET",
    path: "/api/v1/auth/session",
    correlationId: "a9000000-0000-4000-8000-000000000001",
  } as unknown as AuthenticatedRequest;
  const context = {
    getClass: () => TestController,
    getHandler: () => testHandler,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { context, request };
}

class TestController {}
function testHandler(): void {}
