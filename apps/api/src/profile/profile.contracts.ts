export const SELF_PROFILE_REPOSITORY = Symbol("SELF_PROFILE_REPOSITORY");

export const PROFILE_PHOTO_BUCKET = "profile-photos";
export const PROFILE_PHOTO_SIGNED_URL_SECONDS = 60;

export interface SelfProfileRow {
  displayName: string;
  phone: string | null;
  avatarObjectPath: string | null;
  avatarUpdatedAt: string | null;
  emailChangeRequestedAt: string | null;
}

export interface AuthIdentity {
  email: string | null;
  pendingEmail: string | null;
}

export type EmailChangeOutcome =
  | { status: "REQUESTED" }
  | { status: "EMAIL_UNAVAILABLE" }
  | { status: "RATE_LIMITED" }
  | { status: "REJECTED" };

export interface SelfProfileRepository {
  find(organizationId: string, profileId: string): Promise<SelfProfileRow>;
  findIdentity(authUserId: string): Promise<AuthIdentity>;
  updateContact(
    organizationId: string,
    profileId: string,
    changes: { displayName?: string; phone?: string | null },
  ): Promise<void>;
  setAvatar(
    organizationId: string,
    profileId: string,
    objectPath: string | null,
    updatedAt: string | null,
  ): Promise<void>;
  setEmailChangeRequestedAt(
    organizationId: string,
    profileId: string,
    requestedAt: string | null,
  ): Promise<void>;
  uploadPhoto(objectPath: string, bytes: Buffer): Promise<void>;
  removePhotos(objectPaths: readonly string[]): Promise<void>;
  signPhoto(objectPath: string, seconds: number): Promise<string | null>;
  requestEmailChange(
    accessToken: string,
    newEmail: string,
    redirectTo: string | undefined,
  ): Promise<EmailChangeOutcome>;
}

export interface SelfProfileView {
  id: string;
  organizationId: string;
  role: string;
  displayName: string;
  email: string | null;
  pendingEmail: string | null;
  phone: string | null;
  photo: { url: string; expiresAt: string } | null;
}
