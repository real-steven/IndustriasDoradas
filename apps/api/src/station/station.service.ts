import {
  ForbiddenException,
  HttpStatus,
  Inject,
  Injectable,
} from "@nestjs/common";

import { PinVerifierService } from "./pin-verifier.service";
import {
  STATION_REPOSITORY,
  type StationRepository,
} from "./station.contracts";
import { AUDIT_ACTIONS, type AuditActor } from "../audit/audit.contracts";
import { AuditTrailService } from "../audit/audit-trail.service";
import type { AuthenticatedContext } from "../auth/auth.contracts";
import { ApplicationError } from "../common/errors/application-error";

@Injectable()
export class StationService {
  constructor(
    @Inject(STATION_REPOSITORY) private readonly repository: StationRepository,
    private readonly pinVerifier: PinVerifierService,
    private readonly audit: AuditTrailService,
  ) {}

  async snapshot(
    organizationId: string,
    stationId: string,
    auth: AuthenticatedContext,
  ) {
    const snapshot = await this.repository.getSnapshot({
      organizationId,
      stationId,
      profileId: auth.profile.id,
      observedAt: new Date().toISOString(),
    });
    if (snapshot === null)
      throw new ForbiddenException("Station authorization is not active");
    return snapshot;
  }

  async elevate(
    organizationId: string,
    stationId: string,
    pin: string,
    auth: AuthenticatedContext,
    correlationId: string,
  ) {
    const snapshot = await this.snapshot(organizationId, stationId, auth);
    const succeeded = await this.pinVerifier.verify(pin, snapshot.pinVerifier);
    const result = await this.repository.recordPinAttempt({
      organizationId,
      profileId: auth.profile.id,
      succeeded,
      observedAt: new Date().toISOString(),
    });
    await this.audit.record({
      correlationId,
      organizationId,
      stationId,
      actor: this.actor(auth),
      origin: "DESKTOP",
      action: AUDIT_ACTIONS.PRIVILEGE_ELEVATION,
      entityType: "station_session",
      result: result.result === "ACCEPTED" ? "SUCCEEDED" : "REJECTED",
      reasonCode:
        result.result === "ACCEPTED" ? undefined : `PIN_${result.result}`,
      evidenceState: "ABSENT",
    });
    return result;
  }

  async setPin(
    pin: string,
    auth: AuthenticatedContext,
  ): Promise<{ configured: true }> {
    this.requireRecentAuthentication(auth);
    const verifier = await this.pinVerifier.create(pin);
    await this.repository.setPinVerifier({
      organizationId: auth.profile.organizationId,
      profileId: auth.profile.id,
      verifier,
      observedAt: new Date().toISOString(),
    });
    return { configured: true };
  }

  async resetBlocks(auth: AuthenticatedContext): Promise<{ reset: true }> {
    this.requireRecentAuthentication(auth);
    await this.repository.resetPinBlocks(
      auth.profile.organizationId,
      auth.profile.id,
      new Date().toISOString(),
    );
    return { reset: true };
  }

  private requireRecentAuthentication(auth: AuthenticatedContext): void {
    if (Date.now() / 1000 - auth.token.issuedAt > 5 * 60) {
      throw new ApplicationError(
        HttpStatus.FORBIDDEN,
        "RECENT_AUTHENTICATION_REQUIRED",
        "Sign in again before changing or resetting the PIN",
      );
    }
  }

  private actor(auth: AuthenticatedContext): AuditActor {
    return {
      kind: "AUTHENTICATED_USER",
      profileId: auth.profile.id,
      authUserId: auth.profile.authUserId,
      displayName: auth.profile.displayName,
      roleCode: auth.profile.role.code,
    };
  }
}
