import {
  ForbiddenException,
  HttpStatus,
  Inject,
  Injectable,
} from "@nestjs/common";

import {
  SYNC_REPOSITORY,
  SyncRepositoryError,
  type SyncItemResult,
  type SyncRepository,
} from "./sync.contracts";
import type { SyncPushDto } from "./sync.dto";
import type { SyncPullQueryDto } from "./sync.dto";
import { normalizeSyncItem } from "./sync-normalization";
import type { AuthenticatedContext } from "../auth/auth.contracts";
import { ApplicationError } from "../common/errors/application-error";
import { concatMap, filter, map, type Observable, take, timer } from "rxjs";

@Injectable()
export class SyncService {
  constructor(
    @Inject(SYNC_REPOSITORY) private readonly repository: SyncRepository,
  ) {}

  async push(
    organizationId: string,
    stationId: string,
    body: SyncPushDto,
    auth: AuthenticatedContext,
    correlationId: string,
  ) {
    if (body.contractVersion !== 1) {
      throw new ApplicationError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "UNSUPPORTED_CONTRACT_VERSION",
        "Sync contract version is not supported",
      );
    }
    if (
      body.scope.organizationId !== organizationId ||
      body.scope.stationId !== stationId
    ) {
      throw new ApplicationError(
        HttpStatus.BAD_REQUEST,
        "INVALID_ENVELOPE",
        "Envelope scope does not match the request path",
      );
    }

    const scope = await this.repository.findActiveStationScope({
      organizationId,
      plantId: body.scope.plantId,
      stationId,
      profileId: auth.profile.id,
    });
    if (scope === null) {
      throw new ForbiddenException("Station authorization is not active");
    }

    const serverReceivedAtUtc = new Date().toISOString();
    const results: SyncItemResult[] = [];
    for (const rawItem of [...body.items].sort(
      (left, right) => left.stationSequence - right.stationSequence,
    )) {
      const item = normalizeSyncItem(rawItem, body.scope);
      try {
        results.push(
          await this.repository.ingestItem({
            organizationId,
            plantId: body.scope.plantId,
            stationId,
            correlationId,
            item,
          }),
        );
      } catch (error) {
        if (!(error instanceof SyncRepositoryError)) throw error;
        // SQLSTATE class 22: invalid data; class 23: integrity violation.
        // Retrying an unchanged item cannot repair either. Never expose SQL details.
        const permanentCode = /^23[0-9A-Z]{3}$/u.test(error.databaseCode)
          ? "DATABASE_CONSTRAINT_VIOLATION"
          : /^22[0-9A-Z]{3}$/u.test(error.databaseCode)
            ? "INVALID_EVENT"
            : null;
        results.push({
          outboxMessageId: item.outboxMessageId,
          stationSequence: item.stationSequence,
          status: permanentCode === null ? "RETRY_LATER" : "FAILED_REVIEW",
          code: permanentCode ?? "SERVER_TEMPORARY_FAILURE",
          processedAtUtc: new Date().toISOString(),
        });
      }
    }

    return {
      contractVersion: 1,
      batchId: body.batchId,
      serverReceivedAtUtc,
      serverCompletedAtUtc: new Date().toISOString(),
      results,
    };
  }

  async pull(
    organizationId: string,
    stationId: string,
    query: SyncPullQueryDto,
    auth: AuthenticatedContext,
  ) {
    const requestedCursor = query.cursor ?? null;
    const afterSequence = this.decodeCursor(requestedCursor);
    const scope = await this.repository.findActivePullScope({
      organizationId,
      stationId,
      profileId: auth.profile.id,
    });
    if (scope?.plantId === undefined) {
      throw new ForbiddenException("Station authorization is not active");
    }
    const rows = await this.repository.listChanges({
      organizationId,
      plantId: scope.plantId,
      stationId,
      afterSequence,
      limit: query.limit + 1,
    });
    const hasMore = rows.length > query.limit;
    const changes = rows.slice(0, query.limit);
    const nextSequence = changes.at(-1)?.serverSequence ?? afterSequence;
    return {
      contractVersion: 1,
      requestedCursor,
      nextCursor: this.encodeCursor(nextSequence),
      hasMore,
      serverTimeUtc: new Date().toISOString(),
      changes,
    };
  }

  async signal(
    organizationId: string,
    stationId: string,
    query: SyncPullQueryDto,
    auth: AuthenticatedContext,
  ): Promise<Observable<{ data: { type: string } }>> {
    const afterSequence = this.decodeCursor(query.cursor ?? null);
    const scope = await this.repository.findActivePullScope({
      organizationId,
      stationId,
      profileId: auth.profile.id,
    });
    if (scope?.plantId === undefined) {
      throw new ForbiddenException("Station authorization is not active");
    }
    return timer(0, 2000).pipe(
      concatMap(() =>
        this.repository.listChanges({
          organizationId,
          plantId: scope.plantId!,
          stationId,
          afterSequence,
          limit: 1,
        }),
      ),
      filter((changes) => changes.length > 0),
      take(1),
      map(() => ({ data: { type: "changes_available" } })),
    );
  }

  private decodeCursor(cursor: string | null): number {
    if (cursor === null) return 0;
    try {
      const decoded = Buffer.from(cursor, "base64url").toString("utf8");
      const match = /^v1:(\d+)$/u.exec(decoded);
      const sequence = match === null ? Number.NaN : Number(match[1]);
      if (!Number.isSafeInteger(sequence) || sequence < 0) throw new Error();
      return sequence;
    } catch {
      throw new ApplicationError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "INVALID_SYNC_CURSOR",
        "Sync cursor is invalid",
      );
    }
  }

  private encodeCursor(sequence: number): string {
    return Buffer.from(`v1:${sequence}`, "utf8").toString("base64url");
  }
}
