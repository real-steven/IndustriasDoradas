import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";

import {
  AccountGovernanceDto,
  AccountQueryDto,
  CreateAdministratorDto,
  PermissionSelectionDto,
  UpdateLocaleDto,
} from "./accounts.dto";
import { AccountsService } from "./accounts.service";
import type { AccountGovernanceAction } from "./accounts.contracts";
import { CurrentAuth } from "../auth/current-auth.decorator";
import {
  RequireOrganizationParam,
  RequirePermissions,
} from "../auth/auth.metadata";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import type { AuthenticatedContext } from "../auth/auth.contracts";

@Controller({ path: "organizations/:organizationId/accounts", version: "1" })
@RequireOrganizationParam()
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  list(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Query() query: AccountQueryDto,
    @CurrentAuth() auth: AuthenticatedContext,
  ) {
    return this.accounts.list(organizationId, query, auth);
  }

  @Post("administrators")
  @RequirePermissions("administrators.create")
  createAdministrator(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Body() body: CreateAdministratorDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.accounts.createAdministrator(
      organizationId,
      body,
      this.context(request),
    );
  }

  @Get("administrator-permissions")
  @RequirePermissions("administrators.create")
  listAvailablePermissions(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @CurrentAuth() auth: AuthenticatedContext,
  ) {
    return this.accounts.listAvailablePermissions(organizationId, auth);
  }

  @Get(":id/permissions")
  @RequirePermissions("administrators.permissions.manage")
  listPermissions(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthenticatedContext,
  ) {
    return this.accounts.listPermissions(organizationId, id, auth);
  }

  @Put(":id/permissions")
  @RequirePermissions("administrators.permissions.manage")
  replacePermissions(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: PermissionSelectionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.accounts.replacePermissions(
      organizationId,
      id,
      body,
      this.context(request),
    );
  }

  @Post(":id/approve")
  approve(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: AccountGovernanceDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.govern(organizationId, id, "APPROVE", body, request);
  }

  @Post(":id/suspend")
  suspend(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: AccountGovernanceDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.govern(organizationId, id, "SUSPEND", body, request);
  }

  @Post(":id/reactivate")
  reactivate(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: AccountGovernanceDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.govern(organizationId, id, "REACTIVATE", body, request);
  }

  private govern(
    organizationId: string,
    id: string,
    action: AccountGovernanceAction,
    body: AccountGovernanceDto,
    request: AuthenticatedRequest,
  ) {
    return this.accounts.govern(organizationId, id, action, body, {
      ...this.context(request),
    });
  }

  private context(request: AuthenticatedRequest) {
    if (request.auth === undefined || request.correlationId === undefined) {
      throw new Error("Authenticated request context is missing");
    }
    return { auth: request.auth, correlationId: request.correlationId };
  }
}

@Controller({ path: "profile", version: "1" })
export class ProfilePreferencesController {
  constructor(private readonly accounts: AccountsService) {}

  @Patch("locale")
  updateLocale(
    @Body() body: UpdateLocaleDto,
    @Req() request: AuthenticatedRequest,
  ) {
    if (request.auth === undefined || request.correlationId === undefined) {
      throw new Error("Authenticated request context is missing");
    }
    return this.accounts.updateOwnLocale(body.locale, {
      auth: request.auth,
      correlationId: request.correlationId,
    });
  }
}
