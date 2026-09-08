import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import {
  AUDIT_EVENT_REPOSITORY,
  type AuditedOperationInput,
  type AuditEventInput,
  type AuditEventRecord,
  type AuditEventRepository,
  type AuditFieldChange,
  type AuditScalar,
} from "./audit.contracts";

const SENSITIVE_FIELD_PATTERN =
  /(password|contrasena|contraseña|pin|token|secret|authorization|cookie|photo|foto|image|imagen|biometric|biometr)/iu;
const CODE_PATTERN = /^[a-z][a-z0-9_.]*$/u;
const REASON_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/u;
const ALLOWED_HTTP_METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "HEAD",
]);

@Injectable()
export class AuditTrailService {
  private readonly logger = new Logger(AuditTrailService.name);

  constructor(
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly repository: AuditEventRepository,
  ) {}

  async record(input: AuditEventInput): Promise<void> {
    const changes = this.validateChanges(
      input.changes ?? {},
      input.allowedChangeFields ?? [],
    );
    this.validateInput(input);

    const event: AuditEventRecord = {
      id: randomUUID(),
      correlationId: input.correlationId,
      ...(input.organizationId === undefined
        ? {}
        : { organizationId: input.organizationId }),
      ...(input.stationId === undefined ? {} : { stationId: input.stationId }),
      actor: { ...input.actor },
      origin: input.origin,
      action: input.action,
      entityType: input.entityType,
      ...(input.entityId === undefined ? {} : { entityId: input.entityId }),
      result: input.result,
      ...(input.reasonCode === undefined
        ? {}
        : { reasonCode: input.reasonCode }),
      evidenceState: input.evidenceState ?? "NOT_APPLICABLE",
      changedFields: Object.keys(changes).sort(),
      changes,
      ...(input.request === undefined
        ? {}
        : {
            request: {
              method: input.request.method.toUpperCase(),
              path: input.request.path,
            },
          }),
      occurredAt: input.occurredAt ?? new Date(),
    };

    await this.repository.insert(event);
  }

  async recordBestEffort(input: AuditEventInput): Promise<void> {
    try {
      await this.record(input);
    } catch {
      this.logger.error({
        event: "audit_write_failed",
        action: input.action,
        result: input.result,
        correlationId: input.correlationId,
      });
    }
  }

  async execute<T>(
    input: AuditedOperationInput,
    operation: () => Promise<T>,
  ): Promise<T> {
    let result: T;
    try {
      result = await operation();
    } catch (error) {
      await this.recordBestEffort({
        ...input,
        result: input.failureResult,
        reasonCode: input.failureReasonCode,
        changes: {},
        allowedChangeFields: [],
      });
      throw error;
    }

    await this.record({ ...input, result: "SUCCEEDED" });
    return result;
  }

  private validateInput(input: AuditEventInput): void {
    if (!CODE_PATTERN.test(input.action)) {
      throw new Error("Audit action must be a lowercase stable code");
    }

    if (!CODE_PATTERN.test(input.entityType)) {
      throw new Error("Audit entity type must be a lowercase stable code");
    }

    if (
      input.reasonCode !== undefined &&
      !REASON_CODE_PATTERN.test(input.reasonCode)
    ) {
      throw new Error("Audit reason must be an uppercase stable code");
    }

    if (input.actor.profileId !== undefined) {
      if (
        input.organizationId === undefined ||
        input.actor.kind !== "AUTHENTICATED_USER" ||
        input.actor.authUserId === undefined ||
        input.actor.displayName?.trim() === "" ||
        input.actor.displayName === undefined ||
        input.actor.roleCode?.trim() === "" ||
        input.actor.roleCode === undefined
      ) {
        throw new Error("Profile audit actor requires its complete snapshot");
      }
    }

    if (input.stationId !== undefined && input.organizationId === undefined) {
      throw new Error("Station audit context requires an organization");
    }

    if (input.request !== undefined) {
      const method = input.request.method.toUpperCase();
      if (!ALLOWED_HTTP_METHODS.has(method)) {
        throw new Error("Audit request method is not supported");
      }
      if (
        !input.request.path.startsWith("/") ||
        input.request.path.includes("?") ||
        input.request.path.length > 512
      ) {
        throw new Error("Audit request path must exclude query parameters");
      }
    }
  }

  private validateChanges(
    changes: Readonly<Record<string, AuditFieldChange>>,
    allowedFields: readonly string[],
  ): Readonly<Record<string, AuditFieldChange>> {
    const allowed = new Set(allowedFields);
    const validated: Record<string, AuditFieldChange> = {};

    for (const [field, change] of Object.entries(changes)) {
      if (SENSITIVE_FIELD_PATTERN.test(field)) {
        throw new Error("Sensitive fields are forbidden in audit events");
      }
      if (!allowed.has(field)) {
        throw new Error(`Audit field is not allowlisted: ${field}`);
      }

      validated[field] = {
        before: this.validateScalar(change.before),
        after: this.validateScalar(change.after),
      };
    }

    return validated;
  }

  private validateScalar(value: AuditScalar): AuditScalar {
    if (
      value !== null &&
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    ) {
      throw new Error("Audit changes only accept scalar values");
    }

    if (typeof value === "string" && value.length > 512) {
      throw new Error("Audit change value is too long");
    }

    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error("Audit numeric values must be finite");
    }

    return value;
  }
}
