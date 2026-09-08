import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { AUDIT_ACTIONS, type AuditActor } from "../audit/audit.contracts";
import { AuditTrailService } from "../audit/audit-trail.service";
import {
  ACCESS_TOKEN_VERIFIER,
  PROFILE_REPOSITORY,
  type AccessTokenVerifier,
  type ProfileRepository,
} from "./auth.contracts";
import { IS_PUBLIC_KEY } from "./auth.metadata";
import type { AuthenticatedRequest } from "./authenticated-request";

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ACCESS_TOKEN_VERIFIER)
    private readonly tokenVerifier: AccessTokenVerifier,
    @Inject(PROFILE_REPOSITORY)
    private readonly profiles: ProfileRepository,
    private readonly auditTrail: AuditTrailService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    let token: Awaited<ReturnType<AccessTokenVerifier["verify"]>> | undefined;
    let profile:
      Awaited<ReturnType<ProfileRepository["findByAuthUserId"]>> | undefined;

    try {
      token = await this.tokenVerifier.verify(
        this.extractBearerToken(request.headers.authorization),
      );
      profile = await this.profiles.findByAuthUserId(token.subject);

      if (profile === null) {
        throw new ForbiddenException("Authenticated account has no profile");
      }

      if (
        profile.accountStatus !== "ACTIVE" ||
        !profile.isActive ||
        !profile.role.isActive
      ) {
        throw new ForbiddenException("Account is not active");
      }
    } catch (error) {
      await this.auditTrail.recordBestEffort({
        correlationId: this.getCorrelationId(request),
        ...(profile?.organizationId === undefined
          ? {}
          : { organizationId: profile.organizationId }),
        actor: this.createActor(token, profile),
        origin: "API",
        action: AUDIT_ACTIONS.API_ACCESS,
        entityType: "api_endpoint",
        result: "REJECTED",
        reasonCode: this.getRejectionReason(error),
        request: this.getRequestContext(request),
      });
      throw error;
    }

    if (token === undefined || profile === undefined || profile === null) {
      throw new Error("Authentication context was not resolved");
    }

    request.auth = { token, profile };
    await this.auditTrail.record({
      correlationId: this.getCorrelationId(request),
      organizationId: profile.organizationId,
      actor: this.createActor(token, profile),
      origin: "API",
      action: AUDIT_ACTIONS.API_ACCESS,
      entityType: "api_endpoint",
      result: "SUCCEEDED",
      request: this.getRequestContext(request),
    });
    return true;
  }

  private createActor(
    token: Awaited<ReturnType<AccessTokenVerifier["verify"]>> | undefined,
    profile:
      Awaited<ReturnType<ProfileRepository["findByAuthUserId"]>> | undefined,
  ): AuditActor {
    if (profile !== null && profile !== undefined) {
      return {
        kind: "AUTHENTICATED_USER",
        profileId: profile.id,
        authUserId: profile.authUserId,
        displayName: profile.displayName,
        roleCode: profile.role.code,
      };
    }

    if (token !== undefined) {
      return {
        kind: "AUTHENTICATED_USER",
        authUserId: token.subject,
      };
    }

    return { kind: "UNKNOWN" };
  }

  private getCorrelationId(request: AuthenticatedRequest): string {
    if (request.correlationId === undefined) {
      throw new Error("Correlation ID middleware was not applied");
    }
    return request.correlationId;
  }

  private getRequestContext(request: AuthenticatedRequest): {
    method: string;
    path: string;
  } {
    return {
      method: request.method,
      path: request.path,
    };
  }

  private getRejectionReason(error: unknown): string {
    if (!(error instanceof UnauthorizedException)) {
      if (
        error instanceof ForbiddenException &&
        error.message === "Authenticated account has no profile"
      ) {
        return "APPLICATION_PROFILE_NOT_FOUND";
      }
      if (error instanceof ForbiddenException) {
        return "ACCOUNT_INACTIVE";
      }
      return "AUTHENTICATION_FAILED";
    }

    if (error.message === "Authentication required") {
      return "AUTHENTICATION_REQUIRED";
    }
    if (error.message === "Invalid authorization header") {
      return "AUTHORIZATION_HEADER_INVALID";
    }
    return "ACCESS_TOKEN_INVALID_OR_EXPIRED";
  }

  private extractBearerToken(authorization: string | undefined): string {
    if (authorization === undefined) {
      throw new UnauthorizedException("Authentication required");
    }

    const parts = authorization.trim().split(/\s+/u);
    if (
      parts.length !== 2 ||
      parts[0]?.toLowerCase() !== "bearer" ||
      parts[1] === undefined ||
      parts[1] === ""
    ) {
      throw new UnauthorizedException("Invalid authorization header");
    }

    return parts[1];
  }
}
