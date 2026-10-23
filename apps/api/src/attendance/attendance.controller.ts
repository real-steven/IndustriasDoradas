import { Controller, Get, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { AttendanceHoursQueryDto } from "./attendance.dto";
import { AttendanceService } from "./attendance.service";
import {
  RequireOrganizationParam,
  RequirePermissions,
  RequireRoles,
} from "../auth/auth.metadata";

@Controller({
  path: "organizations/:organizationId/management/attendance",
  version: "1",
})
@RequireOrganizationParam()
@RequireRoles("JEFE_EMPRESA")
@ApiTags("Attendance")
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get("hours")
  @RequirePermissions("attendance.read")
  hours(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Query() query: AttendanceHoursQueryDto,
  ) {
    return this.attendance.hours(organizationId, query);
  }
}
