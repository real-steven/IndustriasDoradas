import type { PageResponse } from "../common/dto/page-query.dto";

export type CatalogResource =
  "plants" | "production_lines" | "line_components" | "stations" | "suppliers";

export interface CatalogListQuery {
  page: number;
  pageSize: number;
  search?: string;
  state: "all" | "active" | "inactive";
  plantId?: string;
  productionLineId?: string;
}

export interface CatalogItem {
  id: string;
  organizationId: string;
  code?: string;
  name: string;
  isActive: boolean;
  deactivatedAt: string | null;
  plantId?: string;
  productionLineId?: string;
  componentTypeId?: string;
  displayOrder?: number;
  timezone?: string;
  permissionVersion?: number;
  email?: string | null;
  phone?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ComponentTypeItem {
  id: string;
  code: string;
  nameEs: string;
  nameEn: string;
  isActive: boolean;
}

export interface CreateCatalogRecord {
  id: string;
  organizationId: string;
  code?: string;
  name: string;
  plantId?: string;
  productionLineId?: string;
  componentTypeId?: string;
  displayOrder?: number;
  timezone?: string;
  deviceKey?: string;
  email?: string | null;
  phone?: string | null;
}

export interface UpdateCatalogRecord {
  code?: string;
  name?: string;
  componentTypeId?: string;
  displayOrder?: number;
  timezone?: string;
  deviceKey?: string;
  email?: string | null;
  phone?: string | null;
}

export interface CatalogRepository {
  list(
    resource: CatalogResource,
    organizationId: string,
    query: CatalogListQuery,
  ): Promise<PageResponse<CatalogItem>>;
  findById(
    resource: CatalogResource,
    organizationId: string,
    id: string,
  ): Promise<CatalogItem | null>;
  create(
    resource: CatalogResource,
    record: CreateCatalogRecord,
  ): Promise<CatalogItem>;
  update(
    resource: CatalogResource,
    organizationId: string,
    id: string,
    changes: UpdateCatalogRecord,
  ): Promise<CatalogItem | null>;
  setActive(
    resource: CatalogResource,
    organizationId: string,
    id: string,
    active: boolean,
  ): Promise<CatalogItem | null>;
  listComponentTypes(): Promise<readonly ComponentTypeItem[]>;
}

export const CATALOG_REPOSITORY = Symbol("CATALOG_REPOSITORY");
