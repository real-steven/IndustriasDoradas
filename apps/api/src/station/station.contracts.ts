export const STATION_REPOSITORY = Symbol("STATION_REPOSITORY");

export interface StationSnapshot {
  stationId: string;
  plantId: string;
  organizationId: string;
  stationName: string;
  permissionVersion: number;
  pinVerifier: string;
  validatedAt: string;
  offlineValidUntil: string;
}

export interface PinAttemptResult {
  result: "ACCEPTED" | "REJECTED" | "BLOCKED" | "RESET_REQUIRED";
  remainingAttempts?: number;
  blockedUntil?: string | null;
}

export interface StationRepository {
  getSnapshot(input: {
    organizationId: string;
    stationId: string;
    profileId: string;
    observedAt: string;
  }): Promise<StationSnapshot | null>;
  recordPinAttempt(input: {
    organizationId: string;
    profileId: string;
    succeeded: boolean;
    observedAt: string;
  }): Promise<PinAttemptResult>;
  setPinVerifier(input: {
    organizationId: string;
    profileId: string;
    verifier: string;
    observedAt: string;
  }): Promise<void>;
  resetPinBlocks(
    organizationId: string,
    profileId: string,
    observedAt: string,
  ): Promise<void>;
}
