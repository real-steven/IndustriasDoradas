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
import { ApiTags } from "@nestjs/swagger";

import { AttendanceHoursQueryDto } from "./attendance.dto";
import { AttendanceService } from "./attendance.service";
import {
  CreatePayrollAdjustmentDto,
  CreatePayrollGrossAuthorizationDto,
  CreatePayrollRateDto,
  PayrollQueryDto,
  PayrollWorkerDirectoryQueryDto,
  UpdatePayrollWorkerProfileDto,
} from "./payroll.dto";
import { PayrollService } from "./payroll.service";
import {
  RequireOrganizationParam,
  RequirePermissions,
  RequireRoles,
} from "../auth/auth.metadata";
import type { AuthenticatedRequest } from "../auth/authenticated-request";

@Controller({
  path: "organizations/:organizationId/management/attendance",
  version: "1",
})
@RequireOrganizationParam()
@RequireRoles("JEFE_EMPRESA")
@ApiTags("Attendance")
export class AttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly payroll: PayrollService,
  ) {}

  @Get("hours")
  @RequirePermissions("attendance.read")
  hours(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Query() query: AttendanceHoursQueryDto,
  ) {
    return this.attendance.hours(organizationId, query);
  }

  @Get("payroll/workers")
  @RequirePermissions("payroll.read")
  payrollWorkers(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Query() query: PayrollWorkerDirectoryQueryDto,
  ) {
    return this.payroll.workers(organizationId, query.search);
  }

  @Get("payroll")
  @RequirePermissions("payroll.read")
  payrollReport(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Query() query: PayrollQueryDto,
  ) {
    return this.payroll.report(organizationId, query);
  }

  @Patch("payroll/workers/:workerId/profile")
  @RequirePermissions("payroll.manage")
  updatePayrollProfile(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("workerId", ParseUUIDPipe) workerId: string,
    @Body() body: UpdatePayrollWorkerProfileDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.payroll.setIdentity(
      organizationId,
      workerId,
      body.identityNumber,
      this.context(request),
    );
  }

  @Post("payroll/workers/:workerId/pay-rates")
  @RequirePermissions("payroll.manage")
  createPayrollRate(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("workerId", ParseUUIDPipe) workerId: string,
    @Body() body: CreatePayrollRateDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.payroll.createRate(
      organizationId,
      workerId,
      body,
      this.context(request),
    );
  }

  @Post("payroll/workers/:workerId/adjustments")
  @RequirePermissions("payroll.manage")
  createPayrollAdjustment(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("workerId", ParseUUIDPipe) workerId: string,
    @Body() body: CreatePayrollAdjustmentDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.payroll.createAdjustment(
      organizationId,
      workerId,
      body,
      this.context(request),
    );
  }

  @Post("payroll/workers/:workerId/gross-authorizations")
  @RequirePermissions("payroll.manage")
  createPayrollGrossAuthorization(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("workerId", ParseUUIDPipe) workerId: string,
    @Body() body: CreatePayrollGrossAuthorizationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.payroll.createGrossAuthorization(
      organizationId,
      workerId,
      body,
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
