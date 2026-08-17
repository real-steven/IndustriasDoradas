export const ROLE_CODES = [
  "JEFE_EMPRESA",
  "ADMINISTRADOR",
  "JEFE_PLANTA",
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];
export type PreferredLocale = "es" | "en";
export type AccountStatus = "PENDING_APPROVAL" | "ACTIVE" | "SUSPENDED";

export interface VerifiedAccessToken {
  subject: string;
  sessionId: string;
  email: string;
  issuedAt: number;
  expiresAt: number;
}

export interface AuthorizedProfile {
  id: string;
  organizationId: string;
  authUserId: string;
  displayName: string;
  preferredLocale: PreferredLocale;
  accountStatus: AccountStatus;
  isActive: boolean;
  role: {
    id: string;
    code: RoleCode;
    isActive: boolean;
  };
  permissions: readonly string[];
}

export interface AuthenticatedContext {
  token: VerifiedAccessToken;
  profile: AuthorizedProfile;
}

export interface AccessTokenVerifier {
  verify(token: string): Promise<VerifiedAccessToken>;
}

export interface ProfileRepository {
  findByAuthUserId(authUserId: string): Promise<AuthorizedProfile | null>;
}

export const ACCESS_TOKEN_VERIFIER = Symbol("ACCESS_TOKEN_VERIFIER");
export const PROFILE_REPOSITORY = Symbol("PROFILE_REPOSITORY");
