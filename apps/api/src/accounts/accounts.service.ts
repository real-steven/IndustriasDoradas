import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import {
  ACCOUNTS_REPOSITORY,
  type AccountGovernanceAction,
  type AccountItem,
  type AdministratorPermissionItem,
  type AccountsRepository,
} from "./accounts.contracts";
import type {
  AccountGovernanceDto,
  AccountQueryDto,
  CreateAdministratorDto,
  PermissionSelectionDto,
} from "./accounts.dto";
import { AUDIT_ACTIONS, type AuditActor } from "../audit/audit.contracts";
import { AuditTrailService } from "../audit/audit-trail.service";
import type {
  AuthenticatedContext,
  PreferredLocale,
  RoleCode,
} from "../auth/auth.contracts";
import { SupabaseDataError } from "../catalogs/supabase-catalog.repository";
import type { PageResponse } from "../common/dto/page-query.dto";
import { ApplicationError } from "../common/errors/application-error";

export interface AccountMutationContext {
  auth: AuthenticatedContext;
  correlationId: string;
}

@Injectable()
export class AccountsService {
  constructor(
    @Inject(ACCOUNTS_REPOSITORY)
    private readonly repository: AccountsRepository,
    private readonly auditTrail: AuditTrailService,
  ) {}

  async list(
    organizationId: string,
    query: AccountQueryDto,
    auth: AuthenticatedContext,
  ): Promise<PageResponse<AccountItem>> {
    const roleCode =
      query.roleCode ?? this.defaultGovernedRole(auth.profile.permissions);
    this.assertCanGovernRole(roleCode, auth);
    try {
      return await this.repository.list(organizationId, { ...query, roleCode });
    } catch (error) {
      this.storageError(error);
    }
  }

  async createAdministrator(
    organizationId: string,
    body: CreateAdministratorDto,
    context: AccountMutationContext,
  ): Promise<AccountItem> {
    const selected = await this.validateSelectedPermissions(
      organizationId,
      context.auth.profile.id,
      body.permissionCodes,
      context.auth,
    );
    const profileId = randomUUID();
    return this.auditTrail.execute(
      {
        correlationId: context.correlationId,
        organizationId,
        actor: this.actor(context.auth),
        origin: "API",
        action: AUDIT_ACTIONS.ACCOUNT_PROVISION,
        entityType: "user_profile",
        entityId: profileId,
        failureResult: "FAILED",
        failureReasonCode: "ADMINISTRATOR_PROVISION_FAILED",
        allowedChangeFields: ["role_code", "permission_count"],
        changes: {
          role_code: { before: null, after: "ADMINISTRADOR" },
          permission_count: { before: 0, after: selected.length },
        },
      },
      async () => {
        try {
          return await this.repository.createAdministrator({
            id: profileId,
            organizationId,
            email: body.email,
            displayName: body.displayName,
            preferredLocale: body.preferredLocale,
            creatorProfileId: context.auth.profile.id,
            permissionCodes: selected,
            occurredAt: new Date().toISOString(),
            grantIds: selected.map(() => randomUUID()),
          });
        } catch (error) {
          this.storageError(error);
        }
      },
    );
  }

  async listPermissions(
    organizationId: string,
    targetProfileId: string,
    auth: AuthenticatedContext,
  ): Promise<readonly AdministratorPermissionItem[]> {
    const target = await this.find(organizationId, targetProfileId);
    if (target.roleCode !== "ADMINISTRADOR") this.permissionTargetForbidden();
    try {
      const permissions = await this.repository.listAdministratorPermissions(
        organizationId,
        targetProfileId,
      );
      return auth.profile.role.code === "JEFE_EMPRESA"
        ? permissions
        : permissions.filter((permission) =>
            auth.profile.permissions.includes(permission.code),
          );
    } catch (error) {
      this.storageError(error);
    }
  }

  async listAvailablePermissions(
    organizationId: string,
    auth: AuthenticatedContext,
  ): Promise<readonly AdministratorPermissionItem[]> {
    try {
      const permissions = await this.repository.listAdministratorPermissions(
        organizationId,
        auth.profile.id,
      );
      const available =
        auth.profile.role.code === "JEFE_EMPRESA"
          ? permissions
          : permissions.filter((permission) =>
              auth.profile.permissions.includes(permission.code),
            );
      return available.map((permission) => ({
        ...permission,
        assigned: false,
      }));
    } catch (error) {
      this.storageError(error);
    }
  }

