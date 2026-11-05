import { Module } from "@nestjs/common";

import { AttendanceController } from "./attendance.controller";
import { ATTENDANCE_QUERY_REPOSITORY } from "./attendance.contracts";
import { AttendanceService } from "./attendance.service";
import { PAYROLL_REPOSITORY } from "./payroll.contracts";
import { PayrollService } from "./payroll.service";
import { SupabaseAttendanceQueryRepository } from "./supabase-attendance-query.repository";
import { SupabasePayrollRepository } from "./supabase-payroll.repository";

@Module({
  controllers: [AttendanceController],
  providers: [
    AttendanceService,
    PayrollService,
    {
      provide: ATTENDANCE_QUERY_REPOSITORY,
      useClass: SupabaseAttendanceQueryRepository,
    },
    {
      provide: PAYROLL_REPOSITORY,
      useClass: SupabasePayrollRepository,
    },
  ],
  exports: [
    AttendanceService,
    PayrollService,
    ATTENDANCE_QUERY_REPOSITORY,
    PAYROLL_REPOSITORY,
  ],
})
export class AttendanceModule {}
