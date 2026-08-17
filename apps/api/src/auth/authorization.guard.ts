import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

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
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
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
      throw new ForbiddenException("Role is not authorized");
    }

    if (
      requiredPermissions !== undefined &&
      !requiredPermissions.every((permission) =>
        request.auth?.profile.permissions.includes(permission),
      )
    ) {
      throw new ForbiddenException("Permission is not authorized");
    }

    if (
      organizationParameter !== undefined &&
      request.params[organizationParameter] !==
        request.auth.profile.organizationId
    ) {
      throw new ForbiddenException("Organization is not authorized");
    }

    return true;
  }
}
