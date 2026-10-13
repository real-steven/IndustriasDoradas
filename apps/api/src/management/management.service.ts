import { HttpStatus, Inject, Injectable } from "@nestjs/common";

import {
  MANAGEMENT_QUERY_REPOSITORY,
  type ManagementFreshness,
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

  async freshness(
    organizationId: string,
    cursor?: string,
  ): Promise<ManagementFreshness> {
    const requestedSequence = this.decodeCursor(cursor);
    const latest = await this.repository.findLatestChange(organizationId);
    const latestSequence = BigInt(latest?.serverSequence ?? "0");
    return {
      cursor: this.encodeCursor(latestSequence),
      hasChanges:
        requestedSequence !== null && latestSequence > requestedSequence,
      effectiveAtUtc: latest?.changedAtUtc ?? null,
      serverTimeUtc: new Date().toISOString(),
      pollAfterSeconds: 30,
    };
  }

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

  private decodeCursor(cursor: string | undefined): bigint | null {
    if (cursor === undefined) return null;
    try {
      const decoded = Buffer.from(cursor, "base64url").toString("utf8");
      const match = /^v1:(\d+)$/u.exec(decoded);
      if (match?.[1] === undefined) throw new Error();
      return BigInt(match[1]);
    } catch {
      throw new ApplicationError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "INVALID_MANAGEMENT_CURSOR",
        "Management freshness cursor is invalid",
      );
    }
  }

  private encodeCursor(sequence: bigint): string {
    return Buffer.from(`v1:${sequence}`, "utf8").toString("base64url");
  }
}
