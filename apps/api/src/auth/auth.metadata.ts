import { SetMetadata } from "@nestjs/common";

import type { RoleCode } from "./auth.contracts";

export const IS_PUBLIC_KEY = "auth:is_public";
export const REQUIRED_ROLES_KEY = "auth:required_roles";
export const REQUIRED_PERMISSIONS_KEY = "auth:required_permissions";
export const ORGANIZATION_PARAM_KEY = "auth:organization_param";

export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);

export const RequireRoles = (
  ...roles: readonly RoleCode[]
): MethodDecorator & ClassDecorator => SetMetadata(REQUIRED_ROLES_KEY, roles);

export const RequirePermissions = (
  ...permissions: readonly string[]
): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

export const RequireOrganizationParam = (
  parameterName = "organizationId",
): MethodDecorator & ClassDecorator =>
  SetMetadata(ORGANIZATION_PARAM_KEY, parameterName);
