import ExcelJS from "exceljs";

import type { ProductionReport } from "./reports.contracts";
import { ReportsExcelExporter } from "./reports.excel";
import { ReportsPdfExporter } from "./reports.pdf";

describe("report exporters", () => {
  const report = fixture();

  it("creates one concise Excel table with only the selected fields", async () => {
    const buffer = await new ReportsExcelExporter().export(report);
    const workbook = new ExcelJS.Workbook();
    const contents = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;
    await workbook.xlsx.load(contents);

    const sheet = workbook.getWorksheet("Reporte de oro");
    expect(workbook.worksheets.map((item) => item.name)).toEqual([
      "Reporte de oro",
    ]);
    expect(sheet?.getCell("A1").value).toBe("Reporte de oro por cargamento");
    expect(sheet?.getRow(5).values).toEqual([
      undefined,
      "Fecha de cierre",
      "Cargamento",
      "Proveedor",
      "Oro total (g)",
      "Quilataje",
    ]);
    // El quilataje sale del registro de oro del cargamento, como número.
    expect(sheet?.getCell("E6").value).toBe(13.42);
    expect(sheet?.getCell("E6").numFmt).toBe("0.0##");
    expect(sheet?.properties.outlineProperties).toBeUndefined();
    expect(buffer.subarray(0, 2).toString()).toBe("PK");
  });

  it("creates a multi-section PDF file", async () => {
    const buffer = await new ReportsPdfExporter().export(report);

    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(2_000);
    expect(buffer.toString("latin1").match(/\/Type\s*\/Page\b/gu)).toHaveLength(
      1,
    );
  });
});

function fixture(): ProductionReport {
  const metrics = {
    completedShipments: 1,
    totalCajuelas: 200,
    sweepCount: 2,
    goldShipments: 1,
    pendingGoldShipments: 0,
    totalGoldGrams: 100,
    includedCajuelas: 200,
    gramsPerCajuela: 0.5,
    palosPerCajuela: 5,
    goldCoveragePercentage: 100,
  };
  return {
    version: "production-gold-v1",
    language: "es",
    timezone: "America/Costa_Rica",
    generatedAtUtc: "2026-11-04T18:00:00.000Z",
    sections: ["summary", "shipments", "financial"],
    fields: ["date", "shipment", "supplier", "gold", "karat"],
    period: {
      fromUtc: "2026-11-01T06:00:00.000Z",
      toUtc: "2026-12-01T06:00:00.000Z",
    },
    filters: { plantId: null, productionLineId: null, supplierId: null },
    summary: metrics,
    suppliers: [
      {
        supplierId: "supplier-id",
        supplierName: "Proveedor Norte",
        ...metrics,
      },
    ],
    shipments: [
      {
        shipmentId: "42000000-0000-4000-8000-000000000001",
        shipmentCode: "42000000",
        plantId: "plant-id",
        stationName: "Estación Central",
        productionLineId: "line-id",
        productionLineName: "Línea Norte",
        productionLineOrder: 1,
        supplierId: "supplier-id",
        supplierName: "Proveedor Norte",
        responsibleWorkerName: "Responsable Uno",
        startedAtUtc: "2026-11-03T12:00:00.000Z",
        completedAtUtc: "2026-11-03T18:00:00.000Z",
        durationHours: 6,
        cajuelaTotal: 200,
        sweepCount: 2,
        goldStatus: "REGISTERED",
        goldAmountGrams: 100,
        goldKarat: 13.42,
        gramsPerCajuela: 0.5,
        palosPerCajuela: 5,
      },
    ],
    financialSettlements: [
      {
        id: "settlement-id",
        organizationId: "organization-id",
        supplierId: "supplier-id",
        supplierName: "Proveedor Norte",
        weekStart: "2026-11-02",
        buyerName: "Comprador",
        destination: null,
        currencyCode: "CRC",
        participationPercentage: 0,
        receivedAmountCrc: null,
        notes: null,
        status: "CLOSED",
        revision: 1,
        supersedesSettlementId: null,
        rowVersion: 1,
        createdByProfileId: "profile-id",
        updatedByProfileId: "profile-id",
        approvedByProfileId: "profile-id",
        approvedAtUtc: "2026-11-04T18:00:00.000Z",
        createdAtUtc: "2026-11-04T18:00:00.000Z",
        updatedAtUtc: "2026-11-04T18:00:00.000Z",
        totalGrams: 100,
        grossAmountCrc: 0,
        expensesCrc: 0,
        netAmountCrc: 0,
        participationAmountCrc: 0,
        effectiveReceivedAmountCrc: 0,
        lines: [
          {
            id: "line-id",
            shipmentId: "42000000-0000-4000-8000-000000000001",
            assayLabel: null,
            karat: 13.42,
            gramsLiquidated: 100,
            pricePerKaratCrc: null,
            pricePerGramCrc: 0,
            grossAmountCrc: 0,
            displayOrder: 1,
          },
        ],
        expenses: [],
      },
    ],
    weeklyFinancialSummary: [],
    financialSummary: {
      settlements: 0,
      totalGrams: 0,
      grossAmountCrc: 0,
      expensesCrc: 0,
      netAmountCrc: 0,
      receivedAmountCrc: 0,
    },
    definitions: {
      goldCoverage: "Porcentaje con resultado de oro.",
      gramsPerCajuela: "Gramos divididos entre cajuelas.",
      palosPerCajuela: "Gramos por cajuela multiplicados por diez.",
      missingGold: "Los pendientes no se interpretan como cero.",
      financialCalculation: "Bruto menos gastos y participación.",
    },
  };
}
