import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import {
  WORKERS_REPOSITORY,
  type WorkerItem,
  type WorkerListQuery,
  type WorkerRequestListQuery,
  type WorkerResolution,
  type WorkersRepository,
} from "./workers.contracts";
import {
  AUDIT_ACTIONS,
  type AuditActor,
  type AuditFieldChange,
} from "../audit/audit.contracts";
import { AuditTrailService } from "../audit/audit-trail.service";
import type { AuthenticatedContext } from "../auth/auth.contracts";
import { SupabaseDataError } from "../catalogs/supabase-catalog.repository";
import type { PageResponse } from "../common/dto/page-query.dto";
import { ApplicationError } from "../common/errors/application-error";

interface WorkerMutationContext {
  auth: AuthenticatedContext;
  correlationId: string;
}

@Injectable()
export class WorkersService {
  constructor(
    @Inject(WORKERS_REPOSITORY)
    private readonly repository: WorkersRepository,
    private readonly auditTrail: AuditTrailService,
  ) {}

  async listRequests(organizationId: string, query: WorkerRequestListQuery) {
    await this.expire(organizationId);
    try {
      return await this.repository.listRequests(organizationId, query);
    } catch (error) {
      this.storageError(error);
    }
  }

  async listWorkers(
    organizationId: string,
    query: WorkerListQuery,
  ): Promise<PageResponse<WorkerItem>> {
    await this.expire(organizationId);
    try {
      return await this.repository.listWorkers(organizationId, query);
    } catch (error) {
      this.storageError(error);
    }
  }

  async requestWorker(
    organizationId: string,
    input: { plantId: string; name: string; email?: string; phone?: string },
    context: WorkerMutationContext,
  ): Promise<WorkerItem> {
    const requestId = randomUUID();
    const workerId = randomUUID();
    const requestedAt = new Date().toISOString();
    const changes: Record<string, AuditFieldChange> = {
      name: { before: null, after: input.name },
      plant_id: { before: null, after: input.plantId },
      status: { before: null, after: "PROVISIONAL" },
      ...(input.email === undefined
        ? {}
        : { email: { before: null, after: input.email } }),
      ...(input.phone === undefined
        ? {}
        : { phone: { before: null, after: input.phone } }),
    };

    return this.auditTrail.execute(
      {
        correlationId: context.correlationId,
        organizationId,
        actor: this.actor(context.auth),
        origin: "API",
        action: AUDIT_ACTIONS.BUSINESS_MUTATION,
        entityType: "worker",
        entityId: workerId,
        failureResult: "REJECTED",
        failureReasonCode: "WORKER_REQUEST_REJECTED",
        allowedChangeFields: Object.keys(changes),
        changes,
      },
      async () => {
        try {
          return await this.repository.requestWorker({
            requestId,
            workerId,
            organizationId,
            plantId: input.plantId,
            requesterProfileId: context.auth.profile.id,
            name: input.name,
            ...(input.email === undefined ? {} : { email: input.email }),
            ...(input.phone === undefined ? {} : { phone: input.phone }),
            requestedAt,
          });
        } catch (error) {
          this.storageError(error);
        }
      },
    );
  }

