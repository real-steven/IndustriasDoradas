import { HttpStatus } from "@nestjs/common";

import type { GoldRepository, GoldResultEntry } from "./gold.contracts";
import { GoldService } from "./gold.service";
import type { AuditEventRepository } from "../audit/audit.contracts";
import { AuditTrailService } from "../audit/audit-trail.service";
import type { AuthenticatedContext } from "../auth/auth.contracts";
import type {
  ManagementQueryRepository,
  ManagementShipment,
} from "../management/management.contracts";

describe("GoldService", () => {
  let repository: jest.Mocked<GoldRepository>;
  let management: jest.Mocked<ManagementQueryRepository>;
  let auditEvents: jest.Mocked<AuditEventRepository>;
  let service: GoldService;

  beforeEach(() => {
    repository = {
      listShipmentFacts: jest.fn(),
      listResults: jest.fn(),
      createResult: jest.fn(),
      listReviews: jest.fn().mockResolvedValue([]),
      createReview: jest.fn(),
      createMercuryMovements: jest.fn().mockResolvedValue(undefined),
      listSweepMercury: jest.fn().mockResolvedValue([]),
    };
    management = {
      findLatestChange: jest.fn(),
      listOperationLines: jest.fn(),
      listShipments: jest.fn(),
      findShipment: jest.fn(),
      listShipmentSweeps: jest.fn(),
      listStatisticsFacts: jest.fn(),
    };
    auditEvents = { insert: jest.fn().mockResolvedValue(undefined) };
    service = new GoldService(
      repository,
      management,
      new AuditTrailService(auditEvents),
    );
  });

  it("summarizes mercury with the latest complete sweep instead of adding sweeps", async () => {
    const shipmentId = "42000000-0000-4000-8000-0000000000aa";
    repository.listSweepMercury.mockResolvedValue([
      ...sweep(shipmentId, "s1", "2026-10-12T10:00:00.000Z", [
        [100, 20],
        [100, 25],
        [100, 30],
      ]),
      ...sweep(shipmentId, "s2", "2026-10-12T14:00:00.000Z", [
        [80.1, 10.2],
        [80.2, 10.3],
        [80.3, 10.4],
      ]),
      // La barrida más reciente tiene una rastra sin remanente: incompleta.
      ...sweep(shipmentId, "s3", "2026-10-12T18:00:00.000Z", [
        [90, 15],
        [90, null],
        [90, 15],
      ]),
    ]);

    const [overview] = await service.overview(ORGANIZATION_ID, [shipmentId]);

    expect(overview?.mercury).toEqual({
      sweepCount: 3,
      completeSweepCount: 2,
      latestCompleteSweep: {
        sweepId: "s2",
        sweptAtUtc: "2026-10-12T14:00:00.000Z",
        inputGrams: 240.6,
        remainderGrams: 30.9,
      },
    });
  });

  it("compares suppliers with explicit registered and excluded coverage", async () => {
    repository.listShipmentFacts.mockResolvedValue([
      fact("supplier-a", "Proveedor A", 100, 0),
      fact("supplier-a", "Proveedor A", 200, null),
      fact("supplier-b", "Proveedor B", 50, 10),
    ]);

    await expect(service.summary(ORGANIZATION_ID, {})).resolves.toEqual({
      totalShipments: 3,
      registeredShipments: 2,
      excludedShipments: 1,
      pendingShipments: 1,
      acknowledgedShipments: 0,
      acknowledgedShipmentIds: [],
      omittedShipments: 0,
      omittedShipmentIds: [],
      coveragePercentage: 66.67,
      totalGoldGrams: 10,
      includedCajuelas: 150,
      gramsPerCajuela: 0.0667,
      suppliers: [
        expect.objectContaining({
          supplierId: "supplier-b",
          registeredShipments: 1,
          excludedShipments: 0,
          totalGoldGrams: 10,
          gramsPerCajuela: 0.2,
        }),
        expect.objectContaining({
          supplierId: "supplier-a",
          registeredShipments: 1,
          excludedShipments: 1,
          totalGoldGrams: 0,
          gramsPerCajuela: 0,
        }),
      ],
    });
  });

  it("keeps reviewed shipments without data out of the pending total", async () => {
    repository.listShipmentFacts.mockResolvedValue([
      fact("supplier-a", "Proveedor A", 100, null, "OMITTED"),
      fact("supplier-a", "Proveedor A", 200, null),
    ]);

    const summary = await service.summary(ORGANIZATION_ID, {});

    expect(summary).toMatchObject({
      totalShipments: 2,
      registeredShipments: 0,
      pendingShipments: 1,
      omittedShipments: 1,
    });
    expect(summary.omittedShipmentIds).toHaveLength(1);
  });

  it("keeps acknowledged shipments visible without repeating the pending reminder", async () => {
    repository.listShipmentFacts.mockResolvedValue([
      fact("supplier-a", "Proveedor A", 100, null, "ACKNOWLEDGED"),
      fact("supplier-a", "Proveedor A", 200, null),
    ]);

    const summary = await service.summary(ORGANIZATION_ID, {});

    expect(summary).toMatchObject({
      totalShipments: 2,
      pendingShipments: 1,
      acknowledgedShipments: 1,
      omittedShipments: 0,
    });
    expect(summary.acknowledgedShipmentIds).toHaveLength(1);
  });

  it("marks a shipment as reviewed without treating missing gold as zero", async () => {
    management.findShipment.mockResolvedValue(shipment());
    repository.createReview.mockImplementation((input) =>
      Promise.resolve({ ...input }),
    );

    const created = await service.review(
      ORGANIZATION_ID,
      SHIPMENT_ID,
      { disposition: "OMITTED", reason: "La gerencia no conservó el dato" },
      { auth: AUTH, correlationId: CORRELATION_ID },
    );

    expect(created).toMatchObject({
      disposition: "OMITTED",
      reason: "La gerencia no conservó el dato",
      supersedesEntryId: null,
    });
    expect(auditEvents.insert.mock.calls[0]?.[0]).toMatchObject({
      changes: {
        gold_review_disposition: { before: "PENDING", after: "OMITTED" },
      },
    });
  });

  it("requires a reason to correct existing mercury and preserves the previous value in audit", async () => {
    management.findShipment.mockResolvedValue(shipment());
    management.listShipmentSweeps.mockResolvedValue({
      items: [sweepMercury()],
      page: 1,
      pageSize: 1000,
      total: 1,
      totalPages: 1,
    });

    await expect(
      service.recordMercury(
        ORGANIZATION_ID,
        SHIPMENT_ID,
        SWEEP_ID,
        {
          measurements: [{ lineComponentId: COMPONENT_ID, inputGrams: 14.25 }],
        },
        { auth: AUTH, correlationId: CORRELATION_ID },
      ),
    ).rejects.toMatchObject({
      response: { code: "MERCURY_CORRECTION_REASON_REQUIRED" },
    });

    await service.recordMercury(
      ORGANIZATION_ID,
      SHIPMENT_ID,
      SWEEP_ID,
      {
        measurements: [{ lineComponentId: COMPONENT_ID, inputGrams: 14.25 }],
        correctionReason: "Corrección de pesada",
      },
      { auth: AUTH, correlationId: CORRELATION_ID },
    );

    expect(
      repository.createMercuryMovements.mock.calls[0]?.[0]?.[0],
    ).toMatchObject({
      movementKind: "SWEEP_INPUT",
      amountGrams: 14.25,
      supersedesMovementId: MERCURY_INPUT_ID,
      notes: "Corrección de pesada",
    });
    expect(auditEvents.insert.mock.calls[0]?.[0]).toMatchObject({
      changes: {
        [`mercury_${COMPONENT_ID}_sweep_input`]: {
          before: 12.5,
          after: 14.25,
        },
      },
    });
  });

  it("records zero as a valid initial result and audits the shipment", async () => {
    management.findShipment.mockResolvedValue(shipment());
    repository.createResult.mockImplementation((input) =>
      Promise.resolve(result(input.id, input.amountGrams)),
    );

    const created = await service.record(
      ORGANIZATION_ID,
      SHIPMENT_ID,
      { amountGrams: 0 },
      { auth: AUTH, correlationId: CORRELATION_ID },
    );

    expect(created.amountGrams).toBe(0);
    expect(repository.createResult.mock.calls[0]?.[0]).toMatchObject({
      amountGrams: 0,
      supersedesResultId: null,
      correctionReason: null,
      recordedByProfileId: AUTH.profile.id,
    });
    expect(auditEvents.insert.mock.calls[0]?.[0]).toMatchObject({
      entityType: "shipment",
      entityId: SHIPMENT_ID,
      changes: { gold_amount_grams: { before: null, after: 0 } },
    });
  });

  it("requires a reason and supersedes the current entry on correction", async () => {
    management.findShipment.mockResolvedValue(
      shipment({
        goldResultId: RESULT_ID,
        goldAmountGrams: 4.25,
        goldUnitCode: "g",
        goldRevisionCount: 1,
        hasGoldResult: true,
      }),
    );
    repository.createResult.mockImplementation((input) =>
      Promise.resolve(result(input.id, input.amountGrams)),
    );

    await service.record(
      ORGANIZATION_ID,
      SHIPMENT_ID,
      { amountGrams: 4.5, correctionReason: "Corrección de pesada" },
      { auth: AUTH, correlationId: CORRELATION_ID },
    );

    expect(repository.createResult.mock.calls[0]?.[0]).toMatchObject({
      amountGrams: 4.5,
      supersedesResultId: RESULT_ID,
      correctionReason: "Corrección de pesada",
    });
  });

  it("rejects a correction without reason before writing", async () => {
    management.findShipment.mockResolvedValue(
      shipment({
        goldResultId: RESULT_ID,
        goldAmountGrams: 4.25,
        goldUnitCode: "g",
        goldRevisionCount: 1,
        hasGoldResult: true,
      }),
    );

    await expect(
      service.record(
        ORGANIZATION_ID,
        SHIPMENT_ID,
        { amountGrams: 4.5 },
        { auth: AUTH, correlationId: CORRELATION_ID },
      ),
    ).rejects.toMatchObject({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      response: { code: "GOLD_CORRECTION_REASON_REQUIRED" },
    });
    expect(repository.createResult.mock.calls).toHaveLength(0);
  });

  it("records karat with the gold total and audits it", async () => {
    management.findShipment.mockResolvedValue(shipment());
    repository.createResult.mockImplementation((input) =>
      Promise.resolve(result(input.id, input.amountGrams, input.karat)),
    );

    const created = await service.record(
      ORGANIZATION_ID,
      SHIPMENT_ID,
      { amountGrams: 2.5, karat: 18.125 },
      { auth: AUTH, correlationId: CORRELATION_ID },
    );

    expect(created.karat).toBe(18.125);
    expect(repository.createResult.mock.calls[0]?.[0]).toMatchObject({
      amountGrams: 2.5,
      karat: 18.125,
    });
    expect(auditEvents.insert.mock.calls[0]?.[0]).toMatchObject({
      changes: {
        gold_amount_grams: { before: null, after: 2.5 },
        gold_karat: { before: null, after: 18.125 },
      },
    });
  });

  it("corrects only the karat as a new append-only entry with a reason", async () => {
    management.findShipment.mockResolvedValue(
      shipment({
        goldResultId: RESULT_ID,
        goldAmountGrams: 2.5,
        goldUnitCode: "g",
        goldRevisionCount: 1,
        goldKarat: 18,
        hasGoldResult: true,
      }),
    );
    repository.createResult.mockImplementation((input) =>
      Promise.resolve(result(input.id, input.amountGrams, input.karat)),
    );

    await service.record(
      ORGANIZATION_ID,
      SHIPMENT_ID,
      {
        amountGrams: 2.5,
        karat: 21,
        correctionReason: "Ensayo de laboratorio",
      },
      { auth: AUTH, correlationId: CORRELATION_ID },
    );

    expect(repository.createResult.mock.calls[0]?.[0]).toMatchObject({
      amountGrams: 2.5,
      karat: 21,
      supersedesResultId: RESULT_ID,
      correctionReason: "Ensayo de laboratorio",
    });
    expect(auditEvents.insert.mock.calls[0]?.[0]).toMatchObject({
      changes: { gold_karat: { before: 18, after: 21 } },
    });
  });

  it("keeps the current karat when a correction omits it and rejects an unchanged result", async () => {
    const current = shipment({
      goldResultId: RESULT_ID,
      goldAmountGrams: 2.5,
      goldUnitCode: "g",
      goldRevisionCount: 1,
      goldKarat: 18,
      hasGoldResult: true,
    });
    management.findShipment.mockResolvedValue(current);
    repository.createResult.mockImplementation((input) =>
      Promise.resolve(result(input.id, input.amountGrams, input.karat)),
    );

    await service.record(
      ORGANIZATION_ID,
      SHIPMENT_ID,
      { amountGrams: 3, correctionReason: "Nueva pesada" },
      { auth: AUTH, correlationId: CORRELATION_ID },
    );
    expect(repository.createResult.mock.calls[0]?.[0]).toMatchObject({
      amountGrams: 3,
      karat: 18,
    });

    await expect(
      service.record(
        ORGANIZATION_ID,
        SHIPMENT_ID,
        { amountGrams: 2.5, karat: 18, correctionReason: "Sin cambios" },
        { auth: AUTH, correlationId: CORRELATION_ID },
      ),
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      response: { code: "GOLD_AMOUNT_UNCHANGED" },
    });
  });

  it("rejects a karat outside the existing contract before reading the shipment", async () => {
    for (const karat of [-1, 24.001, 18.1234]) {
      await expect(
        service.record(
          ORGANIZATION_ID,
          SHIPMENT_ID,
          { amountGrams: 2.5, karat },
          { auth: AUTH, correlationId: CORRELATION_ID },
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        response: { code: "GOLD_KARAT_INVALID" },
      });
    }
    expect(management.findShipment.mock.calls).toHaveLength(0);
  });

  it("keeps an empty value unregistered by rejecting non-numeric input", async () => {
    await expect(
      service.record(
        ORGANIZATION_ID,
        SHIPMENT_ID,
        { amountGrams: Number.NaN },
        { auth: AUTH, correlationId: CORRELATION_ID },
      ),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      response: { code: "GOLD_AMOUNT_INVALID" },
    });
    expect(management.findShipment.mock.calls).toHaveLength(0);
  });
});

