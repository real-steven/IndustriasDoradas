import "reflect-metadata";

import {
  type ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

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

  beforeEach(() => {
    guard = new AuthorizationGuard(new Reflector());
    Reflect.deleteMetadata(REQUIRED_ROLES_KEY, testHandler);
    Reflect.deleteMetadata(REQUIRED_PERMISSIONS_KEY, testHandler);
    Reflect.deleteMetadata(ORGANIZATION_PARAM_KEY, testHandler);
  });

  it("allows an authenticated request when no additional policy is declared", () => {
    const { context } = createContext(AUTH);

    expect(guard.canActivate(context)).toBe(true);
  });

  it("rejects a role outside the declared policy", () => {
    Reflect.defineMetadata(REQUIRED_ROLES_KEY, ["ADMINISTRADOR"], testHandler);
    const { context } = createContext(AUTH);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it("rejects a missing permission", () => {
    Reflect.defineMetadata(
      REQUIRED_PERMISSIONS_KEY,
      ["administrators.govern", "reports.read"],
      testHandler,
    );
    const { context } = createContext(AUTH);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it("rejects a different organization route parameter", () => {
    Reflect.defineMetadata(
      ORGANIZATION_PARAM_KEY,
      "organizationId",
      testHandler,
    );
    const { context } = createContext(AUTH, {
      organizationId: "90000000-0000-4000-8000-000000000001",
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it("allows matching role, permissions and organization", () => {
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

    expect(guard.canActivate(context)).toBe(true);
  });

  it("rejects a protected policy without authentication context", () => {
    Reflect.defineMetadata(REQUIRED_ROLES_KEY, ["JEFE_EMPRESA"], testHandler);
    const { context } = createContext();

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});

function createContext(
  auth?: AuthenticatedContext,
  params: Record<string, string> = {},
): { context: ExecutionContext; request: AuthenticatedRequest } {
  const request = { auth, params } as unknown as AuthenticatedRequest;
  const context = {
    getClass: () => TestController,
    getHandler: () => testHandler,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { context, request };
}

class TestController {}
function testHandler(): void {}
