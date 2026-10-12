import { HttpStatus } from "@nestjs/common";

import type { ManagementQueryRepository } from "./management.contracts";
import { ManagementService } from "./management.service";

describe("ManagementService", () => {
  let repository: jest.Mocked<ManagementQueryRepository>;
  let service: ManagementService;

  beforeEach(() => {
    repository = {
      listOperationLines: jest.fn(),
      listShipments: jest.fn(),
      findShipment: jest.fn(),
      listShipmentSweeps: jest.fn(),
    };
    service = new ManagementService(repository);
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
