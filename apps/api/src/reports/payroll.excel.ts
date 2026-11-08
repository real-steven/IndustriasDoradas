import { Injectable } from "@nestjs/common";
import ExcelJS from "exceljs";

import type { PayrollReadModel } from "../attendance/payroll.contracts";

const NAVY = "173F54";
const PALE_BLUE = "EDF5F7";
const PALE_GOLD = "FFF4D8";

@Injectable()
export class PayrollExcelExporter {
  async export(report: PayrollReadModel): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Industrias Doradas";
    workbook.company = "Industrias Doradas";
    workbook.created = new Date(report.generatedAtUtc);
    workbook.title = "Pre-nómina gerencial";

    const summary = workbook.addWorksheet("Pre-nómina", {
      pageSetup: { fitToPage: true, fitToWidth: 1, orientation: "landscape" },
      views: [{ state: "frozen", ySplit: 7 }],
    });
    summary.columns = [
      { key: "worker", width: 28 },
      { key: "identity", width: 18 },
      { key: "hours", width: 18 },
      { key: "rate", width: 18 },
      { key: "gross", width: 20 },
      { key: "status", width: 24 },
    ];
    summary.mergeCells("A1:F2");
    this.title(summary.getCell("A1"), "Pre-nómina gerencial");
    summary.mergeCells("A3:F3");
    summary.getCell("A3").value =
      "Estimación bruta antes de CCSS, renta, embargos y otras deducciones legales.";
    summary.getCell("A3").font = { italic: true, color: { argb: "FF58717C" } };
    summary.getCell("A5").value = "Período";
    summary.getCell("B5").value =
      `${report.period.fromDate} — ${report.period.toDate}`;
    summary.getCell("A6").value = "Generado";
    summary.getCell("B6").value = new Date(report.generatedAtUtc);
    summary.getCell("B6").numFmt = "dd/mm/yyyy hh:mm";
    summary.addRow([
      "Trabajador",
      "Cédula",
      "Horas confirmadas",
      "Tarifa por hora",
      "Bruto calculado",
      "Estado",
    ]);
    this.header(summary.getRow(7));
    for (const item of report.workers) {
      const row = summary.addRow({
        worker: item.worker.name,
        identity: item.worker.identityNumber ?? "Pendiente",
        hours: item.confirmedMinutes / 60,
        rate: item.worker.currentHourlyRateCrc,
        gross: item.estimatedGrossAmountCrc,
        status:
          item.estimatedGrossAmountCrc === null
            ? "Falta configurar tarifa"
            : item.grossAuthorization === null
              ? "Calculado"
              : "Editado",
      });
      row.getCell(3).numFmt = "0.00";
      for (const column of [4, 5])
        row.getCell(column).numFmt = "₡#,##0.00;[Red]-₡#,##0.00";
      if (item.estimatedGrossAmountCrc === null) {
        row.eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: PALE_GOLD },
          };
        });
      }
    }
    const totalRow = summary.addRow({
      worker: "TOTAL",
      hours: report.summary.confirmedMinutes / 60,
      gross: report.summary.estimatedGrossAmountCrc,
      status:
        report.summary.estimatedGrossAmountCrc === null
          ? "Incompleto"
          : "Calculado",
    });
    totalRow.font = { bold: true };
    totalRow.getCell(3).numFmt = "0.00";
    totalRow.getCell(5).numFmt = "₡#,##0.00;[Red]-₡#,##0.00";

    const adjustments = workbook.addWorksheet("Comentarios", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    adjustments.columns = [
      { header: "Trabajador", key: "worker", width: 28 },
      { header: "Fecha", key: "date", width: 14 },
      { header: "Tipo", key: "type", width: 24 },
      { header: "Horas", key: "hours", width: 12 },
      { header: "Explicación", key: "note", width: 55 },
    ];
    this.header(adjustments.getRow(1));
    for (const item of report.workers) {
      for (const adjustment of item.adjustments) {
        const row = adjustments.addRow({
          worker: item.worker.name,
          date: adjustment.adjustmentDate,
          type: adjustment.adjustmentType,
          hours: adjustment.minutes === null ? null : adjustment.minutes / 60,
          note: adjustment.note,
        });
        row.getCell(4).numFmt = "0.00";
      }
    }
    adjustments.autoFilter = "A1:E1";

    const authorizations = workbook.addWorksheet("Cambios al bruto", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    authorizations.columns = [
      { header: "Trabajador", key: "worker", width: 28 },
      { header: "Desde", key: "from", width: 14 },
      { header: "Hasta", key: "to", width: 14 },
      { header: "Bruto registrado", key: "amount", width: 22 },
      { header: "Motivo", key: "reason", width: 45 },
      { header: "Responsable", key: "actor", width: 28 },
      { header: "Registrado", key: "recorded", width: 22 },
    ];
    this.header(authorizations.getRow(1));
    for (const item of report.workers) {
      for (const authorization of item.grossAuthorizations) {
        const row = authorizations.addRow({
          worker: item.worker.name,
          from: authorization.fromDate,
          to: authorization.toDate,
          amount: authorization.authorizedAmountCrc,
          reason: authorization.reason,
          actor: authorization.recordedByName,
          recorded: new Date(authorization.recordedAtUtc),
        });
        row.getCell(4).numFmt = "₡#,##0.00";
        row.getCell(7).numFmt = "dd/mm/yyyy hh:mm";
      }
    }

    const history = workbook.addWorksheet("Historial de tarifas", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    history.columns = [
      { header: "Trabajador", key: "worker", width: 28 },
      { header: "Tarifa por hora", key: "rate", width: 20 },
      { header: "Vigente desde", key: "effective", width: 22 },
      { header: "Motivo", key: "reason", width: 55 },
    ];
    this.header(history.getRow(1));
    for (const item of report.workers) {
      for (const rate of item.rates) {
        const row = history.addRow({
          worker: item.worker.name,
          rate: rate.regularHourlyRateCrc,
          effective: new Date(rate.effectiveFromUtc),
          reason: rate.reason,
        });
        row.getCell(2).numFmt = "₡#,##0.00";
        row.getCell(3).numFmt = "dd/mm/yyyy hh:mm";
      }
    }

    for (const sheet of workbook.worksheets) {
      sheet.eachRow((row) => {
        row.alignment = { vertical: "middle", wrapText: true };
      });
    }
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private title(cell: ExcelJS.Cell, value: string): void {
    cell.value = value;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 16 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.alignment = { vertical: "middle" };
  }

  private header(row: ExcelJS.Row): void {
    row.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: NAVY } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: PALE_BLUE },
      };
    });
  }
}
