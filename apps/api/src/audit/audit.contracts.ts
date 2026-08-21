export const AUDIT_EVENT_REPOSITORY = Symbol("AUDIT_EVENT_REPOSITORY");
export const AUDIT_QUERY_REPOSITORY = Symbol("AUDIT_QUERY_REPOSITORY");

export const AUDIT_ACTIONS = {
  API_ACCESS: "access.api",
  AUTHORIZATION_POLICY: "authorization.policy",
  PRIVILEGE_ELEVATION: "privilege.elevation",
  ACCOUNT_GOVERNANCE: "account.governance",
  ACCOUNT_PROVISION: "account.provision",
  PERMISSION_GOVERNANCE: "permission.governance",
  BUSINESS_MUTATION: "business.mutation",
} as const;

export type AuditActorKind =
  "AUTHENTICATED_USER" | "OPERATION_MODE" | "SYSTEM" | "UNKNOWN";
export type AuditOrigin = "API" | "WEB" | "DESKTOP" | "SYNC" | "SYSTEM";
export type AuditResult = "SUCCEEDED" | "REJECTED" | "FAILED";
export type AuditEvidenceState =
  "NOT_APPLICABLE" | "PENDING" | "PRESENT" | "ABSENT";
export type AuditScalar = string | number | boolean | null;

export interface AuditActor {
  kind: AuditActorKind;
  profileId?: string;
  authUserId?: string;
  displayName?: string;
  roleCode?: string;
}

export interface AuditFieldChange {
  before: AuditScalar;
  after: AuditScalar;
}

export interface AuditRequestContext {
  method: string;
  path: string;
}

export interface AuditEventInput {
  correlationId: string;
  organizationId?: string;
  stationId?: string;
  actor: AuditActor;
  origin: AuditOrigin;
  action: string;
  entityType: string;
  entityId?: string;
  result: AuditResult;
  reasonCode?: string;
  evidenceState?: AuditEvidenceState;
  changes?: Readonly<Record<string, AuditFieldChange>>;
  allowedChangeFields?: readonly string[];
  request?: AuditRequestContext;
  occurredAt?: Date;
}

export interface AuditEventRecord {
  id: string;
  correlationId: string;
  organizationId?: string;
  stationId?: string;
  actor: AuditActor;
  origin: AuditOrigin;
  action: string;
  entityType: string;
  entityId?: string;
  result: AuditResult;
  reasonCode?: string;
  evidenceState: AuditEvidenceState;
  changedFields: readonly string[];
  changes: Readonly<Record<string, AuditFieldChange>>;
  request?: AuditRequestContext;
  occurredAt: Date;
}

export interface AuditEventRepository {
  insert(event: AuditEventRecord): Promise<void>;
}

export interface AuditListItem {
  id: string;
  correlationId: string;
  organizationId: string;
  stationId: string | null;
  actorDisplayName: string | null;
  actorRoleCode: string | null;
  origin: AuditOrigin;
  action: string;
  entityType: string;
  entityId: string | null;
  result: AuditResult;
  reasonCode: string | null;
  evidenceState: AuditEvidenceState;
  changedFields: readonly string[];
  changes: Readonly<Record<string, AuditFieldChange>>;
  occurredAt: string;
}

export interface AuditQueryRepository {
  list(
    organizationId: string,
    query: {
      page: number;
      pageSize: number;
      search?: string;
      result?: AuditResult;
    },
  ): Promise<PageResponse<AuditListItem>>;
}

export interface AuditedOperationInput extends Omit<
  AuditEventInput,
  "result" | "reasonCode"
> {
  failureResult: Extract<AuditResult, "REJECTED" | "FAILED">;
  failureReasonCode: string;
}
import type { PageResponse } from "../common/dto/page-query.dto";
