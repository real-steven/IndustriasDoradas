import { BadRequestException } from "@nestjs/common";

import { AUDIT_ACTIONS, type AuditEventRepository } from "./audit.contracts";
import { AuditTrailService } from "./audit-trail.service";

const CORRELATION_ID = "a9000000-0000-4000-8000-000000000001";

describe("AuditTrailService", () => {
  let repository: jest.Mocked<AuditEventRepository>;
  let service: AuditTrailService;

  beforeEach(() => {
    repository = { insert: jest.fn().mockResolvedValue(undefined) };
    service = new AuditTrailService(repository);
  });

  it("stores only explicitly allowlisted scalar changes", async () => {
    await service.record({
      correlationId: CORRELATION_ID,
      actor: { kind: "SYSTEM" },
      origin: "SYSTEM",
      action: AUDIT_ACTIONS.ACCOUNT_GOVERNANCE,
      entityType: "user_profile",
      result: "SUCCEEDED",
      allowedChangeFields: ["account_status"],
      changes: {
        account_status: { before: "PENDING_APPROVAL", after: "ACTIVE" },
      },
    });

    expect(repository.insert.mock.calls).toHaveLength(1);
    expect(repository.insert.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        changedFields: ["account_status"],
        changes: {
          account_status: { before: "PENDING_APPROVAL", after: "ACTIVE" },
        },
      }),
    );
  });

  it.each(["password", "pin_hash", "access_token", "photo_url"])(
    "rejects sensitive audit field %s",
    async (field) => {
      await expect(
        service.record({
          correlationId: CORRELATION_ID,
          actor: { kind: "SYSTEM" },
          origin: "SYSTEM",
          action: AUDIT_ACTIONS.BUSINESS_MUTATION,
          entityType: "test_entity",
          result: "SUCCEEDED",
          allowedChangeFields: [field],
          changes: { [field]: { before: null, after: "forbidden" } },
        }),
      ).rejects.toThrow("Sensitive fields are forbidden");
      expect(repository.insert.mock.calls).toHaveLength(0);
    },
  );

  it("rejects a change that was not allowlisted", async () => {
    await expect(
      service.record({
        correlationId: CORRELATION_ID,
        actor: { kind: "SYSTEM" },
        origin: "SYSTEM",
        action: AUDIT_ACTIONS.BUSINESS_MUTATION,
        entityType: "test_entity",
        result: "SUCCEEDED",
        changes: { status: { before: "A", after: "B" } },
      }),
    ).rejects.toThrow("Audit field is not allowlisted");
  });

  it("does not leave a false success event when the business operation fails", async () => {
    const businessError = new BadRequestException(
      "Fictitious business failure",
    );

    await expect(
      service.execute(
        {
          correlationId: CORRELATION_ID,
          actor: { kind: "SYSTEM" },
          origin: "SYSTEM",
          action: AUDIT_ACTIONS.BUSINESS_MUTATION,
          entityType: "test_entity",
          failureResult: "REJECTED",
          failureReasonCode: "BUSINESS_RULE_REJECTED",
        },
        () => Promise.reject(businessError),
      ),
    ).rejects.toBe(businessError);

    expect(repository.insert.mock.calls).toHaveLength(1);
    expect(repository.insert.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        result: "REJECTED",
        reasonCode: "BUSINESS_RULE_REJECTED",
        changes: {},
      }),
    );
    expect(
      repository.insert.mock.calls.some(
        ([event]) => event.result === "SUCCEEDED",
      ),
    ).toBe(false);
  });

  it("does not misclassify an audit storage failure as a business rejection", async () => {
    const auditError = new Error("Fictitious audit storage failure");
    repository.insert.mockRejectedValueOnce(auditError);

    await expect(
      service.execute(
        {
          correlationId: CORRELATION_ID,
          actor: { kind: "SYSTEM" },
          origin: "SYSTEM",
          action: AUDIT_ACTIONS.BUSINESS_MUTATION,
          entityType: "test_entity",
          failureResult: "REJECTED",
          failureReasonCode: "BUSINESS_RULE_REJECTED",
        },
        () => Promise.resolve("completed"),
      ),
    ).rejects.toBe(auditError);

    expect(repository.insert.mock.calls).toHaveLength(1);
    expect(repository.insert.mock.calls[0]?.[0].result).toBe("SUCCEEDED");
  });
});
