import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { JWTVerifyGetKey } from "jose";

import type {
  AccessTokenVerifier,
  VerifiedAccessToken,
} from "./auth.contracts";
import type { EnvironmentVariables } from "../config/environment";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

@Injectable()
export class SupabaseJwtVerifier implements AccessTokenVerifier {
  private readonly issuer: string;
  private readonly jwksUrl: URL;
  private keySetPromise?: Promise<JWTVerifyGetKey>;

  constructor(
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {
    const supabaseUrl = new URL(
      this.config.get("SUPABASE_URL", { infer: true }),
    );
    this.issuer = new URL(
      "auth/v1",
      ensureTrailingSlash(supabaseUrl),
    ).href.replace(/\/$/u, "");
    this.jwksUrl = new URL(`${this.issuer}/.well-known/jwks.json`);
  }

  async verify(token: string): Promise<VerifiedAccessToken> {
    try {
      const { jwtVerify } = await import("jose");
      const { payload } = await jwtVerify(token, await this.getKeySet(), {
        algorithms: ["ES256", "RS256"],
        audience: "authenticated",
        issuer: this.issuer,
        requiredClaims: [
          "sub",
          "exp",
          "iat",
          "session_id",
          "role",
          "email",
          "is_anonymous",
        ],
      });

      if (
        payload.role !== "authenticated" ||
        payload.is_anonymous !== false ||
        typeof payload.sub !== "string" ||
        !UUID_PATTERN.test(payload.sub) ||
        typeof payload.session_id !== "string" ||
        !UUID_PATTERN.test(payload.session_id) ||
        typeof payload.email !== "string" ||
        payload.email.trim() === "" ||
        typeof payload.iat !== "number" ||
        typeof payload.exp !== "number"
      ) {
        throw new Error("Invalid authenticated user claims");
      }

      return {
        subject: payload.sub,
        sessionId: payload.session_id,
        email: payload.email,
        issuedAt: payload.iat,
        expiresAt: payload.exp,
      };
    } catch {
      throw new UnauthorizedException("Invalid or expired access token");
    }
  }

  private async getKeySet(): Promise<JWTVerifyGetKey> {
    this.keySetPromise ??= import("jose").then(({ createRemoteJWKSet }) =>
      createRemoteJWKSet(this.jwksUrl, {
        cacheMaxAge: 10 * 60 * 1000,
        cooldownDuration: 30 * 1000,
        timeoutDuration: 5 * 1000,
      }),
    );

    return this.keySetPromise;
  }
}

function ensureTrailingSlash(url: URL): URL {
  const normalized = new URL(url);
  normalized.pathname = `${normalized.pathname.replace(/\/$/u, "")}/`;
  return normalized;
}
