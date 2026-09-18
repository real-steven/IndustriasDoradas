export const SYNC_REPOSITORY = Symbol("SYNC_REPOSITORY");

export const SYNC_OPERATION_TYPES = [
  "OPERATION_STARTED",
  "RESPONSIBLE_RELIEVED",
  "OPERATION_COMPLETED",
  "PRODUCTION_EVENT_CREATED",
] as const;

export type SyncOperationType = (typeof SYNC_OPERATION_TYPES)[number];
export type SyncAuthorizationState =
  "VALID" | "EXPIRED_CONTINGENCY" | "LEGACY_UNAVAILABLE";
export type SyncItemStatus =
  "APPLIED" | "ALREADY_APPLIED" | "RETRY_LATER" | "FAILED_REVIEW";

export interface SyncAuthorizationEvidence {
  actorProfileId: string;
  permissionVersion: number;
  validatedAtUtc: string;
  offlineValidUntilUtc: string;
  stateAtCapture: SyncAuthorizationState;
}

export interface SyncEnvelopeItem {
  outboxMessageId: string;
  stationSequence: number;
  operationType: string;
  aggregateType: string;
  aggregateId: string;
  payloadSchemaVersion: number;
  createdAtUtc: string;
  authorization: SyncAuthorizationEvidence;
  payload: Record<string, unknown>;
}

export interface NormalizedSyncItem extends SyncEnvelopeItem {
  operationType: SyncOperationType;
  payload: Record<string, unknown>;
  contentHash: string;
  precheckCode: string | null;
}

export interface SyncItemResult {
  outboxMessageId: string;
  stationSequence: number;
  status: SyncItemStatus;
  receiptId?: string;
  code: string;
  processedAtUtc: string;
}

export interface SyncStationScope {
  permissionVersion: number;
}

export interface SyncRepository {
  findActiveStationScope(input: {
    organizationId: string;
    plantId: string;
    stationId: string;
    profileId: string;
  }): Promise<SyncStationScope | null>;
  ingestItem(input: {
    organizationId: string;
    plantId: string;
    stationId: string;
    correlationId: string;
    item: NormalizedSyncItem;
  }): Promise<SyncItemResult>;
}

export class SyncRepositoryError extends Error {
  constructor(readonly databaseCode: string) {
    super("Sync repository operation failed");
  }
}