const ORGANIZATION_ID = "30000000-0000-4000-8000-000000000001";

function sweep(
  shipmentId: string,
  sweepId: string,
  sweptAtUtc: string,
  rastras: readonly (readonly [number | null, number | null])[],
) {
  return rastras.map(([inputGrams, remainderGrams], index) => ({
    shipmentId,
    sweepId,
    sweptAtUtc,
    lineComponentId: `${sweepId}-rastra-${index + 1}`,
    inputGrams,
    remainderGrams,
  }));
}
const SHIPMENT_ID = "42000000-0000-4000-8000-000000000001";
const RESULT_ID = "46000000-0000-4000-8000-000000000001";
const SWEEP_ID = "43000000-0000-4000-8000-000000000001";
const COMPONENT_ID = "33000000-0000-4000-8000-000000000001";
const MERCURY_INPUT_ID = "45000000-0000-4000-8000-000000000001";
const MERCURY_REMAINDER_ID = "45000000-0000-4000-8000-000000000002";
const CORRELATION_ID = "40000000-0000-4000-8000-000000000001";

const AUTH: AuthenticatedContext = {
  token: {
    subject: "a0000000-0000-4000-8000-000000000001",
    sessionId: "a0000000-0000-4000-8000-000000000002",
    email: "manager@example.invalid",
    issuedAt: 1,
    expiresAt: 2,
  },
  profile: {
    id: "a1000000-0000-4000-8000-000000000001",
    organizationId: ORGANIZATION_ID,
    authUserId: "a0000000-0000-4000-8000-000000000001",
    displayName: "Lucía ficticia",
    preferredLocale: "es",
    accountStatus: "ACTIVE",
    isActive: true,
    role: {
      id: "20000000-0000-4000-8000-000000000001",
      code: "JEFE_EMPRESA",
      isActive: true,
    },
    permissions: ["gold.read", "gold.results.manage"],
  },
};

