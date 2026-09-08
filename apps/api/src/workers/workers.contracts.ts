import type { PageResponse } from "../common/dto/page-query.dto";

export type WorkerRequestStatus =
  "PENDING" | "APPROVED" | "REJECTED" | "MERGED";
export type WorkerStatus =
  "PROVISIONAL" | "PROVISIONAL_VENCIDO" | "ACTIVO" | "RECHAZADO";
export type WorkerResolution = "APPROVE" | "REJECT" | "MERGE";

export interface WorkerRequestItem {
  id: string;
  organizationId: string;
  plantId: string;
  requestedByProfileId: string;
  requestedName: string;
  requestedEmail: string | null;
  requestedPhone: string | null;
  status: WorkerRequestStatus;
  requestedAt: string;
  reviewDueAt: string;
  isOverdue: boolean;
  resolvedByProfileId: string | null;
  resolvedAt: string | null;
  resolutionReason: string | null;
}

export interface WorkerItem {
  id: string;
  organizationId: string;
  plantId: string;
  sourceRequestId: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: WorkerStatus;
  statusChangedAt: string;
  isActive: boolean;
  deactivatedAt: string | null;
}

export interface WorkerListQuery {
  page: number;
  pageSize: number;
  search?: string;
  state: "all" | "active" | "inactive";
  status?: WorkerStatus;
  plantId?: string;
}

export interface WorkerRequestListQuery {
  page: number;
  pageSize: number;
  search?: string;
  status?: WorkerRequestStatus;
  plantId?: string;
}

export interface NewWorkerRequest {
  requestId: string;
  workerId: string;
  organizationId: string;
  plantId: string;
  requesterProfileId: string;
  name: string;
  email?: string;
  phone?: string;
  requestedAt: string;
}

export interface ResolveWorkerRequest {
  organizationId: string;
  requestId: string;
  resolverProfileId: string;
  action: WorkerResolution;
  reason?: string;
  canonicalWorkerId?: string;
  resolvedAt: string;
  mergeId: string;
}

export interface WorkersRepository {
  expire(organizationId: string, observedAt: string): Promise<number>;
  listRequests(
    organizationId: string,
    query: WorkerRequestListQuery,
  ): Promise<PageResponse<WorkerRequestItem>>;
  listWorkers(
    organizationId: string,
    query: WorkerListQuery,
  ): Promise<PageResponse<WorkerItem>>;
  requestWorker(input: NewWorkerRequest): Promise<WorkerItem>;
  resolveRequest(input: ResolveWorkerRequest): Promise<WorkerItem>;
  findWorker(
    organizationId: string,
    workerId: string,
  ): Promise<WorkerItem | null>;
  setWorkerActive(
    organizationId: string,
    workerId: string,
    active: boolean,
  ): Promise<WorkerItem | null>;
}

export const WORKERS_REPOSITORY = Symbol("WORKERS_REPOSITORY");
