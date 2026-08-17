import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { KeyLike } from "jose";

import { SupabaseJwtVerifier } from "./supabase-jwt-verifier";
import type { EnvironmentVariables } from "../config/environment";

const USER_ID = "a0000000-0000-4000-8000-000000000001";
const SESSION_ID = "a0000000-0000-4000-8000-000000000002";

interface TokenOptions {
  issuer?: string;
  audience?: string;
  subject?: string;
  sessionId?: string | null;
  role?: string;
  email?: string;
  isAnonymous?: boolean;
  issuedAt?: number;
  expiresAt?: number;
  privateKey?: KeyLike;
}

describe("SupabaseJwtVerifier", () => {
  let server: Server | undefined;
  let privateKey: KeyLike;
  let otherPrivateKey: KeyLike;
  let issuer: string;
  let verifier: SupabaseJwtVerifier;

  beforeAll(async () => {
    const { exportJWK, generateKeyPair } = await import("jose");
    const keyPair = await generateKeyPair("ES256");
    const otherKeyPair = await generateKeyPair("ES256");
    privateKey = keyPair.privateKey;
    otherPrivateKey = otherKeyPair.privateKey;
    const publicKey = await exportJWK(keyPair.publicKey);

    const localServer = createServer((request, response) => {
      if (request.url !== "/auth/v1/.well-known/jwks.json") {
        response.writeHead(404).end();
        return;
      }

      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          keys: [{ ...publicKey, alg: "ES256", kid: "test-key", use: "sig" }],
        }),
      );
    });
    server = localServer;
    await new Promise<void>((resolve) => {
      localServer.listen(0, "127.0.0.1", resolve);
    });

    const address = localServer.address() as AddressInfo;
    const supabaseUrl = `http://127.0.0.1:${address.port}`;
    issuer = `${supabaseUrl}/auth/v1`;
    const config = new ConfigService<EnvironmentVariables, true>({
      NODE_ENV: "test",
      PORT: 3100,
      SUPABASE_URL: supabaseUrl,
      SUPABASE_SECRET_KEY: "test-only-backend-key-not-a-real-secret",
    });
    verifier = new SupabaseJwtVerifier(config);
  });

  afterAll(async () => {
    const activeServer = server;
    if (activeServer === undefined) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      activeServer.close((error) => {
        if (error === undefined) {
          resolve();
        } else {
          reject(error);
        }
      });
    });
  });

  it("accepts a signed authenticated user token", async () => {
    const token = await createToken();

    await expect(verifier.verify(token)).resolves.toMatchObject({
      subject: USER_ID,
      sessionId: SESSION_ID,
      email: "manager@example.invalid",
    });
  });

  it("rejects an expired token", async () => {
    const token = await createToken({
      expiresAt: Math.floor(Date.now() / 1000) - 60,
    });

    await expect(verifier.verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects a token signed by another key", async () => {
    const token = await createToken({ privateKey: otherPrivateKey });

    await expect(verifier.verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects an altered token", async () => {
    const token = await createToken();
    const parts = token.split(".");
    const signature = parts[2] as string;
    const replacement = signature.startsWith("a") ? "b" : "a";
    parts[2] = `${replacement}${signature.slice(1)}`;
    const altered = parts.join(".");

    await expect(verifier.verify(altered)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects the wrong issuer", async () => {
    const token = await createToken({
      issuer: "https://other.example/auth/v1",
    });

    await expect(verifier.verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects the wrong audience", async () => {
    const token = await createToken({ audience: "anon" });

    await expect(verifier.verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects an anonymous Supabase session", async () => {
    const token = await createToken({ isAnonymous: true });

    await expect(verifier.verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects a non-authenticated technical role", async () => {
    const token = await createToken({ role: "service_role" });

    await expect(verifier.verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects a token without session_id", async () => {
    const token = await createToken({ sessionId: null });

    await expect(verifier.verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  async function createToken(options: TokenOptions = {}): Promise<string> {
    const { SignJWT } = await import("jose");
    const now = Math.floor(Date.now() / 1000);
    const payload: Record<string, unknown> = {
      role: options.role ?? "authenticated",
      email: options.email ?? "manager@example.invalid",
      is_anonymous: options.isAnonymous ?? false,
    };

    if (options.sessionId !== null) {
      payload.session_id = options.sessionId ?? SESSION_ID;
    }

    return new SignJWT(payload)
      .setProtectedHeader({ alg: "ES256", kid: "test-key", typ: "JWT" })
      .setIssuer(options.issuer ?? issuer)
      .setAudience(options.audience ?? "authenticated")
      .setSubject(options.subject ?? USER_ID)
      .setIssuedAt(options.issuedAt ?? now)
      .setExpirationTime(options.expiresAt ?? now + 3600)
      .sign(options.privateKey ?? privateKey);
  }
});
