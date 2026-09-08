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
    Worker: {
      type: "object",
      required: [
        "id",
        "organizationId",
        "plantId",
        "sourceRequestId",
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
    PageCatalog: pageSchema("CatalogItem"),
    PageWorker: pageSchema("Worker"),
    PageAccount: pageSchema("Account"),
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
