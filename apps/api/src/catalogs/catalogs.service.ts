import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import {
  CATALOG_REPOSITORY,
  type CatalogItem,
  type CatalogListQuery,
  type CatalogRepository,
  type CatalogResource,
  type CreateCatalogRecord,
  type UpdateCatalogRecord,
} from "./catalogs.contracts";
import { SupabaseDataError } from "./supabase-catalog.repository";
import {
  AUDIT_ACTIONS,
  type AuditActor,
  type AuditFieldChange,
} from "../audit/audit.contracts";
import { AuditTrailService } from "../audit/audit-trail.service";
import type { AuthenticatedContext } from "../auth/auth.contracts";
import type { PageResponse } from "../common/dto/page-query.dto";
import { ApplicationError } from "../common/errors/application-error";

export interface MutationContext {
  auth: AuthenticatedContext;
  correlationId: string;
}

@Injectable()
export class CatalogsService {
  constructor(
    @Inject(CATALOG_REPOSITORY)
    private readonly repository: CatalogRepository,
    private readonly auditTrail: AuditTrailService,
  ) {}

  async list(
    resource: CatalogResource,
    organizationId: string,
    query: CatalogListQuery,
  ): Promise<PageResponse<CatalogItem>> {
    try {
      return await this.repository.list(resource, organizationId, query);
    } catch (error) {
      this.throwRepositoryError(error);
    }
  }

  async listComponentTypes() {
    try {
      return await this.repository.listComponentTypes();
    } catch (error) {
      this.throwRepositoryError(error);
    }
  }

  async create(
    resource: CatalogResource,
    record: Omit<CreateCatalogRecord, "id">,
    context: MutationContext,
  ): Promise<CatalogItem> {
    const id = randomUUID();
    return this.auditTrail.execute(
      {
        correlationId: context.correlationId,
        organizationId: record.organizationId,
        actor: this.actor(context.auth),
        origin: "API",
        action: AUDIT_ACTIONS.BUSINESS_MUTATION,
        entityType: this.entityType(resource),
        entityId: id,
        failureResult: "REJECTED",
        failureReasonCode: "CATALOG_MUTATION_REJECTED",
        allowedChangeFields: this.auditableCreateFields(record),
        changes: this.createChanges(record),
      },
      async () => {
        try {
          return await this.repository.create(resource, {
            ...record,
            id,
            ...(record.code === undefined
              ? {}
              : { code: record.code.toUpperCase() }),
          });
        } catch (error) {
          this.throwRepositoryError(error);
        }
      },
    );
  }

  async update(
    resource: CatalogResource,
    organizationId: string,
    id: string,
    changes: UpdateCatalogRecord,
    context: MutationContext,
  ): Promise<CatalogItem> {
    const before = await this.requireItem(resource, organizationId, id);
    const normalized = {
      ...changes,
      ...(changes.code === undefined
        ? {}
        : { code: changes.code.toUpperCase() }),
    };
    const auditChanges = this.updateChanges(before, normalized);

    return this.auditTrail.execute(
      {
        correlationId: context.correlationId,
        organizationId,
        actor: this.actor(context.auth),
        origin: "API",
        action: AUDIT_ACTIONS.BUSINESS_MUTATION,
        entityType: this.entityType(resource),
        entityId: id,
        failureResult: "REJECTED",
        failureReasonCode: "CATALOG_MUTATION_REJECTED",
        allowedChangeFields: Object.keys(auditChanges),
        changes: auditChanges,
      },
      async () => {
        try {
          const updated = await this.repository.update(
            resource,
            organizationId,
            id,
            normalized,
          );
          if (updated === null) this.notFound(resource);
          return updated;
        } catch (error) {
          this.throwRepositoryError(error);
        }
      },
    );
  }

  async setActive(
    resource: CatalogResource,
    organizationId: string,
    id: string,
    active: boolean,
    context: MutationContext,
  ): Promise<CatalogItem> {
    const before = await this.requireItem(resource, organizationId, id);
    if (before.isActive === active) {
      throw new ApplicationError(
        HttpStatus.CONFLICT,
        "CATALOG_STATE_UNCHANGED",
        active
          ? "Catalog item is already active"
          : "Catalog item is already inactive",
      );
    }

    return this.auditTrail.execute(
      {
        correlationId: context.correlationId,
        organizationId,
        actor: this.actor(context.auth),
        origin: "API",
        action: AUDIT_ACTIONS.BUSINESS_MUTATION,
        entityType: this.entityType(resource),
        entityId: id,
        failureResult: "REJECTED",
        failureReasonCode: "CATALOG_STATE_REJECTED",
        allowedChangeFields: ["is_active"],
        changes: { is_active: { before: before.isActive, after: active } },
      },
      async () => {
        try {
          const updated = await this.repository.setActive(
            resource,
            organizationId,
            id,
            active,
          );
          if (updated === null) this.notFound(resource);
          return updated;
        } catch (error) {
          this.throwRepositoryError(error);
        }
      },
    );
  }

