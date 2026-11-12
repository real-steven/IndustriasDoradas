import { type INestApplication, UnauthorizedException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Server } from "node:http";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { configureApplication } from "../src/app.setup";
import {
  AUDIT_EVENT_REPOSITORY,
  type AuditEventRecord,
} from "../src/audit/audit.contracts";
import {
  ACCESS_TOKEN_VERIFIER,
  PROFILE_REPOSITORY,
  type AuthorizedProfile,
  type VerifiedAccessToken,
} from "../src/auth/auth.contracts";
import {
  SELF_PROFILE_REPOSITORY,
  type SelfProfileRepository,
} from "../src/profile/profile.contracts";
import { STATION_REPOSITORY } from "../src/station/station.contracts";

const TOKEN: VerifiedAccessToken = {
  subject: "a0000000-0000-4000-8000-000000000001",
  sessionId: "a0000000-0000-4000-8000-000000000002",
  email: "manager@example.invalid",
  issuedAt: 1_700_000_000,
  expiresAt: 1_700_003_600,
};
const ORG = "30000000-0000-4000-8000-000000000001";
const OTHER_ORG = "30000000-0000-4000-8000-000000000099";
const STATION = "34000000-0000-4000-8000-000000000001";

const MANAGER: AuthorizedProfile = {
  id: "a1000000-0000-4000-8000-000000000001",
  organizationId: ORG,
  authUserId: TOKEN.subject,
  displayName: "Gerencia ficticia",
  preferredLocale: "es",
  accountStatus: "ACTIVE",
  isActive: true,
  role: { id: "r1", code: "JEFE_EMPRESA", isActive: true },
  permissions: [],
};
const PLANT_MANAGER: AuthorizedProfile = {
  ...MANAGER,
  id: "a1000000-0000-4000-8000-000000000002",
  displayName: "Jefe de planta ficticio",
  role: { id: "r2", code: "JEFE_PLANTA", isActive: true },
};

function jpeg(): Buffer {
  const segment = (marker: number, payload: Buffer) => {
    const header = Buffer.from([0xff, marker, 0, 0]);
    header.writeUInt16BE(payload.length + 2, 2);
    return Buffer.concat([header, payload]);
  };
  const sof = Buffer.alloc(15);
  sof[0] = 8;
  sof.writeUInt16BE(64, 1);
  sof.writeUInt16BE(64, 3);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segment(0xc0, sof),
    segment(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])),
    Buffer.from([0x11, 0xff, 0xd9]),
  ]);
}

