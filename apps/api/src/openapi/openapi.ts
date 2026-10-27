import type { INestApplication } from "@nestjs/common";
import {
  DocumentBuilder,
  type OpenAPIObject,
  SwaggerModule,
} from "@nestjs/swagger";

const UUID = { type: "string", format: "uuid" } as const;
const DATE_TIME = { type: "string", format: "date-time" } as const;

interface MutableResponse {
  content?: Record<string, unknown>;
  description?: string;
}

interface MutableOperation {
  operationId?: string;
  responses: Record<string, MutableResponse>;
  security?: Array<Record<string, string[]>>;
}

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle("Industrias Doradas API")
    .setDescription(
      "Contrato backend del sistema de planta. Todos los ejemplos son ficticios.",
    )
    .setVersion("1.0.0")
    .addBearerAuth(
      { type: "http", scheme: "bearer", bearerFormat: "Supabase access token" },
      "supabase",
    )
    .build();
  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controller, method) => `${controller}_${method}`,
  });
  document.components ??= {};
  document.components.schemas = {
    ...document.components.schemas,
    ErrorResponse: {
      type: "object",
      required: [
        "statusCode",
        "code",
        "message",
        "path",
        "timestamp",
        "correlationId",
      ],
      properties: {
        statusCode: { type: "integer", example: 403 },
        code: { type: "string", example: "AUTHORIZATION_DENIED" },
        message: {
          oneOf: [
            { type: "string" },
            { type: "array", items: { type: "string" } },
          ],
        },
        path: {
          type: "string",
          example:
            "/api/v1/organizations/30000000-0000-4000-8000-000000000001/plants",
        },
        timestamp: DATE_TIME,
        correlationId: UUID,
      },
    },
    Session: {
      type: "object",
      required: [
        "userId",
        "sessionId",
        "profileId",
        "organizationId",
        "displayName",
        "role",
        "permissions",
        "issuedAt",
        "expiresAt",
      ],
      properties: {
        userId: UUID,
        sessionId: UUID,
        profileId: UUID,
        organizationId: UUID,
        displayName: { type: "string", example: "Jefe de planta ficticio" },
        role: {
          type: "string",
          enum: ["JEFE_EMPRESA", "ADMINISTRADOR", "JEFE_PLANTA"],
        },
        permissions: { type: "array", items: { type: "string" } },
        issuedAt: DATE_TIME,
        expiresAt: DATE_TIME,
      },
    },
    CatalogItem: {
      type: "object",
      required: [
        "id",
        "organizationId",
        "name",
        "isActive",
        "deactivatedAt",
        "createdAt",
        "updatedAt",
      ],
      additionalProperties: false,
      properties: {
        id: UUID,
        organizationId: UUID,
        code: { type: "string", example: "LINEA_01" },
        name: { type: "string", example: "Línea ficticia" },
        isActive: { type: "boolean" },
        deactivatedAt: { ...DATE_TIME, nullable: true },
        plantId: UUID,
        productionLineId: UUID,
        componentTypeId: UUID,
        displayOrder: { type: "integer" },
        timezone: { type: "string", example: "America/Costa_Rica" },
        permissionVersion: { type: "integer" },
        email: { type: "string", format: "email", nullable: true },
        phone: { type: "string", nullable: true },
        createdAt: DATE_TIME,
        updatedAt: DATE_TIME,
      },
    },
    InventoryCatalogItem: {
      type: "object",
      required: [
        "id",
        "organizationId",
        "name",
        "isActive",
        "deactivatedAt",
        "createdAt",
        "updatedAt",
      ],
      additionalProperties: false,
      properties: {
        id: UUID,
        organizationId: UUID,
        code: { type: "string", example: "HERRAMIENTA" },
        name: { type: "string", example: "Martillo ficticio" },
        isActive: { type: "boolean" },
        deactivatedAt: { ...DATE_TIME, nullable: true },
        isCustom: { type: "boolean" },
        decimalPlaces: { type: "integer", minimum: 0, maximum: 3 },
        plantId: UUID,
        itemTypeId: UUID,
        unitId: UUID,
        createdAt: DATE_TIME,
        updatedAt: DATE_TIME,
      },
    },
    InventoryMovement: {
      type: "object",
      required: [
        "id",
        "organizationId",
        "plantId",
        "inventoryItemId",
        "unitId",
        "movementType",
        "quantityDelta",
        "actorProfileId",
        "responsibleWorkerId",
        "occurredAtUtc",
        "recordedAtUtc",
        "reason",
        "destination",
        "notes",
        "relatedMovementId",
      ],
      additionalProperties: false,
      properties: {
        id: UUID,
        organizationId: UUID,
        plantId: UUID,
        inventoryItemId: UUID,
        unitId: UUID,
        movementType: {
          type: "string",
          enum: [
            "ENTRY",
            "EXIT",
            "CONSUMPTION",
            "RETURN",
            "ADJUSTMENT",
            "REVERSAL",
          ],
        },
        quantityDelta: { type: "number", multipleOf: 0.001 },
        actorProfileId: UUID,
        responsibleWorkerId: { ...UUID, nullable: true },
        occurredAtUtc: DATE_TIME,
        recordedAtUtc: DATE_TIME,
        reason: { type: "string", nullable: true },
        destination: { type: "string", nullable: true },
        notes: { type: "string", nullable: true },
        relatedMovementId: { ...UUID, nullable: true },
      },
    },
    InventoryReviewLine: {
      type: "object",
      required: [
        "inventoryItemId",
        "unitId",
        "expectedQuantity",
        "countedQuantity",
        "differenceQuantity",
      ],
      properties: {
        inventoryItemId: UUID,
        unitId: UUID,
        expectedQuantity: { type: "number", minimum: 0 },
        countedQuantity: { type: "number", minimum: 0 },
        differenceQuantity: { type: "number" },
      },
    },
    InventoryReview: {
      type: "object",
      required: [
        "id",
        "organizationId",
        "plantId",
        "status",
        "reviewedByProfileId",
        "reviewedAtUtc",
        "recordedAtUtc",
        "notes",
        "lines",
      ],
      properties: {
        id: UUID,
        organizationId: UUID,
        plantId: UUID,
        status: {
          type: "string",
          enum: ["WITHOUT_DIFFERENCES", "WITH_DIFFERENCES"],
        },
        reviewedByProfileId: UUID,
        reviewedAtUtc: DATE_TIME,
        recordedAtUtc: DATE_TIME,
        notes: { type: "string", nullable: true },
        lines: {
          type: "array",
          items: { $ref: "#/components/schemas/InventoryReviewLine" },
        },
      },
    },
    RastraComponentChange: {
      type: "object",
      required: [
        "id",
        "organizationId",
        "plantId",
        "rastraId",
        "changeType",
        "installationId",
        "occurredAtUtc",
        "recordedAtUtc",
      ],
      properties: {
        id: UUID,
        organizationId: UUID,
        plantId: UUID,
        rastraId: UUID,
        changeType: {
          type: "string",
          enum: ["INSTALLATION", "REMOVAL", "REPLACEMENT"],
        },
        installationId: UUID,
        replacedInstallationId: { ...UUID, nullable: true },
        inventoryItemId: { ...UUID, nullable: true },
        unitId: { ...UUID, nullable: true },
        quantity: { type: "number", nullable: true },
        actorProfileId: UUID,
        responsibleWorkerId: { ...UUID, nullable: true },
        occurredAtUtc: DATE_TIME,
        recordedAtUtc: DATE_TIME,
        componentIdentifier: { type: "string", nullable: true },
        installedCondition: { type: "string", nullable: true },
        removedCondition: { type: "string", nullable: true },
        reason: { type: "string", nullable: true },
        installationNotes: { type: "string", nullable: true },
        removalNotes: { type: "string", nullable: true },
      },
    },
    Worker: {
      type: "object",
      required: [
        "id",
        "organizationId",
        "plantId",
        "sourceRequestId",
        "userProfileId",
        "category",
        "name",
        "status",
        "statusChangedAt",
        "isActive",
      ],
      properties: {
        id: UUID,
        organizationId: UUID,
        plantId: UUID,
        sourceRequestId: UUID,
        userProfileId: { ...UUID, nullable: true },
        category: { type: "string", enum: ["OPERARIO", "JEFE_PLANTA"] },
        name: { type: "string", example: "Trabajador ficticio" },
        email: { type: "string", format: "email", nullable: true },
        phone: { type: "string", nullable: true },
        status: {
          type: "string",
          enum: ["PROVISIONAL", "PROVISIONAL_VENCIDO", "ACTIVO", "RECHAZADO"],
        },
        statusChangedAt: DATE_TIME,
        isActive: { type: "boolean" },
        deactivatedAt: { ...DATE_TIME, nullable: true },
      },
    },
    Account: {
      type: "object",
      required: [
        "id",
        "organizationId",
        "displayName",
        "preferredLocale",
        "accountStatus",
        "roleCode",
        "provisioningMethod",
        "isActive",
      ],
      properties: {
        id: UUID,
        organizationId: UUID,
        displayName: { type: "string", example: "Usuario ficticio" },
        preferredLocale: { type: "string", enum: ["es", "en"] },
        accountStatus: {
          type: "string",
          enum: ["PENDING_APPROVAL", "ACTIVE", "SUSPENDED"],
        },
        roleCode: {
          type: "string",
          enum: ["JEFE_EMPRESA", "ADMINISTRADOR", "JEFE_PLANTA"],
        },
        provisioningMethod: {
          type: "string",
          enum: ["DIRECT", "EMAIL_INVITATION"],
        },
        statusReason: { type: "string", nullable: true },
        isActive: { type: "boolean" },
        createdAt: DATE_TIME,
        updatedAt: DATE_TIME,
      },
    },
    AdministratorPermission: {
      type: "object",
      required: ["code", "description", "assigned"],
      properties: {
        code: { type: "string", example: "inventory.manage" },
        description: { type: "string" },
        assigned: { type: "boolean" },
      },
    },
    ManagementOperationLine: {
      type: "object",
      required: [
        "organizationId",
        "plantId",
        "stationId",
        "stationName",
        "shipmentId",
        "feedCycleId",
        "productionLineId",
        "productionLineName",
        "productionLineOrder",
        "supplierId",
        "supplierName",
        "responsibleWorkerId",
        "responsibleWorkerName",
        "startedAtUtc",
        "cajuelaTotal",
        "sweepCount",
        "sweptCajuelas",
        "cajuelasSinceLastSweep",
        "nextSweepAt",
        "sweepPending",
        "lastActivityAtUtc",
      ],
      properties: {
        organizationId: UUID,
        plantId: UUID,
        stationId: UUID,
        stationName: { type: "string" },
        shipmentId: UUID,
        feedCycleId: UUID,
        productionLineId: UUID,
        productionLineName: { type: "string" },
        productionLineOrder: { type: "integer" },
        supplierId: UUID,
        supplierName: { type: "string" },
        responsibleWorkerId: { ...UUID, nullable: true },
        responsibleWorkerName: { type: "string", nullable: true },
        startedAtUtc: DATE_TIME,
        cajuelaTotal: { type: "integer" },
        sweepCount: { type: "integer" },
        sweptCajuelas: { type: "integer" },
        cajuelasSinceLastSweep: { type: "integer" },
        nextSweepAt: { type: "integer" },
        sweepPending: { type: "boolean" },
        lastActivityAtUtc: DATE_TIME,
      },
    },
    ManagementFreshness: {
      type: "object",
      required: [
        "cursor",
        "hasChanges",
        "effectiveAtUtc",
        "serverTimeUtc",
        "pollAfterSeconds",
      ],
      additionalProperties: false,
      properties: {
        cursor: { type: "string", description: "Cursor incremental opaco" },
        hasChanges: { type: "boolean" },
        effectiveAtUtc: { ...DATE_TIME, nullable: true },
        serverTimeUtc: DATE_TIME,
        pollAfterSeconds: { type: "integer", minimum: 30 },
      },
    },
    AttendanceHours: {
      type: "object",
      required: [
        "version",
        "timezone",
        "period",
        "summary",
        "workers",
        "shifts",
        "incidents",
        "adjustments",
        "coverage",
        "freshness",
      ],
      additionalProperties: false,
      properties: {
        version: { type: "string", enum: ["attendance-hours-v1"] },
        timezone: { type: "string", enum: ["America/Costa_Rica"] },
        period: {
          type: "object",
          required: ["fromDate", "toDate", "fromUtc", "toUtc"],
          properties: {
            fromDate: { type: "string", format: "date" },
            toDate: { type: "string", format: "date" },
            fromUtc: DATE_TIME,
            toUtc: DATE_TIME,
          },
        },
        summary: {
          type: "object",
          required: [
            "workerCount",
            "confirmedShiftCount",
            "openShiftCount",
            "incidentCount",
            "adjustmentCount",
            "totalConfirmedMinutes",
          ],
          properties: {
            workerCount: { type: "integer", minimum: 0 },
            confirmedShiftCount: { type: "integer", minimum: 0 },
            openShiftCount: { type: "integer", minimum: 0 },
            incidentCount: { type: "integer", minimum: 0 },
            adjustmentCount: { type: "integer", minimum: 0 },
            totalConfirmedMinutes: { type: "number", minimum: 0 },
          },
        },
        workers: {
          type: "array",
          items: {
            type: "object",
            required: [
              "workerId",
              "workerName",
              "confirmedMinutes",
              "completedShiftCount",
              "openShiftCount",
              "incidentCount",
            ],
            properties: {
              workerId: UUID,
              workerName: { type: "string" },
              confirmedMinutes: { type: "number", minimum: 0 },
              completedShiftCount: { type: "integer", minimum: 0 },
              openShiftCount: { type: "integer", minimum: 0 },
              incidentCount: { type: "integer", minimum: 0 },
            },
          },
        },
        shifts: {
          type: "array",
          items: {
            type: "object",
            required: [
              "workerId",
              "workerName",
              "plantId",
              "status",
              "startedOn",
              "checkInEventId",
              "checkInAtUtc",
              "checkOutEventId",
              "checkOutAtUtc",
              "durationMinutes",
              "minutesInPeriod",
            ],
            properties: {
              workerId: UUID,
              workerName: { type: "string" },
              plantId: UUID,
              status: { type: "string", enum: ["COMPLETED", "OPEN"] },
              startedOn: { type: "string", format: "date" },
              checkInEventId: UUID,
              checkInAtUtc: DATE_TIME,
              checkOutEventId: { ...UUID, nullable: true },
              checkOutAtUtc: { ...DATE_TIME, nullable: true },
              durationMinutes: { type: "number", minimum: 0, nullable: true },
              minutesInPeriod: {
                type: "number",
                minimum: 0,
                nullable: true,
              },
            },
          },
        },
        incidents: {
          type: "array",
          items: {
            type: "object",
            required: [
              "type",
              "workerId",
              "workerName",
              "eventId",
              "detectedAtUtc",
              "description",
            ],
            properties: {
              type: {
                type: "string",
                enum: [
                  "DUPLICATE_CHECK_IN",
                  "CHECK_OUT_WITHOUT_CHECK_IN",
                  "OPEN_SHIFT_EXCEEDED",
                ],
              },
              workerId: UUID,
              workerName: { type: "string" },
              eventId: UUID,
              detectedAtUtc: DATE_TIME,
              description: { type: "string" },
            },
          },
        },
        adjustments: {
          type: "array",
          items: {
            type: "object",
            required: [
              "eventId",
              "eventType",
              "workerId",
              "workerName",
              "plantId",
              "occurredAtUtc",
              "recordedAtUtc",
              "confirmedAtUtc",
              "correctedByProfileId",
              "correctedByDisplayName",
              "correctionReason",
              "relatedEventId",
            ],
            properties: {
              eventId: UUID,
              eventType: {
                type: "string",
                enum: ["ADJUSTED_CHECK_IN", "ADJUSTED_CHECK_OUT"],
              },
              workerId: UUID,
              workerName: { type: "string" },
              plantId: UUID,
              occurredAtUtc: DATE_TIME,
              recordedAtUtc: DATE_TIME,
              confirmedAtUtc: DATE_TIME,
              correctedByProfileId: UUID,
              correctedByDisplayName: { type: "string" },
              correctionReason: { type: "string" },
              relatedEventId: UUID,
            },
          },
        },
        coverage: {
          type: "object",
          required: [
            "status",
            "eventsRead",
            "confirmedEventsUsed",
            "excludedEvents",
            "eventsInPeriod",
            "firstEventAtUtc",
            "lastEventAtUtc",
          ],
          properties: {
            status: { type: "string", enum: ["COMPLETE"] },
            eventsRead: { type: "integer", minimum: 0 },
            confirmedEventsUsed: { type: "integer", minimum: 0 },
            excludedEvents: { type: "integer", minimum: 0 },
            eventsInPeriod: { type: "integer", minimum: 0 },
            firstEventAtUtc: { ...DATE_TIME, nullable: true },
            lastEventAtUtc: { ...DATE_TIME, nullable: true },
          },
        },
        freshness: {
          type: "object",
          required: ["generatedAtUtc", "lastConfirmedAtUtc", "lagSeconds"],
          properties: {
            generatedAtUtc: DATE_TIME,
            lastConfirmedAtUtc: { ...DATE_TIME, nullable: true },
            lagSeconds: { type: "integer", minimum: 0, nullable: true },
          },
        },
      },
    },
    ManagementShipment: {
      allOf: [
        { $ref: "#/components/schemas/ManagementOperationLine" },
        {
          type: "object",
          required: [
            "status",
            "completedAtUtc",
            "goldResultId",
            "goldAmountGrams",
            "goldUnitCode",
            "goldRecordedAtUtc",
            "goldRecordedByProfileId",
            "goldRevisionCount",
            "hasGoldResult",
          ],
          properties: {
            status: { type: "string", enum: ["COMPLETED"] },
            completedAtUtc: DATE_TIME,
            goldResultId: { ...UUID, nullable: true },
            goldAmountGrams: {
              type: "number",
              format: "double",
              minimum: 0,
              nullable: true,
            },
            goldUnitCode: { type: "string", enum: ["g"], nullable: true },
            goldRecordedAtUtc: { ...DATE_TIME, nullable: true },
            goldRecordedByProfileId: { ...UUID, nullable: true },
            goldRevisionCount: {
              type: "integer",
              minimum: 1,
              nullable: true,
            },
            hasGoldResult: { type: "boolean" },
          },
        },
      ],
    },
    ManagementSweepMercury: {
      type: "object",
      required: [
        "organizationId",
        "shipmentId",
        "sweepId",
        "sweptAtUtc",
        "cajuelaCount",
        "lineComponentId",
        "lineComponentName",
        "lineComponentOrder",
        "inputGrams",
        "remainderGrams",
        "hasInputRecord",
        "hasRemainderRecord",
      ],
      additionalProperties: false,
      properties: {
        organizationId: UUID,
        shipmentId: UUID,
        sweepId: UUID,
        sweptAtUtc: DATE_TIME,
        cajuelaCount: { type: "integer", minimum: 1 },
        lineComponentId: UUID,
        lineComponentName: { type: "string" },
        lineComponentOrder: { type: "integer" },
        inputGrams: { type: "number", format: "double", nullable: true },
        remainderGrams: { type: "number", format: "double", nullable: true },
        hasInputRecord: { type: "boolean" },
        hasRemainderRecord: { type: "boolean" },
      },
    },
    GoldResultEntry: {
      type: "object",
      required: [
        "id",
        "organizationId",
        "shipmentId",
        "amountGrams",
        "unitCode",
        "recordedAtUtc",
        "recordedByProfileId",
        "recordedByDisplayName",
        "supersedesResultId",
        "correctionReason",
      ],
      additionalProperties: false,
      properties: {
        id: UUID,
        organizationId: UUID,
        shipmentId: UUID,
        amountGrams: {
          type: "number",
          format: "double",
          minimum: 0,
          multipleOf: 0.01,
        },
        unitCode: { type: "string", enum: ["g"] },
        recordedAtUtc: DATE_TIME,
        recordedByProfileId: UUID,
        recordedByDisplayName: { type: "string" },
        supersedesResultId: { ...UUID, nullable: true },
        correctionReason: { type: "string", nullable: true },
      },
    },
    GoldSupplierCoverage: {
      type: "object",
      required: [
        "supplierId",
        "supplierName",
        "totalShipments",
        "registeredShipments",
        "excludedShipments",
        "coveragePercentage",
        "totalGoldGrams",
        "includedCajuelas",
        "gramsPerCajuela",
      ],
      additionalProperties: false,
      properties: {
        supplierId: UUID,
        supplierName: { type: "string" },
        totalShipments: { type: "integer", minimum: 0 },
        registeredShipments: { type: "integer", minimum: 0 },
        excludedShipments: { type: "integer", minimum: 0 },
        coveragePercentage: { type: "number", minimum: 0, maximum: 100 },
        totalGoldGrams: { type: "number", minimum: 0 },
        includedCajuelas: { type: "integer", minimum: 0 },
        gramsPerCajuela: { type: "number", minimum: 0, nullable: true },
      },
    },
    GoldSummary: {
      type: "object",
      required: [
        "totalShipments",
        "registeredShipments",
        "excludedShipments",
        "coveragePercentage",
        "totalGoldGrams",
        "includedCajuelas",
        "gramsPerCajuela",
        "suppliers",
      ],
      additionalProperties: false,
      properties: {
        totalShipments: { type: "integer", minimum: 0 },
        registeredShipments: { type: "integer", minimum: 0 },
        excludedShipments: { type: "integer", minimum: 0 },
        coveragePercentage: { type: "number", minimum: 0, maximum: 100 },
        totalGoldGrams: { type: "number", minimum: 0 },
        includedCajuelas: { type: "integer", minimum: 0 },
        gramsPerCajuela: { type: "number", minimum: 0, nullable: true },
        suppliers: {
          type: "array",
          items: { $ref: "#/components/schemas/GoldSupplierCoverage" },
        },
      },
    },
    RecordShipmentGoldDto: {
      type: "object",
      required: ["amountGrams"],
      additionalProperties: false,
      properties: {
        amountGrams: {
          type: "number",
          format: "double",
          minimum: 0,
          multipleOf: 0.01,
        },
        correctionReason: { type: "string", minLength: 1, maxLength: 500 },
      },
    },
    PageCatalog: pageSchema("CatalogItem"),
    PageInventoryCatalog: pageSchema("InventoryCatalogItem"),
    PageInventoryMovement: pageSchema("InventoryMovement"),
    PageWorker: pageSchema("Worker"),
    PageAccount: pageSchema("Account"),
    PageManagementOperationLine: pageSchema("ManagementOperationLine"),
    PageManagementShipment: pageSchema("ManagementShipment"),
    PageManagementSweepMercury: pageSchema("ManagementSweepMercury"),
  };

  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const candidate of Object.values(pathItem ?? {}) as unknown[]) {
      if (!isOperation(candidate)) continue;
      const operation = candidate;
      if (path !== "/api/v1/health") operation.security = [{ supabase: [] }];
      operation.responses ??= {};
      for (const status of ["400", "401", "403", "409", "422", "500", "503"]) {
        operation.responses[status] ??= {
          description: "Error estable",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        };
      }
      if (path.includes("/management/shipments/{shipmentId}")) {
        operation.responses["404"] ??= {
          description: "Cargamento gerencial no encontrado",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        };
      }
      const success = operation.responses["200"] ?? operation.responses["201"];
      if (success !== undefined && typeof success === "object") {
        success.content = {
          "application/json": {
            schema: responseSchema(path, operation.operationId ?? ""),
          },
        };
      }
    }
  }
  return document;
}