function fact(
  supplierId: string,
  supplierName: string,
  cajuelaTotal: number,
  amount: number | null,
  reviewDisposition: "PENDING" | "ACKNOWLEDGED" | "OMITTED" = "PENDING",
) {
  return {
    shipmentId: crypto.randomUUID(),
    supplierId,
    supplierName,
    cajuelaTotal,
    hasGoldResult: amount !== null,
    goldAmountGrams: amount,
    reviewEntryId: reviewDisposition === "PENDING" ? null : crypto.randomUUID(),
    reviewDisposition,
  };
}

function sweepMercury() {
  return {
    organizationId: ORGANIZATION_ID,
    shipmentId: SHIPMENT_ID,
    sweepId: SWEEP_ID,
    sweptAtUtc: "2026-10-01T18:00:00.000Z",
    cajuelaCount: 100,
    lineComponentId: COMPONENT_ID,
    lineComponentName: "Rastra 1",
    lineComponentOrder: 1,
    inputGrams: 12.5,
    remainderGrams: 8.25,
    hasInputRecord: true,
    hasRemainderRecord: true,
    inputMovementId: MERCURY_INPUT_ID,
    remainderMovementId: MERCURY_REMAINDER_ID,
  };
}

function shipment(
  changes: Partial<ManagementShipment> = {},
): ManagementShipment {
  return {
    organizationId: ORGANIZATION_ID,
    plantId: "31000000-0000-4000-8000-000000000001",
    stationId: "34000000-0000-4000-8000-000000000001",
    stationName: "Estación",
    shipmentId: SHIPMENT_ID,
    feedCycleId: "41000000-0000-4000-8000-000000000001",
    productionLineId: "32000000-0000-4000-8000-000000000001",
    productionLineName: "Línea 1",
    productionLineOrder: 1,
    supplierId: "35000000-0000-4000-8000-000000000001",
    supplierName: "Proveedor",
    responsibleWorkerId: null,
    responsibleWorkerName: null,
    startedAtUtc: "2026-10-01T12:00:00.000Z",
    cajuelaTotal: 100,
    sweepCount: 1,
    sweptCajuelas: 100,
    cajuelasSinceLastSweep: 0,
    nextSweepAt: 350,
    sweepPending: false,
    lastActivityAtUtc: "2026-10-01T18:00:00.000Z",
    status: "COMPLETED",
    completedAtUtc: "2026-10-01T18:00:00.000Z",
    goldResultId: null,
    goldAmountGrams: null,
    goldUnitCode: null,
    goldRecordedAtUtc: null,
    goldRecordedByProfileId: null,
    goldRevisionCount: null,
    goldKarat: null,
    hasGoldResult: false,
    ...changes,
  };
}

function result(
  id: string,
  amountGrams: number,
  karat: number | null = null,
): GoldResultEntry {
  return {
    id,
    organizationId: ORGANIZATION_ID,
    shipmentId: SHIPMENT_ID,
    amountGrams,
    karat,
    unitCode: "g",
    recordedAtUtc: "2026-10-12T12:00:00.000Z",
    recordedByProfileId: AUTH.profile.id,
    recordedByDisplayName: AUTH.profile.displayName,
    supersedesResultId: null,
    correctionReason: null,
  };
}
