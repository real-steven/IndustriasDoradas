import { Injectable } from "@nestjs/common";
import PDFDocument from "pdfkit";

import type {
  ProductionReport,
  ProductionReportShipment,
} from "./reports.contracts";

const NAVY = "#173f54";
const TEAL = "#0d5f79";
const GOLD = "#d89a1d";
const MUTED = "#58717c";
const BORDER = "#d7e1e5";
const PALE = "#f4f8f9";

@Injectable()
export class ReportsPdfExporter {
  export(report: ProductionReport): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const document = new PDFDocument({
        autoFirstPage: false,
        bufferPages: true,
        info: {
          Author: "Industrias Doradas",
          Creator: "Industrias Doradas",
          Subject: this.text(
            report,
            "Reporte gerencial de producción y oro",
            "Production and gold management report",
          ),
          Title: this.text(
            report,
            "Reporte gerencial de producción y oro",
            "Production and gold management report",
          ),
        },
        layout: "landscape",
        margin: 32,
        size: "LETTER",
      });
      const chunks: Buffer[] = [];
      document.on("data", (chunk: Buffer) => chunks.push(chunk));
      document.on("error", reject);
      document.on("end", () => resolve(Buffer.concat(chunks)));

      this.summaryPage(document, report);
      this.financialPages(document, report);
      this.shipmentPages(document, report);
      this.addFooters(document, report);
      document.end();
    });
  }

  private summaryPage(document: PDFKit.PDFDocument, report: ProductionReport) {
    document.addPage();
    this.pageHeader(document, report);
    document
      .font("Helvetica")
      .fontSize(9)
      .fillColor(MUTED)
      .text(
        this.text(
          report,
          "Cargamentos finalizados y rendimiento de oro. Los resultados pendientes se excluyen del rendimiento.",
          "Completed shipments and gold yield. Pending results are excluded from yield.",
        ),
        32,
        88,
      );

    const metrics = [
      [
        this.text(report, "Cargamentos", "Shipments"),
        this.number(report.summary.completedShipments, report, 0),
      ],
      [
        this.text(report, "Cajuelas", "Cajuelas"),
        this.number(report.summary.totalCajuelas, report, 0),
      ],
      [
        this.text(report, "Oro registrado", "Recorded gold"),
        `${this.number(report.summary.totalGoldGrams, report, 2)} g`,
      ],
      [
        this.text(report, "Cobertura", "Coverage"),
        `${this.number(report.summary.goldCoveragePercentage, report, 1)} %`,
      ],
      [
        this.text(report, "Palos/cajuela", "Palos/cajuela"),
        report.summary.palosPerCajuela === null
          ? this.text(report, "Sin datos", "No data")
          : this.number(report.summary.palosPerCajuela, report, 4),
      ],
    ] as const;
    const width = 728 / metrics.length;
    metrics.forEach(([label, value], index) => {
      const x = 32 + index * width;
      document.roundedRect(x, 118, width - 8, 70, 8).fill(PALE);
      document
        .fillColor(MUTED)
        .font("Helvetica-Bold")
        .fontSize(7)
        .text(label.toUpperCase(), x + 12, 132, { width: width - 32 });
      document
        .fillColor(NAVY)
        .fontSize(17)
        .text(value, x + 12, 154, { width: width - 32 });
    });

    document
      .fillColor(NAVY)
      .font("Helvetica-Bold")
      .fontSize(12)
      .text(
        this.text(report, "Resumen por proveedor", "Supplier summary"),
        32,
        214,
      );
    const columns = [
      { label: this.text(report, "Proveedor", "Supplier"), width: 190 },
      { label: this.text(report, "Cargamentos", "Shipments"), width: 85 },
      { label: this.text(report, "Con oro", "With gold"), width: 75 },
      { label: this.text(report, "Cobertura", "Coverage"), width: 85 },
      { label: this.text(report, "Cajuelas", "Cajuelas"), width: 90 },
      { label: this.text(report, "Oro (g)", "Gold (g)"), width: 90 },
      {
        label: this.text(report, "Palos/cajuela", "Palos/cajuela"),
        width: 105,
      },
    ];
    let y = 240;
    this.tableHeader(document, columns, y);
    y += 25;
    for (const [index, supplier] of report.suppliers.entries()) {
      if (y > 540) {
        document.addPage();
        this.pageHeader(document, report);
        y = 100;
        this.tableHeader(document, columns, y);
        y += 25;
      }
      const values = [
        supplier.supplierName,
        this.number(supplier.completedShipments, report, 0),
        this.number(supplier.goldShipments, report, 0),
        `${this.number(supplier.goldCoveragePercentage, report, 1)} %`,
        this.number(supplier.includedCajuelas, report, 0),
        this.number(supplier.totalGoldGrams, report, 2),
        supplier.palosPerCajuela === null
          ? this.text(report, "Sin datos", "No data")
          : this.number(supplier.palosPerCajuela, report, 4),
      ];
      this.tableRow(document, columns, values, y, index % 2 === 0);
      y += 23;
    }
    document
      .font("Helvetica")
      .fontSize(8)
      .fillColor(MUTED)
      .text(report.definitions.missingGold, 32, Math.min(y + 18, 555), {
        width: 720,
      });
  }

  private shipmentPages(
    document: PDFKit.PDFDocument,
    report: ProductionReport,
  ): void {
    const columns = [
      { label: this.text(report, "Cierre", "Completed"), width: 60 },
      { label: this.text(report, "Referencia", "Reference"), width: 60 },
      { label: this.text(report, "Línea", "Line"), width: 80 },
      { label: this.text(report, "Responsable", "Responsible"), width: 105 },
      { label: this.text(report, "Cajuelas", "Cajuelas"), width: 58 },
      { label: this.text(report, "Barridas", "Sweeps"), width: 52 },
      { label: this.text(report, "Oro (g)", "Gold (g)"), width: 62 },
      { label: "g/cajuela", width: 66 },
      { label: "Palos/cajuela", width: 80 },
      { label: this.text(report, "Estado", "Status"), width: 65 },
    ];
    const groups = this.groupShipments(report.shipments);
    for (const [supplier, shipments] of groups) {
      document.addPage();
      this.pageHeader(document, report);
      document
        .fillColor(GOLD)
        .font("Helvetica-Bold")
        .fontSize(9)
        .text(this.text(report, "PROVEEDOR", "SUPPLIER"), 32, 88);
      document
        .fillColor(NAVY)
        .fontSize(15)
        .text(supplier, 32, 104, { width: 720 });
      let y = 136;
      this.tableHeader(document, columns, y);
      y += 25;
      for (const [index, shipment] of shipments.entries()) {
        if (y > 540) {
          document.addPage();
          this.pageHeader(document, report);
          document
            .fillColor(NAVY)
            .font("Helvetica-Bold")
            .fontSize(11)
            .text(supplier, 32, 88);
          y = 112;
          this.tableHeader(document, columns, y);
          y += 25;
        }
        this.tableRow(
          document,
          columns,
          this.shipmentValues(report, shipment),
          y,
          index % 2 === 0,
        );
        y += 23;
      }
      const totals = this.shipmentTotals(shipments);
      document.roundedRect(32, y + 8, 728, 35, 6).fill("#e7f6ec");
      document
        .fillColor(NAVY)
        .font("Helvetica-Bold")
        .fontSize(9)
        .text(
          this.text(report, `Total ${supplier}`, `${supplier} total`),
          44,
          y + 20,
        )
        .text(
          `${this.number(totals.cajuelas, report, 0)} ${this.text(report, "cajuelas", "cajuelas")}  |  ${this.number(totals.goldGrams, report, 2)} g  |  ${totals.palosPerCajuela === null ? "-" : this.number(totals.palosPerCajuela, report, 4)} ${this.text(report, "palos/cajuela", "palos/cajuela")}`,
          330,
          y + 20,
          { align: "right", width: 418 },
        );
    }
  }

  private financialPages(
    document: PDFKit.PDFDocument,
    report: ProductionReport,
  ): void {
    if (report.financialSettlements.length === 0) return;
    document.addPage();
    this.pageHeader(document, report);
    document
      .fillColor(GOLD)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(
        this.text(report, "RESUMEN FINANCIERO", "FINANCIAL SUMMARY"),
        32,
        88,
      );
    const metrics = [
      [
        this.text(report, "Liquidaciones", "Settlements"),
        this.number(report.financialSummary.settlements, report, 0),
      ],
      [
        this.text(report, "Gramos", "Grams"),
        `${this.number(report.financialSummary.totalGrams, report, 3)} g`,
      ],
      [
        this.text(report, "Total bruto", "Gross total"),
        this.currency(report.financialSummary.grossAmountCrc, report),
      ],
      [
        this.text(report, "Gastos", "Expenses"),
        this.currency(report.financialSummary.expensesCrc, report),
      ],
      [
        this.text(report, "Total recibido", "Total received"),
        this.currency(report.financialSummary.receivedAmountCrc, report),
      ],
    ] as const;
    const metricWidth = 728 / metrics.length;
    metrics.forEach(([label, value], index) => {
      const x = 32 + index * metricWidth;
      document.roundedRect(x, 108, metricWidth - 8, 60, 7).fill(PALE);
      document
        .fillColor(MUTED)
        .font("Helvetica-Bold")
        .fontSize(6.5)
        .text(label.toUpperCase(), x + 10, 120, { width: metricWidth - 28 });
      document
        .fillColor(NAVY)
        .fontSize(12)
        .text(value, x + 10, 141, { width: metricWidth - 28 });
    });

    const columns = [
      { label: this.text(report, "Semana", "Week"), width: 75 },
      { label: this.text(report, "Proveedor", "Supplier"), width: 145 },
      { label: this.text(report, "Estado", "Status"), width: 65 },
      { label: this.text(report, "Gramos", "Grams"), width: 75 },
      { label: this.text(report, "Bruto", "Gross"), width: 95 },
      { label: this.text(report, "Gastos", "Expenses"), width: 90 },
      { label: this.text(report, "Neto", "Net"), width: 90 },
      { label: this.text(report, "Recibido", "Received"), width: 93 },
    ];
    let y = 195;
    this.tableHeader(document, columns, y);
    y += 25;
    for (const [index, settlement] of report.financialSettlements.entries()) {
      if (y > 530) {
        document.addPage();
        this.pageHeader(document, report);
        y = 95;
        this.tableHeader(document, columns, y);
        y += 25;
      }
      this.tableRow(
        document,
        columns,
        [
          settlement.weekStart,
          settlement.supplierName,
          settlement.status,
          this.number(settlement.totalGrams, report, 3),
          this.currency(settlement.grossAmountCrc, report),
          this.currency(settlement.expensesCrc, report),
          this.currency(settlement.netAmountCrc, report),
          this.currency(settlement.effectiveReceivedAmountCrc, report),
        ],
        y,
        index % 2 === 0,
      );
      y += 23;
    }
    document
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(7.5)
      .text(
        report.definitions.financialCalculation,
        32,
        Math.min(y + 16, 545),
        {
          width: 720,
        },
      );
  }

  private pageHeader(
    document: PDFKit.PDFDocument,
    report: ProductionReport,
  ): void {
    document.rect(0, 0, 792, 70).fill(NAVY);
    document
      .fillColor("white")
      .font("Helvetica-Bold")
      .fontSize(17)
      .text(
        this.text(
          report,
          "INDUSTRIAS DORADAS - REPORTE GERENCIAL",
          "INDUSTRIAS DORADAS - MANAGEMENT REPORT",
        ),
        32,
        22,
      );
    document
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#dceaf0")
      .text(
        `${this.date(report.period.fromUtc, report)} - ${this.date(report.period.toUtc, report)}  |  ${report.timezone}`,
        510,
        26,
        { align: "right", width: 250 },
      );
  }

  private addFooters(
    document: PDFKit.PDFDocument,
    report: ProductionReport,
  ): void {
    const range = document.bufferedPageRange();
    for (
      let index = range.start;
      index < range.start + range.count;
      index += 1
    ) {
      document.switchToPage(index);
      document.moveTo(32, 558).lineTo(760, 558).strokeColor(BORDER).stroke();
      document
        .font("Helvetica")
        .fontSize(7)
        .fillColor(MUTED)
        .text(
          `${this.text(report, "Generado", "Generated")}: ${this.dateTime(report.generatedAtUtc, report)}`,
          32,
          565,
          { lineBreak: false },
        )
        .text(
          `${this.text(report, "Página", "Page")} ${index + 1} ${this.text(report, "de", "of")} ${range.count}`,
          660,
          565,
          { align: "right", lineBreak: false, width: 100 },
        );
    }
  }

  private tableHeader(
    document: PDFKit.PDFDocument,
    columns: Array<{ label: string; width: number }>,
    y: number,
  ): void {
    let x = 32;
    for (const column of columns) {
      document.rect(x, y, column.width, 25).fill(TEAL);
      document
        .fillColor("white")
        .font("Helvetica-Bold")
        .fontSize(6.5)
        .text(column.label.toUpperCase(), x + 5, y + 8, {
          align: x === 32 ? "left" : "right",
          height: 15,
          width: column.width - 10,
        });
      x += column.width;
    }
  }

  private tableRow(
    document: PDFKit.PDFDocument,
    columns: Array<{ label: string; width: number }>,
    values: Array<string | number>,
    y: number,
    alternate: boolean,
  ): void {
    let x = 32;
    for (const [index, column] of columns.entries()) {
      document
        .rect(x, y, column.width, 23)
        .fillAndStroke(alternate ? PALE : "white", BORDER);
      document
        .fillColor(NAVY)
        .font("Helvetica")
        .fontSize(7)
        .text(String(values[index] ?? ""), x + 5, y + 8, {
          align: index === 0 ? "left" : "right",
          ellipsis: true,
          height: 12,
          lineBreak: false,
          width: column.width - 10,
        });
      x += column.width;
    }
  }

  private shipmentValues(
    report: ProductionReport,
    shipment: ProductionReportShipment,
  ): string[] {
    return [
      this.date(shipment.completedAtUtc, report),
      shipment.shipmentCode,
      shipment.productionLineName,
      shipment.responsibleWorkerName ??
        this.text(report, "Sin asignar", "Unassigned"),
      this.number(shipment.cajuelaTotal, report, 0),
      this.number(shipment.sweepCount, report, 0),
      shipment.goldAmountGrams === null
        ? "-"
        : this.number(shipment.goldAmountGrams, report, 2),
      shipment.gramsPerCajuela === null
        ? "-"
        : this.number(shipment.gramsPerCajuela, report, 4),
      shipment.palosPerCajuela === null
        ? "-"
        : this.number(shipment.palosPerCajuela, report, 4),
      shipment.goldStatus === "REGISTERED"
        ? this.text(report, "Registrado", "Recorded")
        : this.text(report, "Pendiente", "Pending"),
    ];
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
    const result = shipments.reduce(
      (total, shipment) => ({
        cajuelas: total.cajuelas + shipment.cajuelaTotal,
        goldCajuelas:
          total.goldCajuelas +
          (shipment.goldAmountGrams === null ? 0 : shipment.cajuelaTotal),
        goldGrams: total.goldGrams + (shipment.goldAmountGrams ?? 0),
      }),
      { cajuelas: 0, goldCajuelas: 0, goldGrams: 0 },
    );
    return {
      ...result,
      palosPerCajuela:
        result.goldCajuelas === 0
          ? null
          : Number(((result.goldGrams * 10) / result.goldCajuelas).toFixed(4)),
    };
  }

  private text(report: ProductionReport, es: string, en: string): string {
    return report.language === "es" ? es : en;
  }

  private number(
    value: number,
    report: ProductionReport,
    decimals: number,
  ): string {
    return new Intl.NumberFormat(report.language === "es" ? "es-CR" : "en-CR", {
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals,
    }).format(value);
  }

  private currency(value: number, report: ProductionReport): string {
    return new Intl.NumberFormat(report.language === "es" ? "es-CR" : "en-CR", {
      currency: "CRC",
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
      style: "currency",
    }).format(value);
  }

  private date(value: string, report: ProductionReport): string {
    return new Intl.DateTimeFormat(
      report.language === "es" ? "es-CR" : "en-CR",
      {
        day: "2-digit",
        month: "2-digit",
        timeZone: report.timezone,
        year: "numeric",
      },
    ).format(new Date(value));
  }

  private dateTime(value: string, report: ProductionReport): string {
    return new Intl.DateTimeFormat(
      report.language === "es" ? "es-CR" : "en-CR",
      {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: report.timezone,
      },
    ).format(new Date(value));
  }
}
