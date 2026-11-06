import { Injectable } from "@nestjs/common";
import PDFDocument from "pdfkit";

import type { PayrollReadModel } from "../attendance/payroll.contracts";

const NAVY = "#173f54";
const MUTED = "#58717c";
const LINE = "#d7e1e5";
const PALE = "#edf5f7";

@Injectable()
export class PayrollPdfExporter {
  export(report: PayrollReadModel): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const document = new PDFDocument({
        size: "LETTER",
        layout: "landscape",
        margin: 34,
        info: {
          Author: "Industrias Doradas",
          Title: "Pre-nómina gerencial",
          Subject: "Estimación bruta por trabajador",
        },
      });
      const chunks: Buffer[] = [];
      document.on("data", (chunk: Buffer) => chunks.push(chunk));
      document.on("error", reject);
      document.on("end", () => resolve(Buffer.concat(chunks)));

      document
        .font("Helvetica-Bold")
        .fontSize(19)
        .fillColor(NAVY)
        .text("Pre-nómina gerencial");
      document
        .font("Helvetica")
        .fontSize(9)
        .fillColor(MUTED)
        .text(`Período: ${report.period.fromDate} — ${report.period.toDate}`);
      document
        .moveDown(0.25)
        .text(
          "Estimación bruta antes de CCSS, renta, embargos y otras deducciones legales.",
        );

      const columns = [34, 250, 345, 430, 520, 610];
      let y = 105;
      const header = () => {
        document.rect(34, y, 724, 24).fill(PALE);
        document.font("Helvetica-Bold").fontSize(7.5).fillColor(NAVY);
        ["TRABAJADOR", "HORAS", "BASE", "AJUSTES", "TOTAL", "ESTADO"].forEach(
          (label, index) =>
            document.text(label, columns[index], y + 8, {
              width: index === 0 ? 205 : 85,
            }),
        );
        y += 24;
      };
      header();
      for (const item of report.workers) {
        if (y > 525) {
          document.addPage();
          y = 42;
          header();
        }
        document
          .moveTo(34, y + 34)
          .lineTo(758, y + 34)
          .strokeColor(LINE)
          .stroke();
        document
          .font("Helvetica-Bold")
          .fontSize(8)
          .fillColor(NAVY)
          .text(item.worker.name, columns[0], y + 7, { width: 205 });
        document
          .font("Helvetica")
          .fontSize(7)
          .fillColor(MUTED)
          .text(
            item.worker.identityNumber ?? "Cédula pendiente",
            columns[0],
            y + 19,
            { width: 205 },
          );
        const values = [
          `${(item.confirmedMinutes / 60).toLocaleString("es-CR", { maximumFractionDigits: 2 })} h`,
          this.money(item.baseAmountCrc),
          this.money(item.adjustmentAmountCrc),
          this.money(item.estimatedGrossAmountCrc),
          item.estimatedGrossAmountCrc === null ? "Falta tarifa" : "Calculado",
        ];
        document.font("Helvetica").fontSize(8).fillColor("#102d3b");
        values.forEach((value, index) =>
          document.text(value, columns[index + 1], y + 12, { width: 82 }),
        );
        y += 34;
      }
      y += 12;
      document
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor(NAVY)
        .text(
          `Total bruto: ${this.money(report.summary.estimatedGrossAmountCrc)}`,
          520,
          y,
          { width: 238, align: "right" },
        );
      y += 28;
      document
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor(NAVY)
        .text("Ajustes incluidos", 34, y);
      y += 16;
      document.font("Helvetica").fontSize(8).fillColor("#102d3b");
      for (const item of report.workers) {
        for (const adjustment of item.adjustments) {
          if (y > 530) {
            document.addPage();
            y = 42;
          }
          document.text(
            `• ${item.worker.name}: ${adjustment.note} (${this.money(adjustment.calculatedAmountCrc)})`,
            44,
            y,
            { width: 704 },
          );
          y += 14;
        }
      }
      document.end();
    });
  }

  private money(value: number | null): string {
    if (value === null) return "Pendiente";
    return new Intl.NumberFormat("es-CR", {
      style: "currency",
      currency: "CRC",
      maximumFractionDigits: 0,
    }).format(value);
  }
}
