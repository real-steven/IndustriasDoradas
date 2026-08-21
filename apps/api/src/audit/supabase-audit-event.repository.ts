import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { AuditEventRecord, AuditEventRepository } from "./audit.contracts";
import type { EnvironmentVariables } from "../config/environment";

type AuditEventRow = {
  id: string;
  organization_id: string | null;
  station_id: string | null;
  actor_kind: string;
  actor_profile_id: string | null;
  actor_auth_user_id: string | null;
  actor_display_name: string | null;
  actor_role_code: string | null;
  origin: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  occurred_at: string;
  recorded_at: string;
  correlation_id: string;
  result: string;
  reason_code: string | null;
  evidence_state: string;
  changed_fields: string[];
  changes: Record<string, unknown>;
  request_method: string | null;
  request_path: string | null;
};

type AuditEventInsert = Omit<AuditEventRow, "recorded_at"> & {
  recorded_at?: string;
};

interface AppDatabase {
  app: {
    Tables: {
      audit_events: {
        Row: AuditEventRow;
        Insert: AuditEventInsert;
        Update: Partial<AuditEventRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

@Injectable()
export class SupabaseAuditEventRepository implements AuditEventRepository {
  private readonly logger = new Logger(SupabaseAuditEventRepository.name);
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

  async insert(event: AuditEventRecord): Promise<void> {
    const row: AuditEventInsert = {
      id: event.id,
      organization_id: event.organizationId ?? null,
      station_id: event.stationId ?? null,
      actor_kind: event.actor.kind,
      actor_profile_id: event.actor.profileId ?? null,
      actor_auth_user_id: event.actor.authUserId ?? null,
      actor_display_name: event.actor.displayName ?? null,
      actor_role_code: event.actor.roleCode ?? null,
      origin: event.origin,
      action: event.action,
      entity_type: event.entityType,
      entity_id: event.entityId ?? null,
      occurred_at: event.occurredAt.toISOString(),
      correlation_id: event.correlationId,
      result: event.result,
      reason_code: event.reasonCode ?? null,
      evidence_state: event.evidenceState,
      changed_fields: [...event.changedFields],
      changes: event.changes,
      request_method: event.request?.method ?? null,
      request_path: event.request?.path ?? null,
    };
    const { error } = await this.client.from("audit_events").insert(row);

    if (error !== null) {
      this.logger.error({
        event: "audit_insert_failed",
        source: "audit_events",
        correlationId: event.correlationId,
      });
      throw new ServiceUnavailableException(
        "Audit trail is temporarily unavailable",
      );
    }
  }
}
