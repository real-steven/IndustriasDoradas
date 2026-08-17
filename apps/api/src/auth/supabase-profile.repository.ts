import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  ROLE_CODES,
  type AccountStatus,
  type AuthorizedProfile,
  type PreferredLocale,
  type ProfileRepository,
  type RoleCode,
} from "./auth.contracts";
import type { EnvironmentVariables } from "../config/environment";

interface ProfileRow {
  id: string;
  organization_id: string;
  auth_user_id: string;
  role_id: string;
  display_name: string;
  preferred_locale: PreferredLocale;
  account_status: AccountStatus;
  is_active: boolean;
}

interface RoleRow {
  id: string;
  code: string;
  is_active: boolean;
}

interface RolePermissionRow {
  permission_id: string;
}

interface PermissionRow {
  code: string;
}

type ReadOnlyTable<Row> = {
  Row: Row;
  Insert: never;
  Update: never;
  Relationships: [];
};

interface AppDatabase {
  app: {
    Tables: {
      user_profiles: ReadOnlyTable<ProfileRow>;
      roles: ReadOnlyTable<RoleRow>;
      role_permissions: ReadOnlyTable<RolePermissionRow>;
      permissions: ReadOnlyTable<PermissionRow>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

@Injectable()
export class SupabaseProfileRepository implements ProfileRepository {
  private readonly logger = new Logger(SupabaseProfileRepository.name);
  private readonly client: SupabaseClient<AppDatabase, "app", "app">;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.client = createClient<AppDatabase, "app">(
      config.get("SUPABASE_URL", { infer: true }),
      config.get("SUPABASE_SECRET_KEY", { infer: true }),
      {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
        db: { schema: "app" },
      },
    );
  }

  async findByAuthUserId(
    authUserId: string,
  ): Promise<AuthorizedProfile | null> {
    const profile = await this.loadProfile(authUserId);
    if (profile === null) {
      return null;
    }

    const role = await this.loadRole(profile.role_id);
    const permissions = await this.loadPermissions(role.id);

    return {
      id: profile.id,
      organizationId: profile.organization_id,
      authUserId: profile.auth_user_id,
      displayName: profile.display_name,
      preferredLocale: profile.preferred_locale,
      accountStatus: profile.account_status,
      isActive: profile.is_active,
      role: {
        id: role.id,
        code: this.parseRoleCode(role.code),
        isActive: role.is_active,
      },
      permissions,
    };
  }

  private async loadProfile(authUserId: string): Promise<ProfileRow | null> {
    const { data, error } = await this.client
      .from("user_profiles")
      .select(
        "id, organization_id, auth_user_id, role_id, display_name, preferred_locale, account_status, is_active",
      )
      .eq("auth_user_id", authUserId)
      .limit(2)
      .overrideTypes<ProfileRow[], { merge: false }>();

    if (error !== null) {
      this.failQuery("user_profiles");
    }

    if (data.length > 1) {
      this.failQuery("user_profiles_non_unique");
    }

    return data[0] ?? null;
  }

  private async loadRole(roleId: string): Promise<RoleRow> {
    const { data, error } = await this.client
      .from("roles")
      .select("id, code, is_active")
      .eq("id", roleId)
      .limit(2)
      .overrideTypes<RoleRow[], { merge: false }>();

    if (error !== null || data.length !== 1) {
      this.failQuery("roles");
    }

    return data[0] as RoleRow;
  }

  private async loadPermissions(roleId: string): Promise<readonly string[]> {
    const { data: assignments, error: assignmentsError } = await this.client
      .from("role_permissions")
      .select("permission_id")
      .eq("role_id", roleId)
      .overrideTypes<RolePermissionRow[], { merge: false }>();

    if (assignmentsError !== null) {
      this.failQuery("role_permissions");
    }

    if (assignments.length === 0) {
      return [];
    }

    const { data: permissions, error: permissionsError } = await this.client
      .from("permissions")
      .select("code")
      .in(
        "id",
        assignments.map((assignment) => assignment.permission_id),
      )
      .eq("is_active", true)
      .overrideTypes<PermissionRow[], { merge: false }>();

    if (permissionsError !== null) {
      this.failQuery("permissions");
    }

    return permissions.map((permission) => permission.code).sort();
  }

  private parseRoleCode(value: string): RoleCode {
    if (!ROLE_CODES.includes(value as RoleCode)) {
      this.failQuery("roles_unknown_code");
    }

    return value as RoleCode;
  }

  private failQuery(source: string): never {
    this.logger.error({ event: "authorization_profile_query_failed", source });
    throw new ServiceUnavailableException(
      "Authorization profile is temporarily unavailable",
    );
  }
}
