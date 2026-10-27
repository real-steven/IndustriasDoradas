import { HttpStatus } from "@nestjs/common";

import type {
  CreateInventoryMovement,
  CreateInventoryReview,
  CreateOperationalNoveltyChange,
  InventoryCatalogItem,
  InventoryMovement,
  InventoryRepository,
  InventoryReview,
  OperationalNoveltyChange,
} from "./inventory.contracts";
import { InventoryService } from "./inventory.service";
import type { AuditEventRepository } from "../audit/audit.contracts";
import { AuditTrailService } from "../audit/audit-trail.service";
import type { AuthenticatedContext } from "../auth/auth.contracts";

describe("InventoryService", () => {
  let repository: jest.Mocked<InventoryRepository>;
  let auditEvents: jest.Mocked<AuditEventRepository>;
  let service: InventoryService;

  beforeEach(() => {
    repository = {
      hasPlantScope: jest.fn().mockResolvedValue(true),
      listCatalog: jest.fn(),
      findCatalog: jest.fn().mockResolvedValue(item()),
      createCatalog: jest.fn(),
      setCatalogActive: jest.fn(),
      listMovements: jest.fn(),
      listStock: jest.fn(),
      listAssignments: jest.fn(),
      listReviews: jest.fn(),
      listComponentChanges: jest.fn(),
      listNoveltyCategories: jest.fn(),
      listNovelties: jest.fn(),
      findMovement: jest.fn(),
      getBalance: jest.fn().mockResolvedValue(10),
      createMovement: jest
        .fn()
        .mockImplementation((input: CreateInventoryMovement) =>
          Promise.resolve<InventoryMovement>({
            ...input,
            responsibleWorkerId: input.responsibleWorkerId ?? null,
            reason: input.reason ?? null,
            destination: input.destination ?? null,
            notes: input.notes ?? null,
            relatedMovementId: input.relatedMovementId ?? null,
            linkedSweepId: input.linkedSweepId ?? null,
          }),
        ),
      createReview: jest
        .fn()
        .mockImplementation((input: CreateInventoryReview) =>
          Promise.resolve<InventoryReview>({
            ...input,
            notes: input.notes ?? null,
          }),
        ),
      createComponentChange: jest.fn(),
      createNoveltyChange: jest
        .fn()
        .mockImplementation((input: CreateOperationalNoveltyChange) =>
          Promise.resolve<OperationalNoveltyChange>({
            ...input,
            lineId: input.lineId ?? null,
            categoryId: input.categoryId ?? null,
            description: input.description ?? null,
            responsibleWorkerId: input.responsibleWorkerId ?? null,
          }),
        ),
    };
    auditEvents = { insert: jest.fn().mockResolvedValue(undefined) };
    service = new InventoryService(
      repository,
      new AuditTrailService(auditEvents),
    );
  });

  it("records entry, exit, reversal and motivated adjustment as separate facts", async () => {
    const entry = await service.recordMovement(
      ORGANIZATION_ID,
      PLANT_ID,
      {
        inventoryItemId: ITEM_ID,
        unitId: UNIT_ID,
        movementType: "ENTRY",
        quantity: 10,
        occurredAtUtc: "2026-10-26T18:00:00.000Z",
      },
      context(MANAGER),
    );
    const exit = await service.recordMovement(
      ORGANIZATION_ID,
      PLANT_ID,
      {
        inventoryItemId: ITEM_ID,
        unitId: UNIT_ID,
        movementType: "EXIT",
        quantity: 4,
        linkedSweepId: SWEEP_ID,
        occurredAtUtc: "2026-10-26T18:01:00.000Z",
      },
      context(MANAGER),
    );
    repository.findMovement.mockResolvedValue(exit);
    const reversal = await service.reverseMovement(
      ORGANIZATION_ID,
      PLANT_ID,
      exit.id,
      {
        reason: "Salida registrada por error",
        occurredAtUtc: "2026-10-26T18:02:00.000Z",
      },
      context(MANAGER),
    );
    const adjustment = await service.recordAdjustment(
      ORGANIZATION_ID,
      PLANT_ID,
      {
        inventoryItemId: ITEM_ID,
        unitId: UNIT_ID,
        quantityDelta: -1,
        reason: "Diferencia confirmada en conteo",
        occurredAtUtc: "2026-10-26T18:03:00.000Z",
      },
      context(MANAGER),
    );

    expect(entry).toMatchObject({ movementType: "ENTRY", quantityDelta: 10 });
    expect(exit).toMatchObject({ movementType: "EXIT", quantityDelta: -4 });
    expect(reversal).toMatchObject({
      movementType: "REVERSAL",
      quantityDelta: 4,
      relatedMovementId: exit.id,
      linkedSweepId: SWEEP_ID,
      reason: "Salida registrada por error",
    });
    expect(adjustment).toMatchObject({
      movementType: "ADJUSTMENT",
      quantityDelta: -1,
      reason: "Diferencia confirmada en conteo",
    });
    expect(repository.createMovement.mock.calls).toHaveLength(4);
    expect(auditEvents.insert.mock.calls).toHaveLength(4);
  });

  it("rejects a movement with requested and available quantities", async () => {
    repository.getBalance.mockResolvedValue(8);

    await expect(
      service.recordMovement(
        ORGANIZATION_ID,
        PLANT_ID,
        {
          inventoryItemId: ITEM_ID,
          unitId: UNIT_ID,
          movementType: "EXIT",
          quantity: 9,
          occurredAtUtc: "2026-10-26T18:00:00.000Z",
        },
        context(MANAGER),
      ),
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      response: {
        code: "INVENTORY_STOCK_INSUFFICIENT",
        message: "Requested quantity 9 exceeds available quantity 8",
      },
    });
    expect(repository.createMovement.mock.calls).toHaveLength(0);
  });

  it("enforces the active plant scope for a plant manager", async () => {
    repository.hasPlantScope.mockResolvedValue(false);

    await expect(
      service.listItems(
        ORGANIZATION_ID,
        PLANT_ID,
        { page: 1, pageSize: 20, state: "active" },
        context(PLANT_MANAGER),
      ),
    ).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      response: { code: "INVENTORY_PLANT_NOT_AUTHORIZED" },
    });
  });

  it("scopes the management read models to the requested plant", async () => {
    const page = { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 };
    repository.listStock.mockResolvedValue(page);
    repository.listAssignments.mockResolvedValue(page);
    repository.listReviews.mockResolvedValue(page);
    repository.listComponentChanges.mockResolvedValue(page);
    repository.listNovelties.mockResolvedValue(page);
    const query = { page: 1, pageSize: 20, state: "all" as const };

    await service.listStock(ORGANIZATION_ID, PLANT_ID, query, context(MANAGER));
    await service.listAssignments(
      ORGANIZATION_ID,
      PLANT_ID,
      { ...query, assignmentStatus: "ASSIGNED" },
      context(MANAGER),
    );
    await service.listReviews(
      ORGANIZATION_ID,
      PLANT_ID,
      { ...query, differencesOnly: true },
      context(MANAGER),
    );
    await service.listComponentChanges(
      ORGANIZATION_ID,
      PLANT_ID,
      { ...query, direction: "asc" },
      context(MANAGER),
    );
    await service.listNovelties(
      ORGANIZATION_ID,
      PLANT_ID,
      { ...query, lineId: LINE_ID, openOnly: true },
      context(MANAGER),
    );

    expect(repository.listStock.mock.calls[0]).toEqual([
      ORGANIZATION_ID,
      expect.objectContaining({ plantId: PLANT_ID }),
    ]);
    expect(repository.listAssignments.mock.calls[0]).toEqual([
      ORGANIZATION_ID,
      expect.objectContaining({
        plantId: PLANT_ID,
        assignmentStatus: "ASSIGNED",
      }),
    ]);
    expect(repository.listReviews.mock.calls[0]).toEqual([
      ORGANIZATION_ID,
      expect.objectContaining({ plantId: PLANT_ID, differencesOnly: true }),
    ]);
    expect(repository.listComponentChanges.mock.calls[0]).toEqual([
      ORGANIZATION_ID,
      expect.objectContaining({ plantId: PLANT_ID, direction: "asc" }),
    ]);
    expect(repository.listNovelties.mock.calls[0]).toEqual([
      ORGANIZATION_ID,
      expect.objectContaining({
        plantId: PLANT_ID,
        lineId: LINE_ID,
        openOnly: true,
      }),
    ]);
  });

  it("opens and closes an operational novelty as two audited facts", async () => {
    const opened = await service.openNovelty(
      ORGANIZATION_ID,
      PLANT_ID,
      {
        lineId: LINE_ID,
        categoryId: CATEGORY_ID,
        description: "Rastra detenida por mantenimiento",
        occurredAtUtc: "2026-10-27T23:30:00.000Z",
      },
      context(MANAGER),
    );
    const closed = await service.closeNovelty(
      ORGANIZATION_ID,
      PLANT_ID,
      opened.noveltyId,
      { occurredAtUtc: "2026-10-28T01:15:00.000Z" },
      context(MANAGER),
    );

    expect(opened).toMatchObject({
      changeType: "OPENING",
      lineId: LINE_ID,
      categoryId: CATEGORY_ID,
      description: "Rastra detenida por mantenimiento",
    });
    expect(closed).toMatchObject({
      noveltyId: opened.noveltyId,
      changeType: "CLOSURE",
      lineId: null,
      categoryId: null,
      description: null,
    });
    expect(repository.createNoveltyChange.mock.calls).toHaveLength(2);
    expect(auditEvents.insert.mock.calls).toHaveLength(2);
  });

  it("computes review differences without creating an adjustment", async () => {
    const review = await service.recordReview(
      ORGANIZATION_ID,
      PLANT_ID,
      {
        reviewedAtUtc: "2026-10-26T19:00:00.000Z",
        lines: [
          {
            inventoryItemId: ITEM_ID,
            unitId: UNIT_ID,
            expectedQuantity: 8,
            countedQuantity: 7,
          },
        ],
      },
      context(MANAGER),
    );

    expect(review).toMatchObject({
      status: "WITH_DIFFERENCES",
      lines: [{ differenceQuantity: -1 }],
    });
    expect(repository.createMovement.mock.calls).toHaveLength(0);
  });

  it("rejects duplicate items in one physical review", async () => {
    const line = {
      inventoryItemId: ITEM_ID,
      unitId: UNIT_ID,
      expectedQuantity: 8,
      countedQuantity: 8,
    };
    await expect(
      service.recordReview(
        ORGANIZATION_ID,
        PLANT_ID,
        {
          reviewedAtUtc: "2026-10-26T19:00:00.000Z",
          lines: [line, line],
        },
        context(MANAGER),
      ),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      response: { code: "INVENTORY_REVIEW_DUPLICATE_ITEM" },
    });
  });
});

