import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type {
  NewWorkerRequest,
  ResolveWorkerRequest,
  WorkerItem,
  WorkerListQuery,
  WorkerRequestItem,
  WorkerRequestListQuery,
  WorkersRepository,
} from "./workers.contracts";
import { SupabaseDataError } from "../catalogs/supabase-catalog.repository";
import type { PageResponse } from "../common/dto/page-query.dto";
import type { EnvironmentVariables } from "../config/environment";

type DatabaseScalar = string | number | boolean | null;
type DatabaseRow = Record<string, DatabaseScalar>;
interface ErrorBody {
  code?: unknown;
}

@Injectable()
export class SupabaseWorkersRepository implements WorkersRepository {
  private readonly restUrl: string;
  private readonly secret: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.restUrl = `${config.get("SUPABASE_URL", { infer: true })}/rest/v1`;
    this.secret = config.get("SUPABASE_SECRET_KEY", { infer: true });
  }

  async expire(organizationId: string, observedAt: string): Promise<number> {
    const response = await this.request("rpc/expire_provisional_workers", {
      body: JSON.stringify({
        target_organization_id: organizationId,
        observed_at: observedAt,
      }),
      method: "POST",
    });
    const result = (await response.json()) as unknown;
    return typeof result === "number" ? result : 0;
  }

  async listRequests(
    organizationId: string,
    query: WorkerRequestListQuery,
  ): Promise<PageResponse<WorkerRequestItem>> {
    const parameters = this.pageParameters(query);
    parameters.set("organization_id", `eq.${organizationId}`);
    parameters.set("order", "requested_at.desc,id.asc");
    parameters.set("select", "*");
    if (query.search?.trim()) {
      parameters.set(
        "requested_name",
        `ilike.*${this.escapeLike(query.search.trim())}*`,
      );
    }
    if (query.status !== undefined)
      parameters.set("status", `eq.${query.status}`);
    if (query.plantId !== undefined)
      parameters.set("plant_id", `eq.${query.plantId}`);

    const response = await this.request(`worker_requests?${parameters}`, {
      headers: { Prefer: "count=exact" },
    });
    const rows = (await response.json()) as DatabaseRow[];
    return this.page(
      query,
      response,
      rows.map((row) => this.toRequest(row)),
    );
  }

  async listWorkers(
    organizationId: string,
    query: WorkerListQuery,
  ): Promise<PageResponse<WorkerItem>> {
    const parameters = this.pageParameters(query);
    parameters.set("organization_id", `eq.${organizationId}`);
    parameters.set("order", "name.asc,id.asc");
    parameters.set("select", "*");
    if (query.search?.trim()) {
      parameters.set("name", `ilike.*${this.escapeLike(query.search.trim())}*`);
    }
    if (query.status !== undefined)
      parameters.set("status", `eq.${query.status}`);
    if (query.plantId !== undefined)
      parameters.set("plant_id", `eq.${query.plantId}`);
    if (query.state !== "all") {
      parameters.set("is_active", `eq.${query.state === "active"}`);
    }

    const response = await this.request(`workers?${parameters}`, {
      headers: { Prefer: "count=exact" },
    });
    const rows = (await response.json()) as DatabaseRow[];
    return this.page(
      query,
      response,
      rows.map((row) => this.toWorker(row)),
    );
  }

  async requestWorker(input: NewWorkerRequest): Promise<WorkerItem> {
    await this.request("rpc/request_worker", {
      body: JSON.stringify({
        new_request_id: input.requestId,
        new_worker_id: input.workerId,
        target_organization_id: input.organizationId,
        target_plant_id: input.plantId,
        requester_profile_id: input.requesterProfileId,
        worker_name: input.name,
        worker_email: input.email ?? "",
        worker_phone: input.phone ?? "",
        requested_moment: input.requestedAt,
      }),
      method: "POST",
    });
    const worker = await this.findWorker(input.organizationId, input.workerId);
    if (worker === null)
      throw new SupabaseDataError("EMPTY_RESPONSE", "request_worker");
    return worker;
  }

  async resolveRequest(input: ResolveWorkerRequest): Promise<WorkerItem> {
    const response = await this.request("rpc/resolve_worker_request", {
      body: JSON.stringify({
        target_organization_id: input.organizationId,
        target_request_id: input.requestId,
        resolver_profile_id: input.resolverProfileId,
        resolution_action: input.action,
        resolution_reason: input.reason ?? null,
        canonical_worker_id: input.canonicalWorkerId ?? null,
        resolution_moment: input.resolvedAt,
        new_merge_id: input.mergeId,
      }),
      method: "POST",
    });
    const workerId = (await response.json()) as unknown;
    if (typeof workerId !== "string") {
      throw new SupabaseDataError("INVALID_ROW", "resolve_worker_request");
    }
    const worker = await this.findWorker(input.organizationId, workerId);
    if (worker === null)
      throw new SupabaseDataError("EMPTY_RESPONSE", "resolve_worker_request");
    return worker;
  }

  async findWorker(
    organizationId: string,
    workerId: string,
  ): Promise<WorkerItem | null> {
    const parameters = new URLSearchParams({
      organization_id: `eq.${organizationId}`,
      id: `eq.${workerId}`,
      limit: "1",
      select: "*",
    });
    const response = await this.request(`workers?${parameters}`);
    const rows = (await response.json()) as DatabaseRow[];
    return rows[0] === undefined ? null : this.toWorker(rows[0]);
  }

  async setWorkerActive(
    organizationId: string,
    workerId: string,
    active: boolean,
  ): Promise<WorkerItem | null> {
    const parameters = new URLSearchParams({
      organization_id: `eq.${organizationId}`,
      id: `eq.${workerId}`,
    });
    const response = await this.request(`workers?${parameters}`, {
      body: JSON.stringify({
        is_active: active,
        deactivated_at: active ? null : new Date().toISOString(),
      }),
      headers: { Prefer: "return=representation" },
      method: "PATCH",
    });
    const rows = (await response.json()) as DatabaseRow[];
    return rows[0] === undefined ? null : this.toWorker(rows[0]);
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
        path.split("?")[0] ?? "workers",
      );
    }
    return response;
  }

  private pageParameters(query: {
    page: number;
    pageSize: number;
  }): URLSearchParams {
    return new URLSearchParams({
      limit: String(query.pageSize),
      offset: String((query.page - 1) * query.pageSize),
    });
  }

  private page<T>(
    query: { page: number; pageSize: number },
    response: Response,
    items: T[],
  ): PageResponse<T> {
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

  private toRequest(row: DatabaseRow): WorkerRequestItem {
    const reviewDueAt = this.string(row, "review_due_at");
    return {
      id: this.string(row, "id"),
      organizationId: this.string(row, "organization_id"),
      plantId: this.string(row, "plant_id"),
      requestedByProfileId: this.string(row, "requested_by_profile_id"),
      requestedName: this.string(row, "requested_name"),
      requestedEmail: this.nullableString(row, "requested_email"),
      requestedPhone: this.nullableString(row, "requested_phone"),
      status: this.string(row, "status") as WorkerRequestItem["status"],
      requestedAt: this.string(row, "requested_at"),
      reviewDueAt,
      isOverdue:
        row.status === "PENDING" && Date.parse(reviewDueAt) <= Date.now(),
      resolvedByProfileId: this.nullableString(row, "resolved_by_profile_id"),
      resolvedAt: this.nullableString(row, "resolved_at"),
      resolutionReason: this.nullableString(row, "resolution_reason"),
    };
  }

  private toWorker(row: DatabaseRow): WorkerItem {
    return {
      id: this.string(row, "id"),
      organizationId: this.string(row, "organization_id"),
      plantId: this.string(row, "plant_id"),
      sourceRequestId: this.string(row, "source_request_id"),
      name: this.string(row, "name"),
      email: this.nullableString(row, "email"),
      phone: this.nullableString(row, "phone"),
      status: this.string(row, "status") as WorkerItem["status"],
      statusChangedAt: this.string(row, "status_changed_at"),
      isActive: this.boolean(row, "is_active"),
      deactivatedAt: this.nullableString(row, "deactivated_at"),
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
