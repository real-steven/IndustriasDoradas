import { HttpStatus, Inject, Injectable } from "@nestjs/common";

import {
  MANAGEMENT_QUERY_REPOSITORY,
  type ManagementFreshness,
  type ManagementFilters,
  type ManagementPageQuery,
  type ManagementQueryRepository,
  type ManagementStatisticsBreakdown,
  type ManagementStatisticsDailyFact,
  type ManagementStatisticsMetrics,
  type ManagementStatisticsPoint,
  type ManagementStatisticsQuery,
  type ManagementStatisticsResponse,
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

  async statistics(
    organizationId: string,
    query: ManagementStatisticsQuery,
  ): Promise<ManagementStatisticsResponse> {
    this.validateDateRange(query);
    const rangeMilliseconds =
      Date.parse(query.toUtc) - Date.parse(query.fromUtc);
    if (rangeMilliseconds > 366 * 5 * 24 * 60 * 60 * 1000) {
      throw new ApplicationError(
        HttpStatus.BAD_REQUEST,
        "MANAGEMENT_STATISTICS_RANGE_TOO_LARGE",
        "Statistics date range cannot exceed five years",
      );
    }

    const factQuery = {
      fromUtc: query.fromUtc,
      toUtc: query.toUtc,
      plantId: query.plantId,
      productionLineId: query.productionLineId,
      supplierId: query.supplierId,
    };
    const previousToUtc = new Date(Date.parse(query.fromUtc)).toISOString();
    const previousFromUtc = new Date(
      Date.parse(query.fromUtc) - rangeMilliseconds,
    ).toISOString();
    const [facts, previousFacts] = await Promise.all([
      this.repository.listStatisticsFacts(organizationId, factQuery),
      query.comparePrevious
        ? this.repository.listStatisticsFacts(organizationId, {
            ...factQuery,
            fromUtc: previousFromUtc,
            toUtc: previousToUtc,
          })
        : Promise.resolve([]),
    ]);

    return {
      generatedAtUtc: new Date().toISOString(),
      period: {
        fromUtc: query.fromUtc,
        toUtc: query.toUtc,
        bucket: query.bucket,
      },
      summary: this.metrics(facts),
      previousSummary: query.comparePrevious
        ? this.metrics(previousFacts)
        : null,
      timeline: this.timeline(facts, query.bucket, query.fromUtc, query.toUtc),
      previousTimeline: query.comparePrevious
        ? this.timeline(
            previousFacts,
            query.bucket,
            previousFromUtc,
            previousToUtc,
          )
        : [],
      productionLines: this.breakdown(facts, "line"),
      suppliers: this.breakdown(facts, "supplier"),
    };
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

  private metrics(
    facts: ManagementStatisticsDailyFact[],
  ): ManagementStatisticsMetrics {
    const total = facts.reduce(
      (result, fact) => ({
        completedShipments: result.completedShipments + fact.completedShipments,
        totalCajuelas: result.totalCajuelas + fact.totalCajuelas,
        sweepCount: result.sweepCount + fact.sweepCount,
        goldShipments: result.goldShipments + fact.goldShipments,
        totalGoldGrams: result.totalGoldGrams + fact.goldGrams,
        includedCajuelas: result.includedCajuelas + fact.goldCajuelas,
        durationSeconds: result.durationSeconds + fact.durationSeconds,
      }),
      {
        completedShipments: 0,
        totalCajuelas: 0,
        sweepCount: 0,
        goldShipments: 0,
        totalGoldGrams: 0,
        includedCajuelas: 0,
        durationSeconds: 0,
      },
    );
    return {
      completedShipments: total.completedShipments,
      totalCajuelas: total.totalCajuelas,
      sweepCount: total.sweepCount,
      goldShipments: total.goldShipments,
      totalGoldGrams: this.round(total.totalGoldGrams, 2),
      includedCajuelas: total.includedCajuelas,
      gramsPerCajuela:
        total.includedCajuelas === 0
          ? null
          : this.round(total.totalGoldGrams / total.includedCajuelas, 4),
      goldCoveragePercentage:
        total.completedShipments === 0
          ? 0
          : this.round(
              (total.goldShipments / total.completedShipments) * 100,
              2,
            ),
      averageShipmentHours:
        total.completedShipments === 0
          ? null
          : this.round(
              total.durationSeconds / total.completedShipments / 3600,
              2,
            ),
    };
  }

  private timeline(
    facts: ManagementStatisticsDailyFact[],
    bucket: ManagementStatisticsQuery["bucket"],
    fromUtc: string,
    toUtc: string,
  ): ManagementStatisticsPoint[] {
    const groups = new Map<string, ManagementStatisticsDailyFact[]>();
    for (const fact of facts) {
      const key = this.bucketStart(fact.localDate, bucket);
      groups.set(key, [...(groups.get(key) ?? []), fact]);
    }
    const points: ManagementStatisticsPoint[] = [];
    const firstBucket = this.bucketStart(this.costaRicaDate(fromUtc), bucket);
    const exclusiveEnd = this.costaRicaDate(toUtc);
    const cursor = new Date(`${firstBucket}T00:00:00.000Z`);
    while (cursor.toISOString().slice(0, 10) < exclusiveEnd) {
      const bucketStart = cursor.toISOString().slice(0, 10);
      points.push({
        bucketStart,
        ...this.metrics(groups.get(bucketStart) ?? []),
      });
      if (bucket === "month") cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      else cursor.setUTCDate(cursor.getUTCDate() + (bucket === "week" ? 7 : 1));
    }
    return points;
  }

  private breakdown(
    facts: ManagementStatisticsDailyFact[],
    dimension: "line" | "supplier",
  ): ManagementStatisticsBreakdown[] {
    const groups = new Map<
      string,
      {
        name: string;
        displayOrder?: number;
        facts: ManagementStatisticsDailyFact[];
      }
    >();
    for (const fact of facts) {
      const id = dimension === "line" ? fact.productionLineId : fact.supplierId;
      const current = groups.get(id);
      groups.set(id, {
        name:
          dimension === "line" ? fact.productionLineName : fact.supplierName,
        ...(dimension === "line"
          ? { displayOrder: fact.productionLineOrder }
          : {}),
        facts: [...(current?.facts ?? []), fact],
      });
    }
    return [...groups.entries()]
      .map(([id, group]) => ({
        id,
        name: group.name,
        ...(group.displayOrder === undefined
          ? {}
          : { displayOrder: group.displayOrder }),
        ...this.metrics(group.facts),
      }))
      .sort((left, right) =>
        dimension === "line"
          ? (left.displayOrder ?? 0) - (right.displayOrder ?? 0)
          : right.totalCajuelas - left.totalCajuelas ||
            left.name.localeCompare(right.name),
      );
  }

  private bucketStart(
    localDate: string,
    bucket: ManagementStatisticsQuery["bucket"],
  ): string {
    if (bucket === "day") return localDate;
    if (bucket === "month") return `${localDate.slice(0, 7)}-01`;
    const date = new Date(`${localDate}T00:00:00.000Z`);
    const daysSinceMonday = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - daysSinceMonday);
    return date.toISOString().slice(0, 10);
  }

  private round(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  private costaRicaDate(value: string): string {
    const parts = new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      month: "2-digit",
      timeZone: "America/Costa_Rica",
      year: "numeric",
    }).formatToParts(new Date(value));
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((candidate) => candidate.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}`;
  }

  private validateDateRange(
    query: Pick<ManagementFilters, "fromUtc" | "toUtc">,
  ): void {
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
