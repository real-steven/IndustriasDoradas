import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { ApiOkResponse, ApiProduces, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";

import {
  ReportSettlementQueryDto,
  SaveReportSettlementDto,
  TransitionReportSettlementDto,
  UpdateReportSettlementDto,
} from "./report-settlements.dto";
import { PayrollExcelExporter } from "./payroll.excel";
import { PayrollPdfExporter } from "./payroll.pdf";
import { ReportSettlementsService } from "./report-settlements.service";
import { ProductionReportQueryDto } from "./reports.dto";
import { ReportsExcelExporter } from "./reports.excel";
import { ReportsPdfExporter } from "./reports.pdf";
import { ReportsService } from "./reports.service";
import { PayrollQueryDto } from "../attendance/payroll.dto";
import { PayrollService } from "../attendance/payroll.service";
import {
  RequireOrganizationParam,
  RequirePermissions,
  RequireRoles,
} from "../auth/auth.metadata";
import type { AuthenticatedRequest } from "../auth/authenticated-request";

@Controller({
  path: "organizations/:organizationId/reports",
  version: "1",
})
@RequireOrganizationParam()
@RequireRoles("JEFE_EMPRESA")
@ApiTags("Reports")
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly settlements: ReportSettlementsService,
    private readonly excel: ReportsExcelExporter,
    private readonly pdf: ReportsPdfExporter,
    private readonly payroll: PayrollService,
    private readonly payrollExcel: PayrollExcelExporter,
    private readonly payrollPdf: PayrollPdfExporter,
  ) {}

  @Get("production")
  @RequirePermissions("reports.read")
  production(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Query() query: ProductionReportQueryDto,
  ) {
    return this.reports.production(organizationId, query);
  }

  @Get("production.xlsx")
  @RequirePermissions("reports.read")
  @ApiProduces(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  )
  @ApiOkResponse({
    description: "Reporte Excel de producción y oro",
    schema: { type: "string", format: "binary" },
  })
  async productionExcel(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Query() query: ProductionReportQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const report = await this.reports.production(organizationId, query);
    const buffer = await this.excel.export(report);
    response.set({
      "Content-Disposition": `attachment; filename="${this.filename(report, "xlsx")}"`,
      "Content-Length": String(buffer.length),
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "X-Content-Type-Options": "nosniff",
    });
    return new StreamableFile(buffer);
  }

  @Get("production.pdf")
  @RequirePermissions("reports.read")
  @ApiProduces("application/pdf")
  @ApiOkResponse({
    description: "Reporte PDF de producción y oro",
    schema: { type: "string", format: "binary" },
  })
  async productionPdf(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Query() query: ProductionReportQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const report = await this.reports.production(organizationId, query);
    const buffer = await this.pdf.export(report);
    response.set({
      "Content-Disposition": `attachment; filename="${this.filename(report, "pdf")}"`,
      "Content-Length": String(buffer.length),
      "Content-Type": "application/pdf",
      "X-Content-Type-Options": "nosniff",
    });
    return new StreamableFile(buffer);
  }

  @Get("payroll")
  @RequirePermissions("payroll.read")
  payrollReport(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Query() query: PayrollQueryDto,
  ) {
    return this.payroll.report(organizationId, query);
  }

  @Get("payroll.xlsx")
  @RequirePermissions("payroll.read")
  @ApiProduces(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  )
  async payrollSpreadsheet(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Query() query: PayrollQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const report = await this.payroll.report(organizationId, query);
    const buffer = await this.payrollExcel.export(report);
    response.set({
      "Content-Disposition": `attachment; filename="pre-nomina_${query.fromDate}_${query.toDate}.xlsx"`,
      "Content-Length": String(buffer.length),
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "X-Content-Type-Options": "nosniff",
    });
    return new StreamableFile(buffer);
  }

  @Get("payroll.pdf")
  @RequirePermissions("payroll.read")
  @ApiProduces("application/pdf")
  async payrollDocument(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Query() query: PayrollQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const report = await this.payroll.report(organizationId, query);
    const buffer = await this.payrollPdf.export(report);
    response.set({
      "Content-Disposition": `attachment; filename="pre-nomina_${query.fromDate}_${query.toDate}.pdf"`,
      "Content-Length": String(buffer.length),
      "Content-Type": "application/pdf",
      "X-Content-Type-Options": "nosniff",
    });
    return new StreamableFile(buffer);
  }

  @Get("settlements")
  @RequirePermissions("reports.read")
  listSettlements(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Query() query: ReportSettlementQueryDto,
  ) {
    return this.settlements.list(organizationId, query);
  }

  @Get("settlements/weekly-summary")
  @RequirePermissions("reports.read")
  weeklySummary(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Query() query: ReportSettlementQueryDto,
  ) {
    return this.settlements.weeklySummary(organizationId, query);
  }

  @Post("settlements")
  @RequirePermissions("reports.manage")
  createSettlement(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Body() body: SaveReportSettlementDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.settlements.create(organizationId, body, this.context(request));
  }

  @Patch("settlements/:settlementId")
  @RequirePermissions("reports.manage")
  updateSettlement(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("settlementId", ParseUUIDPipe) settlementId: string,
    @Body() body: UpdateReportSettlementDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.settlements.update(
      organizationId,
      settlementId,
      body,
      this.context(request),
    );
  }

  @Post("settlements/:settlementId/status")
  @RequirePermissions("reports.manage")
  transitionSettlement(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("settlementId", ParseUUIDPipe) settlementId: string,
    @Body() body: TransitionReportSettlementDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.settlements.transition(
      organizationId,
      settlementId,
      body.rowVersion,
      body.status,
      this.context(request),
    );
  }

  @Post("settlements/:settlementId/corrections")
  @RequirePermissions("reports.manage")
  createSettlementCorrection(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("settlementId", ParseUUIDPipe) settlementId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.settlements.createCorrection(
      organizationId,
      settlementId,
      this.context(request),
    );
  }

  private filename(
    report: Awaited<ReturnType<ReportsService["production"]>>,
    extension: "xlsx" | "pdf",
  ): string {
    const from = this.localDate(report.period.fromUtc);
    const to = this.localDate(new Date(Date.parse(report.period.toUtc) - 1));
    return `reporte-produccion-oro_${from}_${to}_${report.language}.${extension}`;
  }

  private localDate(value: string | Date): string {
    const parts = new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      month: "2-digit",
      timeZone: "America/Costa_Rica",
      year: "numeric",
    }).formatToParts(new Date(value));
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((candidate) => candidate.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}`;
  }

  private context(request: AuthenticatedRequest) {
    if (request.auth === undefined || request.correlationId === undefined) {
      throw new Error("Authenticated request context is missing");
    }
    return { auth: request.auth, correlationId: request.correlationId };
  }
}
