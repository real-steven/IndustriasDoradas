import { Injectable } from "@nestjs/common";
import ExcelJS from "exceljs";

import type {
  ProductionReport,
  ProductionReportShipment,
} from "./reports.contracts";

const NAVY = "173F54";
const TEAL = "0D5F79";
const PALE_GOLD = "FFF4D8";
const PALE_BLUE = "EDF5F7";
const PALE_GREEN = "E7F6EC";
const BORDER = "D7E1E5";

@Injectable()
export class ReportsExcelExporter {
  async export(report: ProductionReport): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Industrias Doradas";
    workbook.company = "Industrias Doradas";
    workbook.created = new Date(report.generatedAtUtc);
    workbook.modified = new Date(report.generatedAtUtc);
    workbook.subject = this.text(
      report,
      "Reporte gerencial de producción y oro",
      "Production and gold management report",
    );
    workbook.title = workbook.subject;

    this.summarySheet(workbook, report);
    this.shipmentsSheet(workbook, report);
    this.settlementsSheet(workbook, report);
    this.expensesSheet(workbook, report);
    this.weeklySheet(workbook, report);
    this.definitionsSheet(workbook, report);

    const value = await workbook.xlsx.writeBuffer();
    return Buffer.from(value);
  }

  private summarySheet(
    workbook: ExcelJS.Workbook,
    report: ProductionReport,
  ): void {
    const sheet = workbook.addWorksheet(
      this.text(report, "Resumen", "Summary"),
      {
        properties: { defaultRowHeight: 19 },
        pageSetup: {
          fitToPage: true,
          fitToWidth: 1,
          orientation: "landscape",
        },
        views: [{ state: "frozen", ySplit: 8 }],
      },
    );
    sheet.columns = [
      { key: "label", width: 31 },
      { key: "value", width: 18 },
      { key: "spacer", width: 3 },
      { key: "supplier", width: 29 },
      { key: "shipments", width: 15 },
      { key: "gold", width: 16 },
      { key: "coverage", width: 15 },
      { key: "cajuelas", width: 17 },
      { key: "grams", width: 15 },
      { key: "yield", width: 17 },
    ];

    sheet.mergeCells("A1:J2");
    const title = sheet.getCell("A1");
    title.value = this.text(
      report,
      "Reporte gerencial de producción y oro",
      "Production and gold management report",
    );
    title.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 16 };
    title.alignment = { vertical: "middle" };
    title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };

    sheet.mergeCells("A3:J3");
    sheet.getCell("A3").value = this.text(
      report,
      "Cifras consolidadas de cargamentos finalizados. Los resultados de oro pendientes no se interpretan como cero.",
      "Consolidated completed shipment figures. Pending gold results are not interpreted as zero.",
    );
    sheet.getCell("A3").font = { color: { argb: "FF4E6874" }, italic: true };

    const period = `${this.date(report.period.fromUtc, report.language)} - ${this.date(report.period.toUtc, report.language)}`;
    sheet.getCell("A5").value = this.text(report, "Período", "Period");
    sheet.getCell("B5").value = period;
    sheet.getCell("A6").value = this.text(
      report,
      "Generado en Costa Rica",
      "Generated in Costa Rica",
    );
    sheet.getCell("B6").value = this.dateTime(
      report.generatedAtUtc,
      report.language,
    );
    sheet.getCell("A5").font = sheet.getCell("A6").font = { bold: true };

    const summaryRows: Array<[string, number | null, string]> = [
      [
        this.text(report, "Cargamentos finalizados", "Completed shipments"),
        report.summary.completedShipments,
        "#,##0",
      ],
      [
        this.text(report, "Cajuelas procesadas", "Processed cajuelas"),
        report.summary.totalCajuelas,
        "#,##0",
      ],
      [
        this.text(report, "Barridas registradas", "Recorded sweeps"),
        report.summary.sweepCount,
        "#,##0",
      ],
      [
        this.text(report, "Oro registrado (g)", "Recorded gold (g)"),
        report.summary.totalGoldGrams,
        "#,##0.00",
      ],
      [
        this.text(report, "Cobertura de oro", "Gold coverage"),
        report.summary.goldCoveragePercentage / 100,
        "0.0%",
      ],
      [
        this.text(report, "Gramos por cajuela", "Grams per cajuela"),
        report.summary.gramsPerCajuela,
        "0.0000",
      ],
      [
        this.text(report, "Palos por cajuela", "Palos per cajuela"),
        report.summary.palosPerCajuela,
        "0.0000",
      ],
      [
        this.text(
          report,
          "Cargamentos pendientes de oro",
          "Shipments pending gold",
        ),
        report.summary.pendingGoldShipments,
        "#,##0",
      ],
    ];
    summaryRows.forEach(([label, value, format], index) => {
      const row = 9 + index;
      sheet.getCell(row, 1).value = label;
      sheet.getCell(row, 2).value =
        value ?? this.text(report, "Sin datos", "No data");
      sheet.getCell(row, 2).numFmt = value === null ? "General" : format;
      sheet.getCell(row, 1).font = { bold: true, color: { argb: "FF35515D" } };
      sheet.getCell(row, 2).font = { bold: true, color: { argb: `FF${NAVY}` } };
      sheet.getCell(row, 1).fill = sheet.getCell(row, 2).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: index % 2 === 0 ? PALE_BLUE : "FFFFFF" },
      };
    });

    const headerRow = 8;
    const headers = [
      this.text(report, "Proveedor", "Supplier"),
      this.text(report, "Cargamentos", "Shipments"),
      this.text(report, "Con oro", "With gold"),
      this.text(report, "Cobertura", "Coverage"),
      this.text(report, "Cajuelas incluidas", "Included cajuelas"),
      this.text(report, "Oro (g)", "Gold (g)"),
      this.text(report, "Palos/cajuela", "Palos/cajuela"),
    ];
    headers.forEach((header, index) => {
      sheet.getCell(headerRow, 4 + index).value = header;
    });
    this.tableHeader(sheet.getRow(headerRow), 4, 10);

    report.suppliers.forEach((supplier, index) => {
      const row = sheet.getRow(9 + index);
      const values: Array<string | number> = [
        this.safeText(supplier.supplierName),
        supplier.completedShipments,
        supplier.goldShipments,
        supplier.goldCoveragePercentage / 100,
        supplier.includedCajuelas,
        supplier.totalGoldGrams,
        supplier.palosPerCajuela ?? this.text(report, "Sin datos", "No data"),
      ];
      values.forEach((value, valueIndex) => {
        row.getCell(4 + valueIndex).value = value;
      });
      row.getCell(5).numFmt = row.getCell(6).numFmt = "#,##0";
      row.getCell(7).numFmt = "0.0%";
      row.getCell(8).numFmt = "#,##0";
      row.getCell(9).numFmt = "#,##0.00";
      if (typeof row.getCell(10).value === "number")
        row.getCell(10).numFmt = "0.0000";
      this.tableBody(row, 4, 10, index % 2 === 0);
    });

    this.applySheetDefaults(sheet);
    sheet.autoFilter = { from: "D8", to: "J8" };
  }

  private shipmentsSheet(
    workbook: ExcelJS.Workbook,
    report: ProductionReport,
  ): void {
    const sheet = workbook.addWorksheet(
      this.text(report, "Cargamentos", "Shipments"),
      {
        properties: { defaultRowHeight: 19 },
        pageSetup: {
          fitToPage: true,
          fitToWidth: 1,
          orientation: "landscape",
        },
        views: [{ state: "frozen", ySplit: 4 }],
      },
    );
    sheet.columns = [
      { width: 13 },
      { width: 39 },
      { width: 18 },
      { width: 23 },
      { width: 24 },
      { width: 15 },
      { width: 13 },
      { width: 12 },
      { width: 14 },
      { width: 16 },
      { width: 17 },
      { width: 18 },
    ];
    sheet.mergeCells("A1:L2");
    const title = sheet.getCell("A1");
    title.value = this.text(
      report,
      "Detalle de cargamentos por proveedor",
      "Shipment detail by supplier",
    );
    title.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 16 };
    title.alignment = { vertical: "middle" };
    title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };

    let rowNumber = 4;
    const grouped = this.groupShipments(report.shipments);
    for (const [supplierName, shipments] of grouped) {
      sheet.mergeCells(rowNumber, 1, rowNumber, 12);
      const groupCell = sheet.getCell(rowNumber, 1);
      groupCell.value = this.safeText(supplierName);
      groupCell.font = { bold: true, color: { argb: `FF${NAVY}` }, size: 12 };
      groupCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: PALE_GOLD },
      };
      rowNumber += 1;

      const headers = [
        this.text(report, "Cierre", "Completed"),
        this.text(report, "ID del cargamento", "Shipment ID"),
        this.text(report, "Referencia", "Reference"),
        this.text(report, "Línea", "Line"),
        this.text(report, "Responsable", "Responsible worker"),
        this.text(report, "Cajuelas", "Cajuelas"),
        this.text(report, "Barridas", "Sweeps"),
        this.text(report, "Duración (h)", "Duration (h)"),
        this.text(report, "Oro (g)", "Gold (g)"),
        this.text(report, "g/cajuela", "g/cajuela"),
        this.text(report, "Palos/cajuela", "Palos/cajuela"),
        this.text(report, "Estado del oro", "Gold status"),
      ];
      const header = sheet.getRow(rowNumber);
      headers.forEach((value, index) => {
        header.getCell(index + 1).value = value;
      });
      this.tableHeader(header, 1, 12);
      rowNumber += 1;

      for (const [index, shipment] of shipments.entries()) {
        const row = sheet.getRow(rowNumber);
        const values: Array<string | number> = [
          this.date(shipment.completedAtUtc, report.language),
          this.safeText(shipment.shipmentId),
          shipment.shipmentCode,
          this.safeText(shipment.productionLineName),
          this.safeText(
            shipment.responsibleWorkerName ??
              this.text(report, "Sin responsable", "No responsible worker"),
          ),
          shipment.cajuelaTotal,
          shipment.sweepCount,
          shipment.durationHours,
          shipment.goldAmountGrams ?? this.text(report, "Pendiente", "Pending"),
          shipment.gramsPerCajuela ?? this.text(report, "Pendiente", "Pending"),
          shipment.palosPerCajuela ?? this.text(report, "Pendiente", "Pending"),
          shipment.goldStatus === "REGISTERED"
            ? this.text(report, "Registrado", "Recorded")
            : this.text(report, "Pendiente", "Pending"),
        ];
        values.forEach((value, valueIndex) => {
          row.getCell(valueIndex + 1).value = value;
        });
        row.getCell(6).numFmt = row.getCell(7).numFmt = "#,##0";
        row.getCell(8).numFmt = "#,##0.00";
        for (const column of [9, 10, 11]) {
          if (typeof row.getCell(column).value === "number")
            row.getCell(column).numFmt = column === 9 ? "#,##0.00" : "0.0000";
        }
        this.tableBody(row, 1, 12, index % 2 === 0);
        rowNumber += 1;
      }

      const totals = this.shipmentTotals(shipments);
      const totalRow = sheet.getRow(rowNumber);
      totalRow.getCell(1).value = this.text(
        report,
        `Total ${supplierName}`,
        `${supplierName} total`,
      );
      totalRow.getCell(6).value = totals.cajuelas;
      totalRow.getCell(7).value = totals.sweeps;
      totalRow.getCell(9).value = totals.goldGrams;
      totalRow.getCell(11).value = totals.palosPerCajuela ?? "-";
      for (const column of [1, 6, 7, 9, 11]) {
        totalRow.getCell(column).font = {
          bold: true,
          color: { argb: `FF${NAVY}` },
        };
      }
      totalRow.getCell(6).numFmt = totalRow.getCell(7).numFmt = "#,##0";
      totalRow.getCell(9).numFmt = "#,##0.00";
      if (typeof totalRow.getCell(11).value === "number")
        totalRow.getCell(11).numFmt = "0.0000";
      for (let column = 1; column <= 12; column += 1) {
        totalRow.getCell(column).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: PALE_GREEN },
        };
      }
      rowNumber += 2;
    }
    this.applySheetDefaults(sheet);
    sheet.pageSetup.printTitlesRow = "1:4";
  }

  private definitionsSheet(
    workbook: ExcelJS.Workbook,
    report: ProductionReport,
  ): void {
    const sheet = workbook.addWorksheet(
      this.text(report, "Definiciones", "Definitions"),
      { properties: { defaultRowHeight: 22 } },
    );
    sheet.columns = [{ width: 28 }, { width: 100 }];
    sheet.mergeCells("A1:B2");
    const title = sheet.getCell("A1");
    title.value = this.text(
      report,
      "Definiciones y alcance",
      "Definitions and scope",
    );
    title.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 16 };
    title.alignment = { vertical: "middle" };
    title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    const rows: Array<[string, string]> = [
      [this.text(report, "Versión", "Version"), report.version],
      [this.text(report, "Zona horaria", "Timezone"), report.timezone],
      [
        this.text(report, "Cobertura de oro", "Gold coverage"),
        report.definitions.goldCoverage,
      ],
      [
        this.text(report, "Gramos por cajuela", "Grams per cajuela"),
        report.definitions.gramsPerCajuela,
      ],
      [
        this.text(report, "Palos por cajuela", "Palos per cajuela"),
        report.definitions.palosPerCajuela,
      ],
      [
        this.text(report, "Oro pendiente", "Pending gold"),
        report.definitions.missingGold,
      ],
      [
        this.text(report, "Cálculo financiero", "Financial calculation"),
        report.definitions.financialCalculation,
      ],
      [
        this.text(report, "Edición y aprobación", "Editing and approval"),
        this.text(
          report,
          "Solo los borradores son editables. Una liquidación aprobada queda protegida y conserva su trazabilidad.",
          "Only drafts are editable. An approved settlement is locked and retains its audit trail.",
        ),
      ],
    ];
    rows.forEach(([label, value], index) => {
      const row = sheet.getRow(index + 4);
      row.getCell(1).value = label;
      row.getCell(2).value = this.safeText(value);
      row.getCell(1).font = { bold: true, color: { argb: `FF${NAVY}` } };
      row.getCell(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: index % 2 === 0 ? PALE_BLUE : "FFFFFF" },
      };
      row.getCell(2).fill = row.getCell(1).fill;
      row.getCell(2).alignment = { vertical: "top", wrapText: true };
    });
    this.applySheetDefaults(sheet);
  }

  private settlementsSheet(
    workbook: ExcelJS.Workbook,
    report: ProductionReport,
  ): void {
    const sheet = workbook.addWorksheet(
      this.text(report, "Ingresos por oro", "Gold income"),
      {
        properties: { defaultRowHeight: 20 },
        pageSetup: { fitToPage: true, fitToWidth: 1, orientation: "landscape" },
        views: [{ state: "frozen", ySplit: 4 }],
      },
    );
    sheet.columns = [
      { width: 15 },
      { width: 25 },
      { width: 14 },
      { width: 15 },
      { width: 18 },
      { width: 14 },
      { width: 15 },
      { width: 18 },
      { width: 18 },
      { width: 18 },
      { width: 16 },
      { width: 18 },
      { width: 18 },
      { width: 16 },
    ];
    sheet.mergeCells("A1:N2");
    const title = sheet.getCell("A1");
    title.value = this.text(
      report,
      "Liquidaciones de ingresos por oro",
      "Gold income settlements",
    );
    title.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 16 };
    title.alignment = { vertical: "middle" };
    title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    const headers = [
      this.text(report, "Semana", "Week"),
      this.text(report, "Proveedor", "Supplier"),
      this.text(report, "Estado", "Status"),
      this.text(report, "Cargamento", "Shipment"),
      this.text(report, "Referencia", "Reference"),
      this.text(report, "Quilataje", "Karat"),
      this.text(report, "Gramos", "Grams"),
      this.text(report, "Precio/quilate", "Price/karat"),
      this.text(report, "Precio/gramo", "Price/gram"),
      this.text(report, "Total bruto", "Gross total"),
      this.text(report, "Gastos", "Expenses"),
      this.text(report, "Total neto", "Net total"),
      this.text(report, "Total recibido", "Total received"),
      this.text(report, "Comprador", "Buyer"),
    ];
    headers.forEach((value, index) => {
      sheet.getCell(4, index + 1).value = value;
    });
    this.tableHeader(sheet.getRow(4), 1, 14);
    let rowNumber = 5;
    for (const settlement of report.financialSettlements) {
      for (const [index, line] of settlement.lines.entries()) {
        const row = sheet.getRow(rowNumber);
        const values: Array<string | number> = [
          settlement.weekStart,
          this.safeText(settlement.supplierName),
          settlement.status,
          line.shipmentId.slice(0, 8).toUpperCase(),
          this.safeText(line.assayLabel ?? ""),
          line.karat,
          line.gramsLiquidated,
          line.pricePerKaratCrc ?? "",
          line.pricePerGramCrc,
          line.grossAmountCrc,
          index === 0 ? settlement.expensesCrc : "",
          index === 0 ? settlement.netAmountCrc : "",
          index === 0 ? settlement.effectiveReceivedAmountCrc : "",
          index === 0 ? this.safeText(settlement.buyerName) : "",
        ];
        values.forEach((value, valueIndex) => {
          row.getCell(valueIndex + 1).value = value;
        });
        row.getCell(6).numFmt = row.getCell(7).numFmt = "#,##0.000";
        for (const column of [8, 9, 10, 11, 12, 13]) {
          if (typeof row.getCell(column).value === "number")
            row.getCell(column).numFmt = "₡#,##0.00";
        }
        this.tableBody(row, 1, 14, rowNumber % 2 === 1);
        rowNumber += 1;
      }
    }
    this.applySheetDefaults(sheet);
    sheet.autoFilter = { from: "A4", to: "N4" };
  }

  private expensesSheet(
    workbook: ExcelJS.Workbook,
    report: ProductionReport,
  ): void {
    const sheet = workbook.addWorksheet(
      this.text(report, "Gastos generales", "General expenses"),
      { views: [{ state: "frozen", ySplit: 4 }] },
    );
    sheet.columns = [
      { width: 15 },
      { width: 25 },
      { width: 18 },
      { width: 36 },
      { width: 18 },
      { width: 22 },
      { width: 14 },
    ];
    sheet.mergeCells("A1:G2");
    const title = sheet.getCell("A1");
    title.value = this.text(report, "Gastos descontados", "Deducted expenses");
    title.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 16 };
    title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    const headers = [
      this.text(report, "Fecha", "Date"),
      this.text(report, "Proveedor", "Supplier"),
      this.text(report, "Categoría", "Category"),
      this.text(report, "Concepto", "Concept"),
      this.text(report, "Monto", "Amount"),
      this.text(report, "Responsable", "Responsible"),
      this.text(report, "Estado", "Status"),
    ];
    headers.forEach((value, index) => {
      sheet.getCell(4, index + 1).value = value;
    });
    this.tableHeader(sheet.getRow(4), 1, 7);
    let rowNumber = 5;
    for (const settlement of report.financialSettlements) {
      for (const expense of settlement.expenses) {
        const row = sheet.getRow(rowNumber);
        [
          expense.occurredOn,
          this.safeText(settlement.supplierName),
          expense.category,
          this.safeText(expense.concept),
          expense.amountCrc,
          this.safeText(expense.responsibleName ?? ""),
          settlement.status,
        ].forEach((value, index) => {
          row.getCell(index + 1).value = value;
        });
        row.getCell(5).numFmt = "₡#,##0.00";
        this.tableBody(row, 1, 7, rowNumber % 2 === 1);
        rowNumber += 1;
      }
    }
    this.applySheetDefaults(sheet);
    sheet.autoFilter = { from: "A4", to: "G4" };
  }

  private weeklySheet(
    workbook: ExcelJS.Workbook,
    report: ProductionReport,
  ): void {
    const sheet = workbook.addWorksheet(
      this.text(report, "Liquidación semanal", "Weekly settlement"),
    );
    sheet.columns = [
      { width: 17 },
      { width: 17 },
      { width: 18 },
      { width: 20 },
      { width: 20 },
      { width: 20 },
      { width: 20 },
    ];
    sheet.mergeCells("A1:G2");
    const title = sheet.getCell("A1");
    title.value = this.text(
      report,
      "Resumen financiero semanal",
      "Weekly financial summary",
    );
    title.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 16 };
    title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    const headers = [
      this.text(report, "Semana", "Week"),
      this.text(report, "Liquidaciones", "Settlements"),
      this.text(report, "Gramos", "Grams"),
      this.text(report, "Total bruto", "Gross total"),
      this.text(report, "Gastos", "Expenses"),
      this.text(report, "Total neto", "Net total"),
      this.text(report, "Total recibido", "Total received"),
    ];
    headers.forEach((value, index) => {
      sheet.getCell(4, index + 1).value = value;
    });
    this.tableHeader(sheet.getRow(4), 1, 7);
    report.weeklyFinancialSummary.forEach((week, index) => {
      const row = sheet.getRow(index + 5);
      [
        week.weekStart,
        week.settlements,
        week.totalGrams,
        week.grossAmountCrc,
        week.expensesCrc,
        week.netAmountCrc,
        week.receivedAmountCrc,
      ].forEach((value, valueIndex) => {
        row.getCell(valueIndex + 1).value = value;
      });
      row.getCell(2).numFmt = "#,##0";
      row.getCell(3).numFmt = "#,##0.000";
      for (const column of [4, 5, 6, 7])
        row.getCell(column).numFmt = "₡#,##0.00";
      this.tableBody(row, 1, 7, index % 2 === 0);
    });
    this.applySheetDefaults(sheet);
  }

  private groupShipments(
    shipments: ProductionReportShipment[],
  ): Array<[string, ProductionReportShipment[]]> {
    const groups = new Map<string, ProductionReportShipment[]>();
    for (const shipment of shipments) {
      groups.set(shipment.supplierName, [
        ...(groups.get(shipment.supplierName) ?? []),
        shipment,
      ]);
    }
    return [...groups.entries()].sort(([left], [right]) =>
      left.localeCompare(right, "es"),
    );
  }

  private shipmentTotals(shipments: ProductionReportShipment[]) {
    const totals = shipments.reduce(
      (result, shipment) => ({
        cajuelas: result.cajuelas + shipment.cajuelaTotal,
        goldCajuelas:
          result.goldCajuelas +
          (shipment.goldAmountGrams === null ? 0 : shipment.cajuelaTotal),
        goldGrams: result.goldGrams + (shipment.goldAmountGrams ?? 0),
        sweeps: result.sweeps + shipment.sweepCount,
      }),
      { cajuelas: 0, goldCajuelas: 0, goldGrams: 0, sweeps: 0 },
    );
    return {
      ...totals,
      palosPerCajuela:
        totals.goldCajuelas === 0
          ? null
          : Number(((totals.goldGrams * 10) / totals.goldCajuelas).toFixed(4)),
    };
  }

  private tableHeader(
    row: ExcelJS.Row,
    startColumn: number,
    endColumn: number,
  ): void {
    for (let column = startColumn; column <= endColumn; column += 1) {
      const cell = row.getCell(column);
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: TEAL },
      };
      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };
      cell.border = this.border();
    }
    row.height = 31;
  }

  private tableBody(
    row: ExcelJS.Row,
    startColumn: number,
    endColumn: number,
    alternate: boolean,
  ): void {
    for (let column = startColumn; column <= endColumn; column += 1) {
      const cell = row.getCell(column);
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: alternate ? "F7FAFB" : "FFFFFF" },
      };
      cell.border = this.border();
      cell.alignment = {
        horizontal: column === startColumn ? "left" : "right",
        vertical: "middle",
        wrapText: true,
      };
    }
  }

  private applySheetDefaults(sheet: ExcelJS.Worksheet): void {
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.font = {
          name: "Arial",
          size: cell.font?.size ?? 10,
          ...cell.font,
        };
      });
    });
    sheet.properties.outlineProperties = {
      summaryBelow: true,
      summaryRight: true,
    };
    sheet.pageSetup.margins = {
      top: 0.5,
      right: 0.35,
      bottom: 0.5,
      left: 0.35,
      header: 0.2,
      footer: 0.2,
    };
  }

  private border(): Partial<ExcelJS.Borders> {
    return {
      top: { style: "thin", color: { argb: BORDER } },
      left: { style: "thin", color: { argb: BORDER } },
      bottom: { style: "thin", color: { argb: BORDER } },
      right: { style: "thin", color: { argb: BORDER } },
    };
  }

  private text(report: ProductionReport, es: string, en: string): string {
    return report.language === "es" ? es : en;
  }

  private date(value: string, language: "es" | "en"): string {
    return new Intl.DateTimeFormat(language === "es" ? "es-CR" : "en-CR", {
      day: "2-digit",
      month: "2-digit",
      timeZone: "America/Costa_Rica",
      year: "numeric",
    }).format(new Date(value));
  }

  private dateTime(value: string, language: "es" | "en"): string {
    return new Intl.DateTimeFormat(language === "es" ? "es-CR" : "en-CR", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "America/Costa_Rica",
    }).format(new Date(value));
  }

  private safeText(value: string): string {
    return /^[=+\-@\t\r\n]/u.test(value) ? `'${value}` : value;
  }
}