  private async requireItem(
    resource: CatalogResource,
    organizationId: string,
    id: string,
  ): Promise<CatalogItem> {
    try {
      const item = await this.repository.findById(resource, organizationId, id);
      if (item === null) this.notFound(resource);
      return item;
    } catch (error) {
      this.throwRepositoryError(error);
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

  private auditableCreateFields(
    record: Omit<CreateCatalogRecord, "id">,
  ): string[] {
    return Object.keys(this.createChanges(record));
  }

  private createChanges(
    record: Omit<CreateCatalogRecord, "id">,
  ): Record<string, AuditFieldChange> {
    const values: Record<string, string | number | boolean | null | undefined> =
      {
        code: record.code,
        name: record.name,
        plant_id: record.plantId,
        production_line_id: record.productionLineId,
        component_type_id: record.componentTypeId,
        display_order: record.displayOrder,
        timezone: record.timezone,
        email: record.email,
        phone: record.phone,
        is_active: true,
      };
    return Object.fromEntries(
      Object.entries(values)
        .filter(([, value]) => value !== undefined)
        .map(([field, value]) => [
          field,
          { before: null, after: value ?? null },
        ]),
    );
  }

  private updateChanges(
    before: CatalogItem,
    changes: UpdateCatalogRecord,
  ): Record<string, AuditFieldChange> {
    const previous: Record<
      keyof UpdateCatalogRecord,
      string | number | null | undefined
    > = {
      code: before.code,
      name: before.name,
      componentTypeId: before.componentTypeId,
      displayOrder: before.displayOrder,
      timezone: before.timezone,
      deviceKey: undefined,
      email: before.email,
      phone: before.phone,
    };
    const names: Record<keyof UpdateCatalogRecord, string> = {
      code: "code",
      name: "name",
      componentTypeId: "component_type_id",
      displayOrder: "display_order",
      timezone: "timezone",
      deviceKey: "device_identifier_changed",
      email: "email",
      phone: "phone",
    };
    const result: Record<string, AuditFieldChange> = {};
    for (const key of Object.keys(changes) as (keyof UpdateCatalogRecord)[]) {
      const after = changes[key];
      if (after !== undefined) {
        const field = names[key];
        result[field] = {
          before: key === "deviceKey" ? null : (previous[key] ?? null),
          after: key === "deviceKey" ? true : after,
        };
      }
    }
    return result;
  }

  private entityType(resource: CatalogResource): string {
    return {
      plants: "plant",
      production_lines: "production_line",
      line_components: "line_component",
      stations: "station",
      suppliers: "supplier",
    }[resource];
  }

  private notFound(resource: CatalogResource): never {
    throw new ApplicationError(
      HttpStatus.NOT_FOUND,
      "CATALOG_ITEM_NOT_FOUND",
      `${this.entityType(resource)} was not found`,
    );
  }

  private throwRepositoryError(error: unknown): never {
    if (!(error instanceof SupabaseDataError)) throw error;
    if (error.databaseCode === "23505") {
      throw new ApplicationError(
        HttpStatus.CONFLICT,
        "CATALOG_DUPLICATE",
        "A catalog item with the same unique value already exists",
      );
    }
    if (error.databaseCode === "23503") {
      throw new ApplicationError(
        HttpStatus.CONFLICT,
        "CATALOG_REFERENCE_PROTECTED",
        "The catalog reference does not exist or is protected",
      );
    }
    if (error.databaseCode === "23514") {
      throw new ApplicationError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "CATALOG_RULE_VIOLATION",
        "The catalog change violates a business restriction",
      );
    }
    throw new ApplicationError(
      HttpStatus.SERVICE_UNAVAILABLE,
      "CATALOG_STORAGE_UNAVAILABLE",
      "Catalog storage is temporarily unavailable",
    );
  }
}
