import { Module } from "@nestjs/common";

import { AttendanceController } from "./attendance.controller";
import { ATTENDANCE_QUERY_REPOSITORY } from "./attendance.contracts";
import { AttendanceService } from "./attendance.service";
import { SupabaseAttendanceQueryRepository } from "./supabase-attendance-query.repository";

@Module({
  controllers: [AttendanceController],
  providers: [
    AttendanceService,
    {
      provide: ATTENDANCE_QUERY_REPOSITORY,
      useClass: SupabaseAttendanceQueryRepository,
    },
  ],
  exports: [AttendanceService, ATTENDANCE_QUERY_REPOSITORY],
})
export class AttendanceModule {}