  async resolve(
    organizationId: string,
    requestId: string,
    action: WorkerResolution,
    input: { reason?: string; canonicalWorkerId?: string },
    context: WorkerMutationContext,
  ): Promise<WorkerItem> {
    if ((action === "REJECT" || action === "MERGE") && !input.reason?.trim()) {
      throw new ApplicationError(
        HttpStatus.BAD_REQUEST,
        "RESOLUTION_REASON_REQUIRED",
        "A reason is required for rejection or merge",
      );
    }
    if (action === "MERGE" && input.canonicalWorkerId === undefined) {
      throw new ApplicationError(
        HttpStatus.BAD_REQUEST,
        "CANONICAL_WORKER_REQUIRED",
        "A canonical worker is required for merge",
      );
    }

    const changes: Record<string, AuditFieldChange> = {
      request_status: {
        before: "PENDING",
        after: { APPROVE: "APPROVED", REJECT: "REJECTED", MERGE: "MERGED" }[
          action
        ],
      },
      worker_status: {
        before: null,
        after: action === "APPROVE" ? "ACTIVO" : "RECHAZADO",
      },
      ...(input.canonicalWorkerId === undefined
        ? {}
        : {
            canonical_worker_id: {
              before: null,
              after: input.canonicalWorkerId,
            },
          }),
    };

    return this.auditTrail.execute(
      {
        correlationId: context.correlationId,
        organizationId,
        actor: this.actor(context.auth),
        origin: "API",
        action: AUDIT_ACTIONS.BUSINESS_MUTATION,
        entityType: "worker_request",
        entityId: requestId,
        failureResult: "REJECTED",
        failureReasonCode: "WORKER_RESOLUTION_REJECTED",
        allowedChangeFields: Object.keys(changes),
        changes,
      },
      async () => {
        try {
          return await this.repository.resolveRequest({
            organizationId,
            requestId,
            resolverProfileId: context.auth.profile.id,
            action,
            ...(input.reason === undefined ? {} : { reason: input.reason }),
            ...(input.canonicalWorkerId === undefined
              ? {}
              : { canonicalWorkerId: input.canonicalWorkerId }),
            resolvedAt: new Date().toISOString(),
            mergeId: randomUUID(),
          });
        } catch (error) {
          this.storageError(error);
        }
      },
    );
  }

  async setActive(
    organizationId: string,
    workerId: string,
    active: boolean,
    context: WorkerMutationContext,
  ): Promise<WorkerItem> {
    let before: WorkerItem | null;
    try {
      before = await this.repository.findWorker(organizationId, workerId);
    } catch (error) {
      this.storageError(error);
    }
    if (before === null) this.notFound();
    if (before.isActive === active) {
      throw new ApplicationError(
        HttpStatus.CONFLICT,
        "WORKER_STATE_UNCHANGED",
        "Worker already has the requested state",
      );
    }

    return this.auditTrail.execute(
      {
        correlationId: context.correlationId,
        organizationId,
        actor: this.actor(context.auth),
        origin: "API",
        action: AUDIT_ACTIONS.BUSINESS_MUTATION,
        entityType: "worker",
        entityId: workerId,
        failureResult: "REJECTED",
        failureReasonCode: "WORKER_STATE_REJECTED",
        allowedChangeFields: ["is_active"],
        changes: { is_active: { before: before.isActive, after: active } },
      },
      async () => {
        try {
          const result = await this.repository.setWorkerActive(
            organizationId,
            workerId,
            active,
          );
          if (result === null) this.notFound();
          return result;
        } catch (error) {
          this.storageError(error);
        }
      },
    );
  }

  private async expire(organizationId: string): Promise<void> {
    try {
      await this.repository.expire(organizationId, new Date().toISOString());
    } catch (error) {
      this.storageError(error);
    }
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
      "WORKER_NOT_FOUND",
      "Worker was not found",
    );
  }

  private storageError(error: unknown): never {
    if (!(error instanceof SupabaseDataError)) throw error;
    const businessCodes: Record<string, { status: HttpStatus; code: string }> =
      {
        "42501": {
          status: HttpStatus.FORBIDDEN,
          code: "WORKER_ACTION_FORBIDDEN",
        },
        "23503": {
          status: HttpStatus.CONFLICT,
          code: "WORKER_REFERENCE_INVALID",
        },
        "23505": { status: HttpStatus.CONFLICT, code: "WORKER_DUPLICATE" },
        "23514": {
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          code: "WORKER_RULE_VIOLATION",
        },
        P0002: {
          status: HttpStatus.NOT_FOUND,
          code: "WORKER_REQUEST_NOT_FOUND",
        },
      };
    const mapped = businessCodes[error.databaseCode];
    if (mapped !== undefined) {
      throw new ApplicationError(
        mapped.status,
        mapped.code,
        "Worker operation could not be completed",
      );
    }
    throw new ApplicationError(
      HttpStatus.SERVICE_UNAVAILABLE,
      "WORKER_STORAGE_UNAVAILABLE",
      "Worker storage is temporarily unavailable",
    );
  }
}
