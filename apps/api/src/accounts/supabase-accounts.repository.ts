import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  type AccountItem,
  type AccountListQuery,
  type AccountsRepository,
  type AccountGovernanceAction,
  type AdministratorPermissionItem,
  type CreateAdministratorInput,
} from "./accounts.contracts";
import type { PreferredLocale, RoleCode } from "../auth/auth.contracts";
import { SupabaseDataError } from "../catalogs/supabase-catalog.repository";
import type { PageResponse } from "../common/dto/page-query.dto";
import type { EnvironmentVariables } from "../config/environment";

type DatabaseScalar = string | number | boolean | null;
type DatabaseRow = Record<string, DatabaseScalar>;
interface ErrorBody {
  code?: unknown;
}
interface AuthOnlyDatabase {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

@Injectable()
export class SupabaseAccountsRepository implements AccountsRepository {
  private readonly restUrl: string;
  private readonly secret: string;
  private readonly authClient: SupabaseClient<AuthOnlyDatabase>;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.restUrl = `${config.get("SUPABASE_URL", { infer: true })}/rest/v1`;
    this.secret = config.get("SUPABASE_SECRET_KEY", { infer: true });
    this.authClient = createClient<AuthOnlyDatabase>(
      config.get("SUPABASE_URL", { infer: true }),
      this.secret,
      {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      },
    );
  }