describe("Perfil propio (e2e)", () => {
  let app: INestApplication;
  let server: Server;
  let profiles: { findByAuthUserId: jest.Mock };
  let events: AuditEventRecord[];
  let repository: Record<keyof SelfProfileRepository, jest.Mock>;
  let stations: Record<string, jest.Mock>;

  beforeAll(async () => {
    profiles = { findByAuthUserId: jest.fn() };
    events = [];
    repository = {
      find: jest.fn(),
      findIdentity: jest.fn(),
      updateContact: jest.fn().mockResolvedValue(undefined),
      setAvatar: jest.fn().mockResolvedValue(undefined),
      setEmailChangeRequestedAt: jest.fn().mockResolvedValue(undefined),
      uploadPhoto: jest.fn().mockResolvedValue(undefined),
      removePhotos: jest.fn().mockResolvedValue(undefined),
      signPhoto: jest
        .fn()
        .mockResolvedValue("https://storage.test/sign/x?token=short"),
      requestEmailChange: jest.fn().mockResolvedValue({ status: "REQUESTED" }),
    };
    stations = {
      getSnapshot: jest.fn(),
      recordPinAttempt: jest.fn(),
      setPinVerifier: jest.fn(),
      resetPinBlocks: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ACCESS_TOKEN_VERIFIER)
      .useValue({
        verify: jest.fn((token: string) =>
          token === "valid-token"
            ? Promise.resolve(TOKEN)
            : Promise.reject(new UnauthorizedException("Invalid token")),
        ),
      })
      .overrideProvider(PROFILE_REPOSITORY)
      .useValue(profiles)
      .overrideProvider(AUDIT_EVENT_REPOSITORY)
      .useValue({
        insert: jest.fn((event: AuditEventRecord) => {
          events.push(event);
          return Promise.resolve();
        }),
      })
      .overrideProvider(SELF_PROFILE_REPOSITORY)
      .useValue(repository)
      .overrideProvider(STATION_REPOSITORY)
      .useValue(stations)
      .compile();
    app = moduleRef.createNestApplication();
    configureApplication(app);
    await app.init();
    server = app.getHttpServer() as Server;
  });

  beforeEach(() => {
    events = [];
    jest.clearAllMocks();
    profiles.findByAuthUserId.mockResolvedValue(MANAGER);
    repository.find.mockResolvedValue({
      displayName: "Gerencia ficticia",
      phone: null,
      avatarObjectPath: null,
      avatarUpdatedAt: null,
      emailChangeRequestedAt: null,
    });
    repository.findIdentity.mockResolvedValue({
      email: "manager@example.invalid",
      pendingEmail: null,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("devuelve solo el perfil de la sesión, sin datos técnicos de Auth", async () => {
    const response = await request(server)
      .get("/api/v1/me/profile")
      .set("Authorization", "Bearer valid-token")
      .expect(200);
    expect(response.body).toEqual({
      id: MANAGER.id,
      organizationId: ORG,
      role: "JEFE_EMPRESA",
      displayName: "Gerencia ficticia",
      email: "manager@example.invalid",
      pendingEmail: null,
      phone: null,
      photo: null,
    });
    expect(repository.find).toHaveBeenCalledWith(ORG, MANAGER.id);
  });

  it("rechaza campos no editables como rol, organización o id", async () => {
    await request(server)
      .patch("/api/v1/me/profile")
      .set("Authorization", "Bearer valid-token")
      .send({ role: "JEFE_PLANTA", organizationId: OTHER_ORG, id: "x" })
      .expect(400);
    expect(repository.updateContact).not.toHaveBeenCalled();
  });

  it("no permite al jefe de planta editar nombre, correo ni foto desde la web", async () => {
    profiles.findByAuthUserId.mockResolvedValue(PLANT_MANAGER);
    await request(server)
      .patch("/api/v1/me/profile")
      .set("Authorization", "Bearer valid-token")
      .send({ displayName: "Otro" })
      .expect(403);
    await request(server)
      .put("/api/v1/me/profile/email")
      .set("Authorization", "Bearer valid-token")
      .send({ email: "otro@example.invalid" })
      .expect(403);
    await request(server)
      .delete("/api/v1/me/profile/photo")
      .set("Authorization", "Bearer valid-token")
      .expect(403);
    expect(repository.updateContact).not.toHaveBeenCalled();
    expect(repository.requestEmailChange).not.toHaveBeenCalled();
  });

  it("niega el teléfono de estación en otra organización o sin rol de planta", async () => {
    profiles.findByAuthUserId.mockResolvedValue(PLANT_MANAGER);
    await request(server)
      .put(
        `/api/v1/organizations/${OTHER_ORG}/stations/${STATION}/profile/phone`,
      )
      .set("Authorization", "Bearer valid-token")
      .send({ phone: "88887777", pin: "123456" })
      .expect(403);
    profiles.findByAuthUserId.mockResolvedValue(MANAGER);
    await request(server)
      .put(`/api/v1/organizations/${ORG}/stations/${STATION}/profile/phone`)
      .set("Authorization", "Bearer valid-token")
      .send({ phone: "88887777", pin: "123456" })
      .expect(403);
    expect(repository.updateContact).not.toHaveBeenCalled();
  });

  it("rechaza el teléfono de estación si la estación no está autorizada", async () => {
    profiles.findByAuthUserId.mockResolvedValue(PLANT_MANAGER);
    stations.getSnapshot?.mockResolvedValue(null);
    await request(server)
      .put(`/api/v1/organizations/${ORG}/stations/${STATION}/profile/phone`)
      .set("Authorization", "Bearer valid-token")
      .send({ phone: "88887777", pin: "123456" })
      .expect(403);
    expect(repository.updateContact).not.toHaveBeenCalled();
  });

  it("acepta la foto como binario image/jpeg y rechaza otros tipos", async () => {
    const response = await request(server)
      .put("/api/v1/me/profile/photo")
      .set("Authorization", "Bearer valid-token")
      .set("Content-Type", "image/jpeg")
      .send(jpeg())
      .expect(200);
    expect(repository.uploadPhoto).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(response.body)).not.toContain("profile-photos/");
    expect(JSON.stringify(events)).not.toContain("token=short");

    await request(server)
      .put("/api/v1/me/profile/photo")
      .set("Authorization", "Bearer valid-token")
      .set("Content-Type", "image/png")
      .send(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
      .expect(415);
  });

  it("rechaza fotos más grandes que el límite", async () => {
    await request(server)
      .put("/api/v1/me/profile/photo")
      .set("Authorization", "Bearer valid-token")
      .set("Content-Type", "image/jpeg")
      .send(Buffer.alloc(300 * 1024, 0xff))
      .expect(413);
    expect(repository.uploadPhoto).not.toHaveBeenCalled();
  });

  it("rechaza sin sesión válida", async () => {
    await request(server).get("/api/v1/me/profile").expect(401);
  });
});
