import "reflect-metadata";

import {
  type ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { AuditTrailService } from "../audit/audit-trail.service";
import type { AuthenticatedContext } from "./auth.contracts";
import {
  ORGANIZATION_PARAM_KEY,
  REQUIRED_PERMISSIONS_KEY,
  REQUIRED_ROLES_KEY,
} from "./auth.metadata";
import type { AuthenticatedRequest } from "./authenticated-request";
import { AuthorizationGuard } from "./authorization.guard";

const ORGANIZATION_ID = "30000000-0000-4000-8000-000000000001";
const AUTH: AuthenticatedContext = {
  token: {
    subject: "a0000000-0000-4000-8000-000000000001",
    sessionId: "a0000000-0000-4000-8000-000000000002",
    email: "manager@example.invalid",
    issuedAt: 1_700_000_000,
    expiresAt: 1_700_003_600,
  },
  profile: {
    id: "a1000000-0000-4000-8000-000000000001",
    organizationId: ORGANIZATION_ID,
    authUserId: "a0000000-0000-4000-8000-000000000001",
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
  },
};

describe("AuthorizationGuard", () => {
  let guard: AuthorizationGuard;
  let auditTrail: jest.Mocked<
    Pick<AuditTrailService, "record" | "recordBestEffort">
  >;

  beforeEach(() => {
    auditTrail = {
      record: jest.fn().mockResolvedValue(undefined),
      recordBestEffort: jest.fn().mockResolvedValue(undefined),
    };
    guard = new AuthorizationGuard(
      new Reflector(),
      auditTrail as unknown as AuditTrailService,
    );
    Reflect.deleteMetadata(REQUIRED_ROLES_KEY, testHandler);
    Reflect.deleteMetadata(REQUIRED_PERMISSIONS_KEY, testHandler);
    Reflect.deleteMetadata(ORGANIZATION_PARAM_KEY, testHandler);
  });

  it("allows an authenticated request when no additional policy is declared", async () => {
    const { context } = createContext(AUTH);

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("rejects a role outside the declared policy", async () => {
    Reflect.defineMetadata(REQUIRED_ROLES_KEY, ["ADMINISTRADOR"], testHandler);
    const { context } = createContext(AUTH);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(auditTrail.recordBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({ reasonCode: "ROLE_NOT_AUTHORIZED" }),
    );
  });

  it("rejects a missing permission", async () => {
    Reflect.defineMetadata(
      REQUIRED_PERMISSIONS_KEY,
      ["administrators.govern", "reports.read"],
      testHandler,
    );
    const { context } = createContext(AUTH);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(auditTrail.recordBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({ reasonCode: "PERMISSION_NOT_AUTHORIZED" }),
    );
  });

  it("rejects a different organization route parameter", async () => {
    Reflect.defineMetadata(
      ORGANIZATION_PARAM_KEY,
      "organizationId",
      testHandler,
    );
    const { context } = createContext(AUTH, {
      organizationId: "90000000-0000-4000-8000-000000000001",
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(auditTrail.recordBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({ reasonCode: "ORGANIZATION_NOT_AUTHORIZED" }),
    );
  });

  it("allows matching role, permissions and organization", async () => {
    Reflect.defineMetadata(REQUIRED_ROLES_KEY, ["JEFE_EMPRESA"], testHandler);
    Reflect.defineMetadata(
      REQUIRED_PERMISSIONS_KEY,
      ["reports.read"],
      testHandler,
    );
    Reflect.defineMetadata(
      ORGANIZATION_PARAM_KEY,
      "organizationId",
      testHandler,
    );
    const { context } = createContext(AUTH, {
      organizationId: ORGANIZATION_ID,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("rejects a protected policy without authentication context", async () => {
    Reflect.defineMetadata(REQUIRED_ROLES_KEY, ["JEFE_EMPRESA"], testHandler);
    const { context } = createContext();

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

function createContext(
  auth?: AuthenticatedContext,
  params: Record<string, string> = {},
): { context: ExecutionContext; request: AuthenticatedRequest } {
  const request = {
    auth,
    params,
    method: "GET",
    path: "/api/v1/test",
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
