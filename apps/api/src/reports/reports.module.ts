import { Module } from "@nestjs/common";

import { REPORT_SETTLEMENT_REPOSITORY } from "./report-settlements.contracts";
import { PayrollExcelExporter } from "./payroll.excel";
import { PayrollPdfExporter } from "./payroll.pdf";
import { ReportSettlementsService } from "./report-settlements.service";
import { ReportsController } from "./reports.controller";
import { ReportsExcelExporter } from "./reports.excel";
import { ReportsPdfExporter } from "./reports.pdf";
import { ReportsService } from "./reports.service";
import { SupabaseReportSettlementRepository } from "./supabase-report-settlements.repository";
import { AttendanceModule } from "../attendance/attendance.module";
import { ManagementModule } from "../management/management.module";

@Module({
  imports: [ManagementModule, AttendanceModule],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ReportSettlementsService,
    ReportsExcelExporter,
    ReportsPdfExporter,
    PayrollExcelExporter,
    PayrollPdfExporter,
    {
      provide: REPORT_SETTLEMENT_REPOSITORY,
      useClass: SupabaseReportSettlementRepository,
    },
  ],
  exports: [ReportSettlementsService, REPORT_SETTLEMENT_REPOSITORY],
})
export class ReportsModule {}
