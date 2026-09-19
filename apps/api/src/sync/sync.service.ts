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
import { normalizeSyncItem } from "./sync-normalization";
import type { AuthenticatedContext } from "../auth/auth.contracts";
import { ApplicationError } from "../common/errors/application-error";

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
}
