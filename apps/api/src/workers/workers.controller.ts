import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";

import {
  CreateWorkerRequestDto,
  MergeWorkerRequestDto,
  ResolveWorkerRequestDto,
  SetWorkerStateDto,
  WorkerQueryDto,
  WorkerRequestQueryDto,
} from "./workers.dto";
import { WorkersService } from "./workers.service";
import {
  RequireOrganizationParam,
  RequirePermissions,
} from "../auth/auth.metadata";
import type { AuthenticatedRequest } from "../auth/authenticated-request";

@Controller({ path: "organizations/:organizationId", version: "1" })
@RequireOrganizationParam()
export class WorkersController {
  constructor(private readonly workers: WorkersService) {}

  @Get("worker-requests")
  @RequirePermissions("workers.read")
  listRequests(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Query() query: WorkerRequestQueryDto,
  ) {
    return this.workers.listRequests(organizationId, query);
  }

  @Get("workers")
  @RequirePermissions("organization_catalogs.read")
  listWorkers(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Query() query: WorkerQueryDto,
  ) {
    return this.workers.listWorkers(organizationId, query);
  }

  @Post("worker-requests")
  @RequirePermissions("workers.request")
  requestWorker(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Body() body: CreateWorkerRequestDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.workers.requestWorker(
      organizationId,
      body,
      this.context(request),
    );
  }

  @Post("worker-requests/:id/approve")
  @RequirePermissions("workers.resolve")
  approve(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("id", ParseUUIDPipe) requestId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.workers.resolve(
      organizationId,
      requestId,
      "APPROVE",
      {},
      this.context(request),
    );
  }

  @Post("worker-requests/:id/reject")
  @RequirePermissions("workers.resolve")
  reject(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("id", ParseUUIDPipe) requestId: string,
    @Body() body: ResolveWorkerRequestDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.workers.resolve(
      organizationId,
      requestId,
      "REJECT",
      body,
      this.context(request),
    );
  }

  @Post("worker-requests/:id/merge")
  @RequirePermissions("workers.resolve")
  merge(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("id", ParseUUIDPipe) requestId: string,
    @Body() body: MergeWorkerRequestDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.workers.resolve(
      organizationId,
      requestId,
      "MERGE",
      body,
      this.context(request),
    );
  }

  @Patch("workers/:id/state")
  @RequirePermissions("workers.resolve")
  setState(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("id", ParseUUIDPipe) workerId: string,
    @Body() body: SetWorkerStateDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.workers.setActive(
      organizationId,
      workerId,
      body.active,
      this.context(request),
    );
  }

  private context(request: AuthenticatedRequest) {
    if (request.auth === undefined || request.correlationId === undefined) {
      throw new Error("Authenticated request context is missing");
    }
    return { auth: request.auth, correlationId: request.correlationId };
  }
}
