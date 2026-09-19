import { ForbiddenException } from "@nestjs/common";

import {
  SyncRepositoryError,
  type SyncItemResult,
  type SyncRepository,
} from "./sync.contracts";
import type { SyncPushDto } from "./sync.dto";
import { SyncService } from "./sync.service";
import type { AuthenticatedContext } from "../auth/auth.contracts";

describe("SyncService", () => {
  type IngestItemInput = Parameters<SyncRepository["ingestItem"]>[0];

  let repository: jest.Mocked<SyncRepository>;
  let service: SyncService;

  beforeEach(() => {
    const findActiveStationScope: jest.MockedFunction<
      SyncRepository["findActiveStationScope"]
    > = jest.fn().mockResolvedValue({ permissionVersion: 1 });
    const ingestItem: jest.MockedFunction<SyncRepository["ingestItem"]> = jest
      .fn()
      .mockImplementation((input: IngestItemInput) =>
        Promise.resolve({
          outboxMessageId: input.item.outboxMessageId,
          stationSequence: input.item.stationSequence,
          status: "APPLIED",
          receiptId: "49000000-0000-4000-8000-000000000001",
          code: "APPLIED",
          processedAtUtc: "2026-09-15T18:10:00.000Z",
        } satisfies SyncItemResult),
      );
    repository = {
      findActiveStationScope,
      ingestItem,
    };
    service = new SyncService(repository);
  });

  it("processes a mixed batch in station sequence order", async () => {
    const body = envelope();
    body.items = [
      { ...body.items[0]!, stationSequence: 2 },
      {
        ...body.items[0]!,
        outboxMessageId: "41000000-0000-4000-8000-000000000002",
        stationSequence: 1,
        payloadSchemaVersion: 99,
      },
    ];

    const response = await service.push(
      body.scope.organizationId,
      body.scope.stationId,
      body,
      auth(),
      "4a000000-0000-4000-8000-000000000001",
    );

    expect(
      repository.ingestItem.mock.calls.map(
        ([input]) => input.item.stationSequence,
      ),
    ).toEqual([1, 2]);
    expect(repository.ingestItem.mock.calls[0]?.[0].item.precheckCode).toBe(
      "UNSUPPORTED_PAYLOAD_SCHEMA",
    );
    expect(response.results).toHaveLength(2);
  });

  it("isolates a temporary repository failure to its item", async () => {
    repository.ingestItem.mockRejectedValueOnce(
      new SyncRepositoryError("HTTP_503"),
    );

    const body = envelope();
    const response = await service.push(
      body.scope.organizationId,
      body.scope.stationId,
      body,
      auth(),
      "4a000000-0000-4000-8000-000000000001",
    );

    expect(response.results[0]).toMatchObject({
      status: "RETRY_LATER",
      code: "SERVER_TEMPORARY_FAILURE",
    });
  });

  it("rejects a station without current authorization", async () => {
    repository.findActiveStationScope.mockResolvedValueOnce(null);
    const body = envelope();

    await expect(
      service.push(
        body.scope.organizationId,
        body.scope.stationId,
        body,
        auth(),
        "4a000000-0000-4000-8000-000000000001",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.ingestItem.mock.calls).toHaveLength(0);
  });

  it.each(["23505", "23503", "23514", "23502", "22P02", "22003"])(
    "does not retry a permanent database rejection (%s)",
    async (databaseCode) => {
      repository.ingestItem.mockRejectedValueOnce(
        new SyncRepositoryError(databaseCode),
      );
      const body = envelope();
      body.items.push({
        ...body.items[0]!,
        stationSequence: 2,
        outboxMessageId: "41000000-0000-4000-8000-000000000002",
      });
      const response = await service.push(
        body.scope.organizationId,
        body.scope.stationId,
        body,
        auth(),
        "4a000000-0000-4000-8000-000000000001",
      );
      expect(response.results[0]).toMatchObject({
        status: "FAILED_REVIEW",
        code: databaseCode.startsWith("23")
          ? "DATABASE_CONSTRAINT_VIOLATION"
          : "INVALID_EVENT",
      });
      expect(response.results[1]?.status).toBe("APPLIED");
    },
  );

  it.each(["40001", "40P01", "55P03", "NETWORK_ERROR", "HTTP_429", "HTTP_503"])(
    "keeps transient database or transport failures retryable (%s)",
    async (databaseCode) => {
      repository.ingestItem.mockRejectedValueOnce(
        new SyncRepositoryError(databaseCode),
      );
      const body = envelope();
      const response = await service.push(
        body.scope.organizationId,
        body.scope.stationId,
        body,
        auth(),
        "4a000000-0000-4000-8000-000000000001",
      );
      expect(response.results[0]).toMatchObject({
        status: "RETRY_LATER",
        code: "SERVER_TEMPORARY_FAILURE",
      });
    },
  );
});

function envelope(): SyncPushDto {
  const organizationId = "30000000-0000-4000-8000-000000000001";
  const plantId = "31000000-0000-4000-8000-000000000001";
  const stationId = "34000000-0000-4000-8000-000000000001";
  return {
    contractVersion: 1,
    batchId: "40000000-0000-4000-8000-000000000001",
    sentAtUtc: "2026-09-15T18:00:00.000Z",
    client: { application: "desktop", applicationVersion: "0.1.0" },
    scope: { organizationId, plantId, stationId },
    items: [
      {
        outboxMessageId: "41000000-0000-4000-8000-000000000001",
        stationSequence: 1,
        operationType: "OPERATION_STARTED",
        aggregateType: "shipment",
        aggregateId: "42000000-0000-4000-8000-000000000001",
        payloadSchemaVersion: 1,
        createdAtUtc: "2026-09-15T18:00:00.000Z",
        authorization: {
          actorProfileId: "a1000000-0000-4000-8000-000000000002",
          permissionVersion: 1,
          validatedAtUtc: "2026-09-15T17:00:00.000Z",
          offlineValidUntilUtc: "2026-09-16T17:00:00.000Z",
          stateAtCapture: "VALID",
        },
        payload: {
          schemaVersion: 1,
          shipmentId: "42000000-0000-4000-8000-000000000001",
          feedCycleId: "43000000-0000-4000-8000-000000000001",
          responsibilityAssignmentId: "44000000-0000-4000-8000-000000000001",
          organizationId,
          plantId,
          stationId,
          lineId: "32000000-0000-4000-8000-000000000001",
          supplierId: "35000000-0000-4000-8000-000000000001",
          responsibleWorkerId: "b1000000-0000-4000-8000-000000000001",
          actorProfileId: "a1000000-0000-4000-8000-000000000002",
          permissionVersion: 1,
          occurredAtUtc: "2026-09-15T18:00:00.000Z",
        },
      },
    ],
  };
}

function auth(): AuthenticatedContext {
  return {
    token: {
      subject: "a0000000-0000-4000-8000-000000000002",
      sessionId: "4b000000-0000-4000-8000-000000000001",
      email: "plant@example.invalid",
      issuedAt: 1,
      expiresAt: 2,
    },
    profile: {
      id: "a1000000-0000-4000-8000-000000000002",
      organizationId: "30000000-0000-4000-8000-000000000001",
      authUserId: "a0000000-0000-4000-8000-000000000002",
      displayName: "Jefe de planta ficticio",
      preferredLocale: "es",
      accountStatus: "ACTIVE",
      isActive: true,
      role: {
        id: "20000000-0000-4000-8000-000000000003",
        code: "JEFE_PLANTA",
        isActive: true,
      },
      permissions: ["stations.open"],
    },
  };
}