  async list(
    organizationId: string,
    query: AccountListQuery,
  ): Promise<PageResponse<AccountItem>> {
    const roleId = await this.roleId(query.roleCode);
    const parameters = new URLSearchParams({
      organization_id: `eq.${organizationId}`,
      role_id: `eq.${roleId}`,
      limit: String(query.pageSize),
      offset: String((query.page - 1) * query.pageSize),
      order: "display_name.asc,id.asc",
      select: "*",
    });
    if (query.search?.trim()) {
      parameters.set(
        "display_name",
        `ilike.*${this.escapeLike(query.search.trim())}*`,
      );
    }
    if (query.status !== undefined) {
      parameters.set("account_status", `eq.${query.status}`);
    }
    const response = await this.request(`user_profiles?${parameters}`, {
      headers: { Prefer: "count=exact" },
    });
    const rows = (await response.json()) as DatabaseRow[];
    const items = rows.map((row) => this.toItem(row, query.roleCode));
    const value = response.headers.get("content-range")?.split("/")[1];
    const total =
      value !== undefined && /^\d+$/u.test(value)
        ? Number(value)
        : items.length;
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    };
  }

  async find(
    organizationId: string,
    profileId: string,
  ): Promise<AccountItem | null> {
    const parameters = new URLSearchParams({
      organization_id: `eq.${organizationId}`,
      id: `eq.${profileId}`,
      limit: "1",
      select: "*",
    });
    const response = await this.request(`user_profiles?${parameters}`);
    const rows = (await response.json()) as DatabaseRow[];
    const row = rows[0];
    if (row === undefined) return null;
    return this.toItem(row, await this.roleCode(this.string(row, "role_id")));
  }

  async govern(input: {
    organizationId: string;
    targetProfileId: string;
    governorProfileId: string;
    action: AccountGovernanceAction;
    reason?: string;
    occurredAt: string;
  }): Promise<AccountItem> {
    await this.request("rpc/govern_account", {
      body: JSON.stringify({
        target_organization_id: input.organizationId,
        target_profile_id: input.targetProfileId,
        governor_profile_id: input.governorProfileId,
        governance_action: input.action,
        governance_reason: input.reason ?? null,
        governance_moment: input.occurredAt,
      }),
      method: "POST",
    });
    const item = await this.find(input.organizationId, input.targetProfileId);
    if (item === null)
      throw new SupabaseDataError("EMPTY_RESPONSE", "govern_account");
    return item;
  }

  async updateLocale(
    organizationId: string,
    profileId: string,
    locale: PreferredLocale,
  ): Promise<AccountItem | null> {
    const parameters = new URLSearchParams({
      organization_id: `eq.${organizationId}`,
      id: `eq.${profileId}`,
    });
    const response = await this.request(`user_profiles?${parameters}`, {
      body: JSON.stringify({ preferred_locale: locale }),
      headers: { Prefer: "return=representation" },
      method: "PATCH",
    });
    const rows = (await response.json()) as DatabaseRow[];
    const row = rows[0];
    if (row === undefined) return null;
    return this.toItem(row, await this.roleCode(this.string(row, "role_id")));
  }

  async createAdministrator(
    input: CreateAdministratorInput,
  ): Promise<AccountItem> {
    const invited = await this.authClient.auth.admin.inviteUserByEmail(
      input.email,
      { data: { display_name: input.displayName } },
    );
    if (invited.error !== null || invited.data.user === null) {
      throw new SupabaseDataError(
        invited.error?.code ?? "AUTH_INVITE_FAILED",
        "auth.users",
      );
    }
    const authUserId = invited.data.user.id;
    let profileCreated = false;
    try {
      const response = await this.request("user_profiles", {
        body: JSON.stringify({
          id: input.id,
          organization_id: input.organizationId,
          auth_user_id: authUserId,
          role_id: await this.roleId("ADMINISTRADOR"),
          display_name: input.displayName,
          preferred_locale: input.preferredLocale,
          account_status: "ACTIVE",
          approved_by_profile_id: input.creatorProfileId,
          approved_at: input.occurredAt,
        }),
        headers: { Prefer: "return=representation" },
        method: "POST",
      });
      const rows = (await response.json()) as DatabaseRow[];
      if (rows[0] === undefined) {
        throw new SupabaseDataError("EMPTY_RESPONSE", "user_profiles");
      }
      profileCreated = true;
      await this.replaceAdministratorPermissions({
        organizationId: input.organizationId,
        profileId: input.id,
        governorProfileId: input.creatorProfileId,
        permissionCodes: input.permissionCodes,
        grantIds: input.grantIds,
        occurredAt: input.occurredAt,
      });
      return this.toItem(rows[0], "ADMINISTRADOR");
    } catch (error) {
      if (profileCreated) {
        const parameters = new URLSearchParams({
          organization_id: `eq.${input.organizationId}`,
          id: `eq.${input.id}`,
        });
        await this.request(`user_profiles?${parameters}`, {
          body: JSON.stringify({
            account_status: "SUSPENDED",
            suspended_by_profile_id: input.creatorProfileId,
            suspended_at: input.occurredAt,
            status_reason: "PROVISIONING_FAILED",
          }),
          method: "PATCH",
        }).catch(() => null);
      } else {
        await this.authClient.auth.admin
          .deleteUser(authUserId)
          .catch(() => null);
      }
      throw error;
    }
  }

  async listAdministratorPermissions(
    organizationId: string,
    profileId: string,
  ): Promise<readonly AdministratorPermissionItem[]> {
    const permissionParameters = new URLSearchParams({
      is_active: "eq.true",
      code: "neq.profile.locale_update",
      order: "code.asc",
      select: "id,code,description",
    });
    const grantParameters = new URLSearchParams({
      organization_id: `eq.${organizationId}`,
      user_profile_id: `eq.${profileId}`,
      revoked_at: "is.null",
      select: "permission_id",
    });
    const [permissionResponse, grantResponse] = await Promise.all([
      this.request(`permissions?${permissionParameters}`),
      this.request(`user_permission_grants?${grantParameters}`),
    ]);
    const permissions = (await permissionResponse.json()) as DatabaseRow[];
    const grants = (await grantResponse.json()) as DatabaseRow[];
    const assigned = new Set(
      grants.map((grant) => this.string(grant, "permission_id")),
    );
    return permissions.map((permission) => ({
      code: this.string(permission, "code"),
      description: this.string(permission, "description"),
      assigned: assigned.has(this.string(permission, "id")),
    }));
  }

  async replaceAdministratorPermissions(input: {
    organizationId: string;
    profileId: string;
    governorProfileId: string;
    permissionCodes: readonly string[];
    grantIds: readonly string[];
    occurredAt: string;
  }): Promise<void> {
    await this.request("rpc/replace_administrator_permissions", {
      body: JSON.stringify({
        target_organization_id: input.organizationId,
        target_profile_id: input.profileId,
        governor_profile_id: input.governorProfileId,
        desired_permission_codes: input.permissionCodes,
        new_grant_ids: input.grantIds,
        change_moment: input.occurredAt,
      }),
      method: "POST",
    });
  }

  private async roleId(code: RoleCode): Promise<string> {
    const parameters = new URLSearchParams({
      code: `eq.${code}`,
      limit: "1",
      select: "id",
    });
    const response = await this.request(`roles?${parameters}`);
    const rows = (await response.json()) as DatabaseRow[];
    const row = rows[0];
    if (row === undefined)
      throw new SupabaseDataError("ROLE_NOT_FOUND", "roles");
    return this.string(row, "id");
  }

  private async roleCode(id: string): Promise<RoleCode> {
    const parameters = new URLSearchParams({
      id: `eq.${id}`,
      limit: "1",
      select: "code",
    });
    const response = await this.request(`roles?${parameters}`);
    const rows = (await response.json()) as DatabaseRow[];
    const row = rows[0];
    if (row === undefined)
      throw new SupabaseDataError("ROLE_NOT_FOUND", "roles");
    return this.string(row, "code") as RoleCode;
  }

  private async request(
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const response = await fetch(`${this.restUrl}/${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        "Accept-Profile": "app",
        apikey: this.secret,
        Authorization: `Bearer ${this.secret}`,
        "Content-Profile": "app",
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ErrorBody;
      throw new SupabaseDataError(
        typeof body.code === "string" ? body.code : `HTTP_${response.status}`,
        path.split("?")[0] ?? path,
      );
    }
    return response;
  }

  private toItem(row: DatabaseRow, roleCode: RoleCode): AccountItem {
    return {
      id: this.string(row, "id"),
      organizationId: this.string(row, "organization_id"),
      displayName: this.string(row, "display_name"),
      preferredLocale: this.string(row, "preferred_locale") as PreferredLocale,
      accountStatus: this.string(
        row,
        "account_status",
      ) as AccountItem["accountStatus"],
      roleCode,
      statusReason: this.nullableString(row, "status_reason"),
      isActive: this.boolean(row, "is_active"),
      createdAt: this.string(row, "created_at"),
      updatedAt: this.string(row, "updated_at"),
    };
  }

  private string(row: DatabaseRow, key: string): string {
    const value = row[key];
    if (typeof value !== "string")
      throw new SupabaseDataError("INVALID_ROW", key);
    return value;
  }

  private nullableString(row: DatabaseRow, key: string): string | null {
    const value = row[key];
    if (value === null || value === undefined) return null;
    if (typeof value !== "string")
      throw new SupabaseDataError("INVALID_ROW", key);
    return value;
  }

  private boolean(row: DatabaseRow, key: string): boolean {
    const value = row[key];
    if (typeof value !== "boolean")
      throw new SupabaseDataError("INVALID_ROW", key);
    return value;
  }

  private escapeLike(value: string): string {
    return value.replace(/[\\%_]/gu, (match) => `\\${match}`);
  }
}
