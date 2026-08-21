import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { AUDIT_ACTIONS } from "../audit/audit.contracts";
import { AuditTrailService } from "../audit/audit-trail.service";
import type { RoleCode } from "./auth.contracts";
import {
  IS_PUBLIC_KEY,
  ORGANIZATION_PARAM_KEY,
  REQUIRED_PERMISSIONS_KEY,
  REQUIRED_ROLES_KEY,
} from "./auth.metadata";
import type { AuthenticatedRequest } from "./authenticated-request";

@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditTrail: AuditTrailService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets) === true
    ) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<readonly RoleCode[]>(
      REQUIRED_ROLES_KEY,
      targets,
    );
    const requiredPermissions = this.reflector.getAllAndOverride<
      readonly string[]
    >(REQUIRED_PERMISSIONS_KEY, targets);
    const organizationParameter = this.reflector.getAllAndOverride<string>(
      ORGANIZATION_PARAM_KEY,
      targets,
    );

    if (
      requiredRoles === undefined &&
      requiredPermissions === undefined &&
      organizationParameter === undefined
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.auth === undefined) {
      throw new UnauthorizedException("Authentication required");
    }

    if (
      requiredRoles !== undefined &&
      !requiredRoles.includes(request.auth.profile.role.code)
    ) {
      return this.reject(
        request,
        "ROLE_NOT_AUTHORIZED",
        "Role is not authorized",
      );
    }

    if (
      requiredPermissions !== undefined &&
      !requiredPermissions.every((permission) =>
        request.auth?.profile.permissions.includes(permission),
      )
    ) {
      return this.reject(
        request,
        "PERMISSION_NOT_AUTHORIZED",
        "Permission is not authorized",
      );
    }

    if (
      organizationParameter !== undefined &&
      request.params[organizationParameter] !==
        request.auth.profile.organizationId
    ) {
      return this.reject(
        request,
        "ORGANIZATION_NOT_AUTHORIZED",
        "Organization is not authorized",
      );
    }

    return true;
  }

  private async reject(
    request: AuthenticatedRequest,
    reasonCode: string,
    message: string,
  ): Promise<never> {
    const auth = request.auth;
    if (auth === undefined || request.correlationId === undefined) {
      throw new UnauthorizedException("Authentication required");
    }

    await this.auditTrail.recordBestEffort({
      correlationId: request.correlationId,
      organizationId: auth.profile.organizationId,
      actor: {
        kind: "AUTHENTICATED_USER",
        profileId: auth.profile.id,
        authUserId: auth.profile.authUserId,
        displayName: auth.profile.displayName,
        roleCode: auth.profile.role.code,
      },
      origin: "API",
      action: AUDIT_ACTIONS.AUTHORIZATION_POLICY,
      entityType: "api_endpoint",
      result: "REJECTED",
      reasonCode,
      request: {
        method: request.method,
        path: request.path,
      },
    });

    throw new ForbiddenException(message);
  }
}
