import type {
  AccountStatus,
  PreferredLocale,
  RoleCode,
} from "../auth/auth.contracts";
import type { PageResponse } from "../common/dto/page-query.dto";

export const ACCOUNTS_REPOSITORY = Symbol("ACCOUNTS_REPOSITORY");

export type AccountGovernanceAction = "APPROVE" | "SUSPEND" | "REACTIVATE";

export interface AccountItem {
  id: string;
  organizationId: string;
  displayName: string;
  preferredLocale: PreferredLocale;
  accountStatus: AccountStatus;
  roleCode: RoleCode;
  statusReason: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AccountListQuery {
  page: number;
  pageSize: number;
  search?: string;
  status?: AccountStatus;
  roleCode: RoleCode;
}

export interface AdministratorPermissionItem {
  code: string;
  description: string;
  assigned: boolean;
}

export interface CreateAdministratorInput {
  id: string;
  organizationId: string;
  email: string;
  displayName: string;
  preferredLocale: PreferredLocale;
  creatorProfileId: string;
  permissionCodes: readonly string[];
  occurredAt: string;
  grantIds: readonly string[];
}

export interface AccountsRepository {
  list(
    organizationId: string,
    query: AccountListQuery,
  ): Promise<PageResponse<AccountItem>>;
  find(organizationId: string, profileId: string): Promise<AccountItem | null>;
  govern(input: {
    organizationId: string;
    targetProfileId: string;
    governorProfileId: string;
    action: AccountGovernanceAction;
    reason?: string;
    occurredAt: string;
  }): Promise<AccountItem>;
  updateLocale(
    organizationId: string,
    profileId: string,
    locale: PreferredLocale,
  ): Promise<AccountItem | null>;
  createAdministrator(input: CreateAdministratorInput): Promise<AccountItem>;
  listAdministratorPermissions(
    organizationId: string,
    profileId: string,
  ): Promise<readonly AdministratorPermissionItem[]>;
  replaceAdministratorPermissions(input: {
    organizationId: string;
    profileId: string;
    governorProfileId: string;
    permissionCodes: readonly string[];
    grantIds: readonly string[];
    occurredAt: string;
  }): Promise<void>;
}