  async replacePermissions(
    organizationId: string,
    targetProfileId: string,
    body: PermissionSelectionDto,
    context: AccountMutationContext,
  ): Promise<readonly AdministratorPermissionItem[]> {
    if (targetProfileId === context.auth.profile.id) {
      throw new ApplicationError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "ACCOUNT_SELF_PERMISSION_CHANGE_FORBIDDEN",
        "An administrator cannot change their own permissions",
      );
    }
    const target = await this.find(organizationId, targetProfileId);
    if (target.roleCode !== "ADMINISTRADOR") this.permissionTargetForbidden();
    const current = await this.repository.listAdministratorPermissions(
      organizationId,
      targetProfileId,
    );
    const selected = await this.validateSelectedPermissions(
      organizationId,
      targetProfileId,
      body.permissionCodes,
      context.auth,
      current,
    );
    const beforeCount = current.filter(
      (permission) => permission.assigned,
    ).length;
    await this.auditTrail.execute(
      {
        correlationId: context.correlationId,
        organizationId,
        actor: this.actor(context.auth),
        origin: "API",
        action: AUDIT_ACTIONS.PERMISSION_GOVERNANCE,
        entityType: "user_profile_permissions",
        entityId: targetProfileId,
        failureResult: "REJECTED",
        failureReasonCode: "PERMISSION_GOVERNANCE_REJECTED",
        allowedChangeFields: ["permission_count"],
        changes: {
          permission_count: { before: beforeCount, after: selected.length },
        },
      },
      async () => {
        try {
          await this.repository.replaceAdministratorPermissions({
            organizationId,
            profileId: targetProfileId,
            governorProfileId: context.auth.profile.id,
            permissionCodes: selected,
            grantIds: selected.map(() => randomUUID()),
            occurredAt: new Date().toISOString(),
          });
        } catch (error) {
          this.storageError(error);
        }
      },
    );
    return this.listPermissions(organizationId, targetProfileId, context.auth);
  }

  async govern(
    organizationId: string,
    targetProfileId: string,
    action: AccountGovernanceAction,
    body: AccountGovernanceDto,
    context: AccountMutationContext,
  ): Promise<AccountItem> {
    if (action === "SUSPEND" && body.reason === undefined) {
      throw new ApplicationError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "ACCOUNT_REASON_REQUIRED",
        "A suspension reason is required",
      );
    }
    const before = await this.find(organizationId, targetProfileId);
    const requiredPermission =
      before.roleCode === "ADMINISTRADOR"
        ? "administrators.govern"
        : before.roleCode === "JEFE_PLANTA"
          ? "plant_managers.manage"
          : null;
    if (
      requiredPermission === null ||
      !context.auth.profile.permissions.includes(requiredPermission)
    ) {
      throw new ApplicationError(
        HttpStatus.FORBIDDEN,
        "ACCOUNT_GOVERNANCE_FORBIDDEN",
        "This account role cannot be governed by the current profile",
      );
    }

    return this.auditTrail.execute(
      {
        correlationId: context.correlationId,
        organizationId,
        actor: this.actor(context.auth),
        origin: "API",
        action: AUDIT_ACTIONS.ACCOUNT_GOVERNANCE,
        entityType: "user_profile",
        entityId: targetProfileId,
        failureResult: "REJECTED",
        failureReasonCode: "ACCOUNT_GOVERNANCE_REJECTED",
        allowedChangeFields: ["account_status", "status_reason"],
        changes: {
          account_status: {
            before: before.accountStatus,
            after: action === "SUSPEND" ? "SUSPENDED" : "ACTIVE",
          },
          status_reason: {
            before: before.statusReason,
            after: action === "SUSPEND" ? (body.reason ?? null) : null,
          },
        },
      },
      async () => {
        try {
          return await this.repository.govern({
            organizationId,
            targetProfileId,
            governorProfileId: context.auth.profile.id,
            action,
            ...(body.reason === undefined ? {} : { reason: body.reason }),
            occurredAt: new Date().toISOString(),
          });
        } catch (error) {
          this.storageError(error);
        }
      },
    );
  }

  async updateOwnLocale(
    locale: PreferredLocale,
    context: AccountMutationContext,
  ): Promise<AccountItem> {
    try {
      const updated = await this.repository.updateLocale(
        context.auth.profile.organizationId,
        context.auth.profile.id,
        locale,
      );
      if (updated === null) this.notFound();
      return updated;
    } catch (error) {
      this.storageError(error);
    }
  }

  private async find(
    organizationId: string,
    profileId: string,
  ): Promise<AccountItem> {
    try {
      const item = await this.repository.find(organizationId, profileId);
      if (item === null) this.notFound();
      return item;
    } catch (error) {
      this.storageError(error);
    }
  }

  private defaultGovernedRole(permissions: readonly string[]): RoleCode {
    if (
      permissions.some((permission) =>
        [
          "administrators.create",
          "administrators.govern",
          "administrators.permissions.manage",
        ].includes(permission),
      )
    ) {
      return "ADMINISTRADOR";
    }
    if (permissions.includes("plant_managers.manage")) return "JEFE_PLANTA";
    throw new ApplicationError(
      HttpStatus.FORBIDDEN,
      "ACCOUNT_GOVERNANCE_FORBIDDEN",
      "This profile cannot govern privileged accounts",
    );
  }

  private assertCanGovernRole(
    role: RoleCode,
    auth: AuthenticatedContext,
  ): void {
    const allowed =
      role === "ADMINISTRADOR"
        ? auth.profile.permissions.some((permission) =>
            [
              "administrators.create",
              "administrators.govern",
              "administrators.permissions.manage",
            ].includes(permission),
          )
        : role === "JEFE_PLANTA" &&
          auth.profile.permissions.includes("plant_managers.manage");
    if (!allowed) {
      throw new ApplicationError(
        HttpStatus.FORBIDDEN,
        "ACCOUNT_GOVERNANCE_FORBIDDEN",
        "This account role cannot be governed by the current profile",
      );
    }
  }

  private async validateSelectedPermissions(
    organizationId: string,
    catalogProfileId: string,
    requested: readonly string[],
    auth: AuthenticatedContext,
    knownCatalog?: readonly AdministratorPermissionItem[],
  ): Promise<readonly string[]> {
    const catalog =
      knownCatalog ??
      (await this.repository.listAdministratorPermissions(
        organizationId,
        catalogProfileId,
      ));
    const known = new Set(catalog.map((permission) => permission.code));
    if (requested.some((permission) => !known.has(permission))) {
      throw new ApplicationError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "PERMISSION_CODE_INVALID",
        "One or more permission codes are invalid",
      );
    }
    if (
      auth.profile.role.code === "ADMINISTRADOR" &&
      requested.some(
        (permission) => !auth.profile.permissions.includes(permission),
      )
    ) {
      throw new ApplicationError(
        HttpStatus.FORBIDDEN,
        "PERMISSION_DELEGATION_EXCEEDS_GOVERNOR",
        "An administrator cannot delegate permissions they do not hold",
      );
    }
    if (
      knownCatalog !== undefined &&
      auth.profile.role.code === "ADMINISTRADOR"
    ) {
      const manageable = new Set(auth.profile.permissions);
      return [
        ...new Set([
          ...knownCatalog
            .filter(
              (permission) =>
                permission.assigned && !manageable.has(permission.code),
            )
            .map((permission) => permission.code),
          ...requested,
        ]),
      ].sort();
    }
    return [...new Set(requested)].sort();
  }

  private permissionTargetForbidden(): never {
    throw new ApplicationError(
      HttpStatus.FORBIDDEN,
      "PERMISSIONS_TARGET_MUST_BE_ADMINISTRATOR",
      "Permissions can only be assigned to administrator accounts",
    );
  }

  private actor(auth: AuthenticatedContext): AuditActor {
    return {
      kind: "AUTHENTICATED_USER",
      profileId: auth.profile.id,
      authUserId: auth.profile.authUserId,
      displayName: auth.profile.displayName,
      roleCode: auth.profile.role.code,
    };
  }

  private notFound(): never {
    throw new ApplicationError(
      HttpStatus.NOT_FOUND,
      "ACCOUNT_NOT_FOUND",
      "Account was not found",
    );
  }

  private storageError(error: unknown): never {
    if (error instanceof ApplicationError) throw error;
    if (error instanceof SupabaseDataError) {
      if (error.databaseCode === "email_exists") {
        throw new ApplicationError(
          HttpStatus.CONFLICT,
          "ACCOUNT_EMAIL_ALREADY_REGISTERED",
          "The email address is already registered",
        );
      }
      if (error.databaseCode === "42501") {
        throw new ApplicationError(
          HttpStatus.FORBIDDEN,
          "ACCOUNT_GOVERNANCE_FORBIDDEN",
          "The requested account operation is not authorized",
        );
      }
      if (error.databaseCode === "23514" || error.databaseCode === "P0001") {
        throw new ApplicationError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          "ACCOUNT_GOVERNANCE_INVALID",
          "The account transition is not allowed",
        );
      }
      throw new ApplicationError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "ACCOUNT_STORAGE_UNAVAILABLE",
        "Account storage is temporarily unavailable",
      );
    }
    throw error;
  }
}