const ORGANIZATION_ID = "30000000-0000-4000-8000-000000000001";
const PLANT_ID = "31000000-0000-4000-8000-000000000001";
const LINE_ID = "32000000-0000-4000-8000-000000000001";
const ITEM_ID = "77200000-0000-4000-8000-000000000001";
const UNIT_ID = "77100000-0000-4000-8000-000000000001";
const CATEGORY_ID = "77300000-0000-4000-8000-000000000001";
const SWEEP_ID = "f4000000-0000-4000-8000-000000000001";
const CORRELATION_ID = "40000000-0000-4000-8000-000000000001";

const MANAGER = auth("JEFE_EMPRESA");
const PLANT_MANAGER = auth("JEFE_PLANTA");

function auth(role: "JEFE_EMPRESA" | "JEFE_PLANTA"): AuthenticatedContext {
  return {
    token: {
      subject: "a0000000-0000-4000-8000-000000000001",
      sessionId: "a0000000-0000-4000-8000-000000000002",
      email: "inventory@example.invalid",
      issuedAt: 1,
      expiresAt: 2,
    },
    profile: {
      id: "a1000000-0000-4000-8000-000000000002",
      organizationId: ORGANIZATION_ID,
      authUserId: "a0000000-0000-4000-8000-000000000001",
      displayName: "Responsable ficticio",
      preferredLocale: "es",
      accountStatus: "ACTIVE",
      isActive: true,
      role: {
        id: "20000000-0000-4000-8000-000000000003",
        code: role,
        isActive: true,
      },
      permissions: ["inventory.manage"],
    },
  };
}

function context(authenticated: AuthenticatedContext) {
  return { auth: authenticated, correlationId: CORRELATION_ID };
}

function item(): InventoryCatalogItem {
  return {
    id: ITEM_ID,
    organizationId: ORGANIZATION_ID,
    plantId: PLANT_ID,
    itemTypeId: "77000000-0000-4000-8000-000000000001",
    unitId: UNIT_ID,
    name: "Martillo",
    isActive: true,
    deactivatedAt: null,
    createdAt: "2026-10-26T17:00:00.000Z",
    updatedAt: "2026-10-26T17:00:00.000Z",
  };
}
