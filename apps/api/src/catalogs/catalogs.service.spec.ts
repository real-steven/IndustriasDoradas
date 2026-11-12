import { HttpStatus } from "@nestjs/common";

import type { CatalogItem, CatalogRepository } from "./catalogs.contracts";
import { CatalogsService } from "./catalogs.service";
import type {
  AuditEventRecord,
  AuditEventRepository,
} from "../audit/audit.contracts";
import { AuditTrailService } from "../audit/audit-trail.service";
import type { AuthenticatedContext } from "../auth/auth.contracts";

describe("CatalogsService suppliers", () => {
  let repository: jest.Mocked<CatalogRepository>;
  let auditEvents: jest.Mocked<AuditEventRepository>;
  let service: CatalogsService;

  beforeEach(() => {
    repository = {
      list: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      setActive: jest.fn(),
      listComponentTypes: jest.fn(),
    };
    auditEvents = { insert: jest.fn().mockResolvedValue(undefined) };
    service = new CatalogsService(
      repository,
      new AuditTrailService(auditEvents),
    );
  });

  it("suspends a supplier and audits the state change with its reason", async () => {
    repository.findById.mockResolvedValue(supplier("Minera El Roble"));
    repository.setActive.mockResolvedValue({
      ...supplier("Minera El Roble"),
      isActive: false,
      deactivatedAt: "2026-11-11T12:00:00.000Z",
    });

    const result = await service.setActive(
      "suppliers",
      ORGANIZATION_ID,
      SUPPLIER_ID,
      false,
      CONTEXT,
      "  Dejó de entregar material  ",
    );

    expect(result.isActive).toBe(false);
    expect(repository.setActive.mock.calls).toEqual([
      ["suppliers", ORGANIZATION_ID, SUPPLIER_ID, false],
    ]);
    const event = lastAuditEvent();
    expect(event).toMatchObject({
      entityType: "supplier",
      entityId: SUPPLIER_ID,
      result: "SUCCEEDED",
      actor: { displayName: "Lucía ficticia", roleCode: "JEFE_EMPRESA" },
      changes: {
        is_active: { before: true, after: false },
        supplier_name: { before: null, after: "Minera El Roble" },
        reason: { before: null, after: "Dejó de entregar material" },
      },
    });
  });

  it("requires a reason before suspending a supplier", async () => {
    repository.findById.mockResolvedValue(supplier("Minera El Roble"));

    await expect(
      service.setActive(
        "suppliers",
        ORGANIZATION_ID,
        SUPPLIER_ID,
        false,
        CONTEXT,
        "   ",
      ),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      response: { code: "SUPPLIER_REASON_REQUIRED" },
    });
    expect(repository.setActive.mock.calls).toHaveLength(0);
  });

  it("reactivates a suspended supplier without requiring a reason", async () => {
    repository.findById.mockResolvedValue({
      ...supplier("Minera El Roble"),
      isActive: false,
      deactivatedAt: "2026-11-10T12:00:00.000Z",
    });
    repository.setActive.mockResolvedValue(supplier("Minera El Roble"));

    await service.setActive(
      "suppliers",
      ORGANIZATION_ID,
      SUPPLIER_ID,
      true,
      CONTEXT,
    );

    expect(lastAuditEvent()?.changes).toEqual({
      is_active: { before: false, after: true },
      supplier_name: { before: null, after: "Minera El Roble" },
    });
  });

  it("never suspends the default own-material supplier", async () => {
    repository.findById.mockResolvedValue(supplier("Material propio"));

    await expect(
      service.setActive(
        "suppliers",
        ORGANIZATION_ID,
        SUPPLIER_ID,
        false,
        CONTEXT,
        "Prueba",
      ),
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      response: { code: "SUPPLIER_DEFAULT_PROTECTED" },
    });
    expect(repository.setActive.mock.calls).toHaveLength(0);
  });

  it("never renames the default own-material supplier", async () => {
    repository.findById.mockResolvedValue(supplier("Material propio"));

    await expect(
      service.update(
        "suppliers",
        ORGANIZATION_ID,
        SUPPLIER_ID,
        { name: "Material de la empresa" },
        CONTEXT,
      ),
    ).rejects.toMatchObject({
      response: { code: "SUPPLIER_DEFAULT_PROTECTED" },
    });
    expect(repository.update.mock.calls).toHaveLength(0);
  });

  it("still updates the default supplier contact details", async () => {
    repository.findById.mockResolvedValue(supplier("Material propio"));
    repository.update.mockResolvedValue({
      ...supplier("Material propio"),
      phone: "2222-0000",
    });

    await service.update(
      "suppliers",
      ORGANIZATION_ID,
      SUPPLIER_ID,
      { name: "Material propio", phone: "2222-0000" },
      CONTEXT,
    );

    expect(lastAuditEvent()?.changes).toEqual({
      name: { before: "Material propio", after: "Material propio" },
      phone: { before: null, after: "2222-0000" },
    });
  });

  it("audits supplier edits with previous and new values", async () => {
    repository.findById.mockResolvedValue(supplier("Minera El Roble"));
    repository.update.mockResolvedValue({
      ...supplier("Minera Roble Norte"),
      email: "contacto@roble.example",
    });

    await service.update(
      "suppliers",
      ORGANIZATION_ID,
      SUPPLIER_ID,
      { name: "Minera Roble Norte", email: "contacto@roble.example" },
      CONTEXT,
    );

    expect(lastAuditEvent()?.changes).toEqual({
      name: { before: "Minera El Roble", after: "Minera Roble Norte" },
      email: { before: null, after: "contacto@roble.example" },
    });
  });

  function lastAuditEvent(): AuditEventRecord | undefined {
    return auditEvents.insert.mock.calls.at(-1)?.[0];
  }
});

const ORGANIZATION_ID = "30000000-0000-4000-8000-000000000001";
const SUPPLIER_ID = "35000000-0000-4000-8000-000000000010";

function supplier(name: string): CatalogItem {
  return {
    id: SUPPLIER_ID,
    organizationId: ORGANIZATION_ID,
    name,
    isActive: true,
    deactivatedAt: null,
    email: null,
    phone: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  };
}

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
    permissions: ["organization_catalogs.read", "suppliers.manage"],
  },
};

const CONTEXT = {
  auth: AUTH,
  correlationId: "40000000-0000-4000-8000-000000000001",
};
