import { HttpStatus, Inject, Injectable } from "@nestjs/common";

import {
  MANAGEMENT_QUERY_REPOSITORY,
  type ManagementFilters,
  type ManagementPageQuery,
  type ManagementQueryRepository,
} from "./management.contracts";
import { ApplicationError } from "../common/errors/application-error";

@Injectable()
export class ManagementService {
  constructor(
    @Inject(MANAGEMENT_QUERY_REPOSITORY)
    private readonly repository: ManagementQueryRepository,
  ) {}

  listOperationLines(organizationId: string, query: ManagementFilters) {
    this.validateDateRange(query);
    return this.repository.listOperationLines(organizationId, query);
  }

  listShipments(organizationId: string, query: ManagementFilters) {
    this.validateDateRange(query);
    return this.repository.listShipments(organizationId, query);
  }

  async findShipment(organizationId: string, shipmentId: string) {
    const shipment = await this.repository.findShipment(
      organizationId,
      shipmentId,
    );
    if (shipment === null) {
      throw new ApplicationError(
        HttpStatus.NOT_FOUND,
        "MANAGEMENT_SHIPMENT_NOT_FOUND",
        "Management shipment was not found",
      );
    }
    return shipment;
  }

  async listShipmentSweeps(
    organizationId: string,
    shipmentId: string,
    query: ManagementPageQuery,
  ) {
    await this.findShipment(organizationId, shipmentId);
    return this.repository.listShipmentSweeps(
      organizationId,
      shipmentId,
      query,
    );
  }

  private validateDateRange(query: ManagementFilters): void {
    if (
      query.fromUtc !== undefined &&
      query.toUtc !== undefined &&
      Date.parse(query.fromUtc) >= Date.parse(query.toUtc)
    ) {
      throw new ApplicationError(
        HttpStatus.BAD_REQUEST,
        "INVALID_MANAGEMENT_DATE_RANGE",
        "fromUtc must be earlier than toUtc",
      );
    }
  }
}
