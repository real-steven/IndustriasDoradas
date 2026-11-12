import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import { maskPhoneNumber, normalizePhoneNumber } from "./phone-number";
import {
  PROFILE_PHOTO_SIGNED_URL_SECONDS,
  SELF_PROFILE_REPOSITORY,
  type SelfProfileRepository,
  type SelfProfileView,
} from "./profile.contracts";
import { sanitizeProfilePhoto } from "./profile-photo";
import {
  AUDIT_ACTIONS,
  type AuditActor,
  type AuditFieldChange,
  type AuditOrigin,
} from "../audit/audit.contracts";
import { AuditTrailService } from "../audit/audit-trail.service";
import type { AuthenticatedContext } from "../auth/auth.contracts";
import { ApplicationError } from "../common/errors/application-error";
import { StationService } from "../station/station.service";

/** Tipo de entidad de auditoría para cambios del propio perfil. */
export const SELF_PROFILE_ENTITY = "user_profile_self";

export interface RequestMeta {
  correlationId: string;
  method: string;
  path: string;
}

const DISPLAY_NAME_MAX = 80;

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    @Inject(SELF_PROFILE_REPOSITORY)
    private readonly repository: SelfProfileRepository,
    private readonly audit: AuditTrailService,
    private readonly station: StationService,
  ) {}

  async view(
    auth: AuthenticatedContext,
    meta: RequestMeta,
  ): Promise<SelfProfileView> {
    const { organizationId, id } = auth.profile;
    const [row, identity] = await Promise.all([
      this.repository.find(organizationId, id),
      this.repository.findIdentity(auth.profile.authUserId),
    ]);

    if (row.emailChangeRequestedAt !== null && identity.pendingEmail === null) {
      // La solicitud ya no está pendiente en Supabase Auth: se confirmó.
      await this.repository.setEmailChangeRequestedAt(organizationId, id, null);
      await this.audit.recordBestEffort({
        ...this.base(auth, meta, "WEB"),
        result: "SUCCEEDED",
        reasonCode: "EMAIL_CHANGE_CONFIRMED",
        changes: { email: { before: null, after: maskEmail(identity.email) } },
        allowedChangeFields: ["email"],
      });
    }

    let photo: SelfProfileView["photo"] = null;
    if (row.avatarObjectPath !== null) {
      const url = await this.repository.signPhoto(
        row.avatarObjectPath,
        PROFILE_PHOTO_SIGNED_URL_SECONDS,
      );
      if (url !== null) {
        photo = {
          url,
          expiresAt: new Date(
            Date.now() + PROFILE_PHOTO_SIGNED_URL_SECONDS * 1000,
          ).toISOString(),
        };
      }
    }

    return {
      id,
      organizationId,
      role: auth.profile.role.code,
      displayName: row.displayName,
      email: identity.email,
      pendingEmail: identity.pendingEmail,
      phone: row.phone,
      photo,
    };
  }

  /** Gerencia (web): nombre y teléfono propios. */
  async updateOwn(
    auth: AuthenticatedContext,
    input: { displayName?: string; phone?: string | null },
    meta: RequestMeta,
  ): Promise<SelfProfileView> {
    const { organizationId, id } = auth.profile;
    const current = await this.repository.find(organizationId, id);
    const changes: Record<string, AuditFieldChange> = {};
    const update: { displayName?: string; phone?: string | null } = {};

    if (input.displayName !== undefined) {
      const name = input.displayName.replace(/\s+/gu, " ").trim();
      if (name === "" || name.length > DISPLAY_NAME_MAX) {
        throw new ApplicationError(
          HttpStatus.BAD_REQUEST,
          "DISPLAY_NAME_INVALID",
          "Display name must have between 1 and 80 characters",
        );
      }
      if (name !== current.displayName) {
        update.displayName = name;
        changes.display_name = { before: current.displayName, after: name };
      }
    }

    if (input.phone !== undefined) {
      const phone = this.parsePhone(input.phone);
      if (phone !== current.phone) {
        update.phone = phone;
        changes.phone = {
          before: maskPhoneNumber(current.phone),
          after: maskPhoneNumber(phone),
        };
      }
    }

    if (Object.keys(update).length > 0) {
      await this.audit.execute(
        {
          ...this.base(auth, meta, "WEB"),
          changes,
          allowedChangeFields: Object.keys(changes),
          failureResult: "FAILED",
          failureReasonCode: "PROFILE_UPDATE_FAILED",
        },
        () => this.repository.updateContact(organizationId, id, update),
      );
    }
    return this.view(auth, meta);
  }

  /**
   * Jefe de planta (desktop): solo el teléfono, y solo con una elevación
   * comprobada por el servidor (PIN verificado y contado contra bloqueos).
   */
  async updatePhoneFromStation(
    auth: AuthenticatedContext,
    organizationId: string,
    stationId: string,
    input: { phone: string | null; pin: string },
    meta: RequestMeta,
  ): Promise<{ phone: string | null }> {
    const phone = this.parsePhone(input.phone);
    const elevation = await this.station.elevate(
      organizationId,
      stationId,
      input.pin,
      auth,
      meta.correlationId,
    );
    if (elevation.result !== "ACCEPTED") {
      throw new ApplicationError(
        HttpStatus.FORBIDDEN,
        `ELEVATION_${elevation.result}`,
        "A valid plant manager elevation is required",
      );
    }

    const current = await this.repository.find(organizationId, auth.profile.id);
    if (phone !== current.phone) {
      await this.audit.execute(
        {
          ...this.base(auth, meta, "DESKTOP"),
          stationId,
          changes: {
            phone: {
              before: maskPhoneNumber(current.phone),
              after: maskPhoneNumber(phone),
            },
          },
          allowedChangeFields: ["phone"],
          failureResult: "FAILED",
          failureReasonCode: "PROFILE_UPDATE_FAILED",
        },
        () =>
          this.repository.updateContact(organizationId, auth.profile.id, {
            phone,
          }),
      );
    }
    return { phone };
  }

  async requestEmailChange(
    auth: AuthenticatedContext,
    accessToken: string,
    input: { email: string; redirectTo?: string },
    meta: RequestMeta,
  ): Promise<SelfProfileView> {
    const email = input.email.trim().toLowerCase();
    const identity = await this.repository.findIdentity(
      auth.profile.authUserId,
    );
    if (email === identity.email?.toLowerCase()) {
      throw new ApplicationError(
        HttpStatus.BAD_REQUEST,
        "EMAIL_UNCHANGED",
        "The new email matches the current one",
      );
    }

    const outcome = await this.repository.requestEmailChange(
      accessToken,
      email,
      input.redirectTo,
    );
    const changes = {
      email: { before: maskEmail(identity.email), after: maskEmail(email) },
    };
    if (outcome.status !== "REQUESTED") {
      await this.audit.recordBestEffort({
        ...this.base(auth, meta, "WEB"),
        result: "REJECTED",
        reasonCode: `EMAIL_CHANGE_${outcome.status}`,
        changes,
        allowedChangeFields: ["email"],
      });
      const [status, message] =
        outcome.status === "RATE_LIMITED"
          ? [HttpStatus.TOO_MANY_REQUESTS, "Too many email change requests"]
          : outcome.status === "EMAIL_UNAVAILABLE"
            ? [HttpStatus.CONFLICT, "The email cannot be used"]
            : [HttpStatus.BAD_REQUEST, "The email change was rejected"];
      throw new ApplicationError(
        status,
        `EMAIL_CHANGE_${outcome.status}`,
        message,
      );
    }

    await this.repository.setEmailChangeRequestedAt(
      auth.profile.organizationId,
      auth.profile.id,
      new Date().toISOString(),
    );
    await this.audit.record({
      ...this.base(auth, meta, "WEB"),
      result: "SUCCEEDED",
      reasonCode: "EMAIL_CHANGE_REQUESTED",
      changes,
      allowedChangeFields: ["email"],
    });
    return this.view(auth, meta);
  }

  async replacePhoto(
    auth: AuthenticatedContext,
    bytes: Buffer,
    meta: RequestMeta,
  ): Promise<SelfProfileView> {
    const validation = sanitizeProfilePhoto(bytes);
    if (!validation.ok) {
      throw new ApplicationError(
        validation.reason === "PHOTO_TOO_LARGE"
          ? HttpStatus.PAYLOAD_TOO_LARGE
          : HttpStatus.UNPROCESSABLE_ENTITY,
        validation.reason,
        "The photo must be a valid JPEG image",
      );
    }

    const { organizationId, id } = auth.profile;
    const current = await this.repository.find(organizationId, id);
    const objectPath = `${organizationId}/${id}/${randomUUID()}.jpg`;
    const reasonCode =
      current.avatarObjectPath === null ? "PHOTO_ADDED" : "PHOTO_REPLACED";

    await this.photoAudited(auth, meta, reasonCode, async () => {
      await this.repository.uploadPhoto(objectPath, validation.bytes);
      try {
        await this.repository.setAvatar(
          organizationId,
          id,
          objectPath,
          new Date().toISOString(),
        );
      } catch (error) {
        await this.removeQuietly([objectPath]);
        throw error;
      }
    });
    if (current.avatarObjectPath !== null)
      await this.removeQuietly([current.avatarObjectPath]);
    return this.view(auth, meta);
  }

  async removePhoto(
    auth: AuthenticatedContext,
    meta: RequestMeta,
  ): Promise<SelfProfileView> {
    const { organizationId, id } = auth.profile;
    const current = await this.repository.find(organizationId, id);
    if (current.avatarObjectPath !== null) {
      const previous = current.avatarObjectPath;
      await this.photoAudited(auth, meta, "PHOTO_REMOVED", () =>
        this.repository.setAvatar(organizationId, id, null, null),
      );
      await this.removeQuietly([previous]);
    }
    return this.view(auth, meta);
  }

  /** Auditoría de foto: nunca registra binarios, rutas ni URLs firmadas. */
  private async photoAudited(
    auth: AuthenticatedContext,
    meta: RequestMeta,
    reasonCode: string,
    operation: () => Promise<void>,
  ): Promise<void> {
    const base = this.base(auth, meta, "WEB");
    try {
      await operation();
    } catch (error) {
      await this.audit.recordBestEffort({
        ...base,
        result: "FAILED",
        reasonCode: "PHOTO_UPDATE_FAILED",
      });
      throw error;
    }
    await this.audit.record({ ...base, result: "SUCCEEDED", reasonCode });
  }

  private parsePhone(value: string | null): string | null {
    if (value === null || value.trim() === "") return null;
    const phone = normalizePhoneNumber(value);
    if (phone === null) {
      throw new ApplicationError(
        HttpStatus.BAD_REQUEST,
        "PHONE_INVALID",
        "Phone must be a Costa Rica or international number",
      );
    }
    return phone;
  }

  private async removeQuietly(paths: readonly string[]): Promise<void> {
    try {
      await this.repository.removePhotos(paths);
    } catch {
      this.logger.error({ event: "profile_photo_cleanup_failed" });
    }
  }

  private base(
    auth: AuthenticatedContext,
    meta: RequestMeta,
    origin: AuditOrigin,
  ) {
    const actor: AuditActor = {
      kind: "AUTHENTICATED_USER",
      profileId: auth.profile.id,
      authUserId: auth.profile.authUserId,
      displayName: auth.profile.displayName,
      roleCode: auth.profile.role.code,
    };
    return {
      correlationId: meta.correlationId,
      organizationId: auth.profile.organizationId,
      actor,
      origin,
      action: AUDIT_ACTIONS.ACCOUNT_GOVERNANCE,
      entityType: SELF_PROFILE_ENTITY,
      entityId: auth.profile.id,
      request: { method: meta.method, path: meta.path },
    };
  }
}

export function maskEmail(email: string | null): string | null {
  if (email === null) return null;
  const at = email.lastIndexOf("@");
  if (at <= 0) return "•••";
  return `${email.slice(0, Math.min(2, at))}•••${email.slice(at)}`;
}