function isOperation(value: unknown): value is MutableOperation {
  if (typeof value !== "object" || value === null || !("responses" in value)) {
    return false;
  }
  return typeof (value as { responses?: unknown }).responses === "object";
}

export function setupOpenApi(app: INestApplication): void {
  SwaggerModule.setup("docs", app, () => createOpenApiDocument(app), {
    useGlobalPrefix: true,
    jsonDocumentUrl: "openapi.json",
    customSiteTitle: "Industrias Doradas API",
  });
}

function pageSchema(item: string) {
  return {
    type: "object",
    required: ["items", "page", "pageSize", "total", "totalPages"],
    properties: {
      items: { type: "array", items: { $ref: `#/components/schemas/${item}` } },
      page: { type: "integer", minimum: 1 },
      pageSize: { type: "integer", minimum: 1, maximum: 100 },
      total: { type: "integer", minimum: 0 },
      totalPages: { type: "integer", minimum: 0 },
    },
  };
}

function responseSchema(
  path: string,
  operationId: string,
): Record<string, unknown> {
  if (path.endsWith("/auth/session"))
    return { $ref: "#/components/schemas/Session" };
  if (path.includes("/inventory/")) {
    if (path.endsWith("/movements")) {
      return operationId.includes("list")
        ? { $ref: "#/components/schemas/PageInventoryMovement" }
        : { $ref: "#/components/schemas/InventoryMovement" };
    }
    if (path.endsWith("/reversal") || path.endsWith("/adjustments")) {
      return { $ref: "#/components/schemas/InventoryMovement" };
    }
    if (path.endsWith("/reviews")) {
      return { $ref: "#/components/schemas/InventoryReview" };
    }
    if (path.endsWith("/component-changes")) {
      return { $ref: "#/components/schemas/RastraComponentChange" };
    }
    return operationId.includes("list")
      ? { $ref: "#/components/schemas/PageInventoryCatalog" }
      : { $ref: "#/components/schemas/InventoryCatalogItem" };
  }
  if (path.endsWith("/management/operation-lines"))
    return { $ref: "#/components/schemas/PageManagementOperationLine" };
  if (path.endsWith("/management/freshness"))
    return { $ref: "#/components/schemas/ManagementFreshness" };
  if (path.endsWith("/management/attendance/hours"))
    return { $ref: "#/components/schemas/AttendanceHours" };
  if (path.endsWith("/management/gold-summary"))
    return { $ref: "#/components/schemas/GoldSummary" };
  if (path.endsWith("/gold-results"))
    return operationId.includes("history")
      ? {
          type: "array",
          items: { $ref: "#/components/schemas/GoldResultEntry" },
        }
      : { $ref: "#/components/schemas/GoldResultEntry" };
  if (path.endsWith("/management/shipments"))
    return { $ref: "#/components/schemas/PageManagementShipment" };
  if (path.endsWith("/sweeps") && path.includes("/management/shipments/"))
    return { $ref: "#/components/schemas/PageManagementSweepMercury" };
  if (path.includes("/management/shipments/"))
    return { $ref: "#/components/schemas/ManagementShipment" };
  if (operationId.includes("list") && path.includes("/accounts"))
    return { $ref: "#/components/schemas/PageAccount" };
  if (operationId.includes("list") && path.endsWith("/workers"))
    return { $ref: "#/components/schemas/PageWorker" };
  if (operationId.includes("list") && !path.includes("worker-requests"))
    return { $ref: "#/components/schemas/PageCatalog" };
  if (path.endsWith("/permissions"))
    return {
      type: "array",
      items: { $ref: "#/components/schemas/AdministratorPermission" },
    };
  if (path.includes("/accounts") || path.endsWith("/profile/locale"))
    return { $ref: "#/components/schemas/Account" };
  if (path.includes("worker")) return { $ref: "#/components/schemas/Worker" };
  return { type: "object" };
}
