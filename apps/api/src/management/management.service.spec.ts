import { HttpStatus } from "@nestjs/common";

import type { ManagementQueryRepository } from "./management.contracts";
import { ManagementService } from "./management.service";

describe("ManagementService", () => {
  let repository: jest.Mocked<ManagementQueryRepository>;
  let service: ManagementService;

  beforeEach(() => {
    repository = {
      findLatestChange: jest.fn(),
      listOperationLines: jest.fn(),
      listShipments: jest.fn(),
      findShipment: jest.fn(),
      listShipmentSweeps: jest.fn(),
    };
    service = new ManagementService(repository);
  });

  it("establishes a cursor and only reports a later central change", async () => {
    repository.findLatestChange.mockResolvedValue({
      serverSequence: "9007199254740993",
      changedAtUtc: "2026-10-13T06:00:00.000Z",
    });

    const baseline = await service.freshness("organization-id");
    const changed = await service.freshness(
      "organization-id",
      Buffer.from("v1:9007199254740992", "utf8").toString("base64url"),
    );

    expect(baseline).toMatchObject({
      hasChanges: false,
      effectiveAtUtc: "2026-10-13T06:00:00.000Z",
      pollAfterSeconds: 30,
    });
    expect(changed).toMatchObject({
      cursor: baseline.cursor,
      hasChanges: true,
    });
  });

  it("rejects a malformed freshness cursor", async () => {
    await expect(
      service.freshness("organization-id", "not-a-cursor"),
    ).rejects.toMatchObject({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      response: { code: "INVALID_MANAGEMENT_CURSOR" },
    });
    expect(repository.findLatestChange.mock.calls).toHaveLength(0);
  });

  it("rejects an empty or reversed half-open date range", async () => {
    const result = Promise.resolve().then(() =>
      service.listShipments("organization-id", {
        page: 1,
        pageSize: 20,
        fromUtc: "2026-10-02T00:00:00.000Z",
        toUtc: "2026-10-01T00:00:00.000Z",
      }),
    );

    await expect(result).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      response: {
        code: "INVALID_MANAGEMENT_DATE_RANGE",
      },
    });
    expect(repository.listShipments.mock.calls).toHaveLength(0);
  });

  it("returns a stable not-found error before querying shipment sweeps", async () => {
    repository.findShipment.mockResolvedValue(null);

    await expect(
      service.listShipmentSweeps("organization-id", "shipment-id", {
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
      response: {
        code: "MANAGEMENT_SHIPMENT_NOT_FOUND",
      },
    });
    expect(repository.listShipmentSweeps.mock.calls).toHaveLength(0);
  });
});
