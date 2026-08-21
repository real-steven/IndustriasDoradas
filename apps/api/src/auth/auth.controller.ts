import { Controller, Get } from "@nestjs/common";

import type { AuthenticatedContext } from "./auth.contracts";
import { CurrentAuth } from "./current-auth.decorator";

interface SessionResponse {
  userId: string;
  sessionId: string;
  profileId: string;
  organizationId: string;
  role: string;
  permissions: readonly string[];
  issuedAt: string;
  expiresAt: string;
}

interface ProfileResponse {
  id: string;
  organizationId: string;
  displayName: string;
  preferredLocale: "es" | "en";
  accountStatus: "ACTIVE";
  role: string;
  permissions: readonly string[];
}

@Controller({ path: "auth", version: "1" })
export class AuthController {
  @Get("session")
  getSession(@CurrentAuth() auth: AuthenticatedContext): SessionResponse {
    return {
      userId: auth.token.subject,
      sessionId: auth.token.sessionId,
      profileId: auth.profile.id,
      organizationId: auth.profile.organizationId,
      role: auth.profile.role.code,
      permissions: auth.profile.permissions,
      issuedAt: new Date(auth.token.issuedAt * 1000).toISOString(),
      expiresAt: new Date(auth.token.expiresAt * 1000).toISOString(),
    };
  }

  @Get("profile")
  getProfile(@CurrentAuth() auth: AuthenticatedContext): ProfileResponse {
    return {
      id: auth.profile.id,
      organizationId: auth.profile.organizationId,
      displayName: auth.profile.displayName,
      preferredLocale: auth.profile.preferredLocale,
      accountStatus: "ACTIVE",
      role: auth.profile.role.code,
      permissions: auth.profile.permissions,
    };
  }
}
