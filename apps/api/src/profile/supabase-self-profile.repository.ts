import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  PROFILE_PHOTO_BUCKET,
  type AuthIdentity,
  type EmailChangeOutcome,
  type SelfProfileRepository,
  type SelfProfileRow,
} from "./profile.contracts";
import type { EnvironmentVariables } from "../config/environment";

type ProfileRow = {
  id: string;
  organization_id: string;
  display_name: string;
  phone: string | null;
  avatar_object_path: string | null;
  avatar_updated_at: string | null;
  email_change_requested_at: string | null;
};

type ProfileUpdate = Partial<Omit<ProfileRow, "id" | "organization_id">>;

type AppDatabase = {
  app: {
    Tables: {
      user_profiles: {
        Row: ProfileRow;
        Insert: ProfileUpdate;
        Update: ProfileUpdate;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

const PROFILE_COLUMNS =
  "display_name, phone, avatar_object_path, avatar_updated_at, email_change_requested_at";

@Injectable()
export class SupabaseSelfProfileRepository implements SelfProfileRepository {
  private readonly logger = new Logger(SupabaseSelfProfileRepository.name);
  private readonly client: SupabaseClient<AppDatabase, "app", "app">;
  private readonly supabaseUrl: string;
  private readonly serverKey: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.supabaseUrl = config.get("SUPABASE_URL", { infer: true });
    this.serverKey = config.get("SUPABASE_SECRET_KEY", { infer: true });
    this.client = createClient<AppDatabase, "app">(
      this.supabaseUrl,
      this.serverKey,
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

  async find(
    organizationId: string,
    profileId: string,
  ): Promise<SelfProfileRow> {
    const { data, error } = await this.client
      .from("user_profiles")
      .select(PROFILE_COLUMNS)
      .eq("organization_id", organizationId)
      .eq("id", profileId)
      .limit(2)
      .overrideTypes<ProfileRow[], { merge: false }>();
    if (error !== null) this.fail("user_profiles_select");
    if (data.length !== 1) throw new NotFoundException("Profile not found");
    const row = data[0] as ProfileRow;
    return {
      displayName: row.display_name,
      phone: row.phone,
      avatarObjectPath: row.avatar_object_path,
      avatarUpdatedAt: row.avatar_updated_at,
      emailChangeRequestedAt: row.email_change_requested_at,
    };
  }

  async findIdentity(authUserId: string): Promise<AuthIdentity> {
    const { data, error } =
      await this.client.auth.admin.getUserById(authUserId);
    if (error !== null) this.fail("auth_user_select");
    const user = data.user as { email?: string; new_email?: string } | null;
    return {
      email: user?.email ?? null,
      pendingEmail:
        typeof user?.new_email === "string" && user.new_email !== ""
          ? user.new_email
          : null,
    };
  }

  async updateContact(
    organizationId: string,
    profileId: string,
    changes: { displayName?: string; phone?: string | null },
  ): Promise<void> {
    const update: ProfileUpdate = {};
    if (changes.displayName !== undefined)
      update.display_name = changes.displayName;
    if (changes.phone !== undefined) update.phone = changes.phone;
    await this.update(organizationId, profileId, update);
  }

  async setAvatar(
    organizationId: string,
    profileId: string,
    objectPath: string | null,
    updatedAt: string | null,
  ): Promise<void> {
    await this.update(organizationId, profileId, {
      avatar_object_path: objectPath,
      avatar_updated_at: updatedAt,
    });
  }

  async setEmailChangeRequestedAt(
    organizationId: string,
    profileId: string,
    requestedAt: string | null,
  ): Promise<void> {
    await this.update(organizationId, profileId, {
      email_change_requested_at: requestedAt,
    });
  }

  async uploadPhoto(objectPath: string, bytes: Buffer): Promise<void> {
    const { error } = await this.client.storage
      .from(PROFILE_PHOTO_BUCKET)
      .upload(objectPath, bytes, {
        contentType: "image/jpeg",
        cacheControl: "0",
        upsert: false,
      });
    if (error !== null) this.fail("profile_photo_upload");
  }

  async removePhotos(objectPaths: readonly string[]): Promise<void> {
    if (objectPaths.length === 0) return;
    const { error } = await this.client.storage
      .from(PROFILE_PHOTO_BUCKET)
      .remove([...objectPaths]);
    if (error !== null) this.fail("profile_photo_remove");
  }

  async signPhoto(objectPath: string, seconds: number): Promise<string | null> {
    const { data, error } = await this.client.storage
      .from(PROFILE_PHOTO_BUCKET)
      .createSignedUrl(objectPath, seconds);
    if (error !== null) {
      this.logger.warn({ event: "profile_photo_sign_failed" });
      return null;
    }
    return data.signedUrl;
  }

  async requestEmailChange(
    accessToken: string,
    newEmail: string,
    redirectTo: string | undefined,
  ): Promise<EmailChangeOutcome> {
    // Flujo normal de Supabase Auth con el token del propio usuario: Supabase
    // envía los correos de confirmación (al nuevo y, con "Secure email change",
    // también al actual). No se usa la API administrativa ni se confirma nada
    // desde el servidor.
    const url = new URL("/auth/v1/user", this.supabaseUrl);
    if (redirectTo !== undefined)
      url.searchParams.set("redirect_to", redirectTo);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "PUT",
        headers: {
          apikey: this.serverKey,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: newEmail }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      this.fail("auth_email_change_unreachable");
    }
    if (response.ok) return { status: "REQUESTED" };
    const body = (await response.json().catch(() => ({}))) as {
      error_code?: unknown;
    };
    const code = typeof body.error_code === "string" ? body.error_code : "";
    if (code === "email_exists" || code === "email_address_invalid")
      return { status: "EMAIL_UNAVAILABLE" };
    if (response.status === 429 || code.startsWith("over_"))
      return { status: "RATE_LIMITED" };
    if (response.status >= 500) this.fail("auth_email_change_failed");
    return { status: "REJECTED" };
  }

  private async update(
    organizationId: string,
    profileId: string,
    update: ProfileUpdate,
  ): Promise<void> {
    const { data, error } = await this.client
      .from("user_profiles")
      .update(update)
      .eq("organization_id", organizationId)
      .eq("id", profileId)
      .select("display_name")
      .overrideTypes<
        Array<Pick<ProfileRow, "display_name">>,
        { merge: false }
      >();
    if (error !== null) this.fail("user_profiles_update");
    if (data.length !== 1) throw new NotFoundException("Profile not found");
  }

  private fail(operation: string): never {
    this.logger.error({ event: "self_profile_repository_failed", operation });
    throw new ServiceUnavailableException(
      "The profile service is temporarily unavailable",
    );
  }
}
