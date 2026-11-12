import type { AuditEventRecord } from "../audit/audit.contracts";
import { AuditTrailService } from "../audit/audit-trail.service";
import type { AuthenticatedContext } from "../auth/auth.contracts";
import type { StationService } from "../station/station.service";
import type {
  EmailChangeOutcome,
  SelfProfileRepository,
  SelfProfileRow,
} from "./profile.contracts";
import { ProfileService } from "./profile.service";

const ORG = "30000000-0000-4000-8000-000000000001";
const PROFILE = "40000000-0000-4000-8000-000000000001";
const STATION = "50000000-0000-4000-8000-000000000001";

function auth(
  role: "JEFE_EMPRESA" | "JEFE_PLANTA" = "JEFE_EMPRESA",
): AuthenticatedContext {
  return {
    token: {
      subject: "auth-1",
      sessionId: "s",
      email: "lucia@example.test",
      issuedAt: 0,
      expiresAt: 0,
    },
    profile: {
      id: PROFILE,
      organizationId: ORG,
      authUserId: "60000000-0000-4000-8000-000000000001",
      displayName: "Lucía",
      preferredLocale: "es",
      accountStatus: "ACTIVE",
      isActive: true,
      role: { id: "r", code: role, isActive: true },
      permissions: [],
    },
  };
}

const meta = {
  correlationId: "70000000-0000-4000-8000-000000000001",
  method: "PATCH",
  path: "/api/v1/me/profile",
};

class FakeRepository implements SelfProfileRepository {
  row: SelfProfileRow = {
    displayName: "Lucía",
    phone: null,
    avatarObjectPath: null,
    avatarUpdatedAt: null,
    emailChangeRequestedAt: null,
  };
  identity = {
    email: "lucia@example.test" as string | null,
    pendingEmail: null as string | null,
  };
  objects = new Set<string>();
  emailOutcome: EmailChangeOutcome = { status: "REQUESTED" };
  failAvatar = false;
  find = jest.fn(async () => Promise.resolve({ ...this.row }));
  findIdentity = jest.fn(async () => Promise.resolve({ ...this.identity }));
  updateContact = jest.fn(
    async (
      _organizationId: string,
      _profileId: string,
      changes: { displayName?: string; phone?: string | null },
    ) => {
      if (changes.displayName !== undefined)
        this.row.displayName = changes.displayName;
      if (changes.phone !== undefined) this.row.phone = changes.phone;
      return Promise.resolve();
    },
  );
  setAvatar = jest.fn(
    async (
      _organizationId: string,
      _profileId: string,
      path: string | null,
      at: string | null,
    ) => {
      if (this.failAvatar) throw new Error("db down");
      this.row.avatarObjectPath = path;
      this.row.avatarUpdatedAt = at;
      return Promise.resolve();
    },
  );
  setEmailChangeRequestedAt = jest.fn(
    async (_organizationId: string, _profileId: string, at: string | null) => {
      this.row.emailChangeRequestedAt = at;
      return Promise.resolve();
    },
  );
  uploadPhoto = jest.fn<Promise<void>, [string, Buffer]>(
    async (path: string) => {
      this.objects.add(path);
      return Promise.resolve();
    },
  );
  removePhotos = jest.fn(async (paths: readonly string[]) => {
    paths.forEach((path) => this.objects.delete(path));
    return Promise.resolve();
  });
  signPhoto = jest.fn(async (path: string) =>
    Promise.resolve(`https://storage.test/sign/${path}?token=short`),
  );
  requestEmailChange = jest.fn<
    Promise<EmailChangeOutcome>,
    [string, string, string | undefined]
  >(async () => Promise.resolve(this.emailOutcome));
}

function tinyJpeg(): Buffer {
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
    segment(0xe1, Buffer.from("Exif\u0000\u0000secret", "latin1")),
    segment(0xc0, sof),
    segment(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])),
    Buffer.from([0x11, 0xff, 0xd9]),
  ]);
}

describe("ProfileService", () => {
  let repository: FakeRepository;
  let events: AuditEventRecord[];
  let station: { elevate: jest.Mock };
  let service: ProfileService;

  beforeEach(() => {
    repository = new FakeRepository();
    events = [];
    station = {
      elevate: jest.fn(async () => Promise.resolve({ result: "ACCEPTED" })),
    };
    const audit = new AuditTrailService({
      insert: async (event: AuditEventRecord) => {
        events.push(event);
        return Promise.resolve();
      },
    });
    service = new ProfileService(
      repository,
      audit,
      station as unknown as StationService,
    );
  });

  const serialized = () => JSON.stringify(events);

  it("edita nombre y teléfono propios y audita con el teléfono enmascarado", async () => {
    const view = await service.updateOwn(
      auth(),
      { displayName: "  Lucía  Gómez ", phone: "8888-7777" },
      meta,
    );
    expect(view.displayName).toBe("Lucía Gómez");
    expect(view.phone).toBe("+50688887777");
    expect(events).toHaveLength(1);
    expect(events[0]?.entityType).toBe("user_profile_self");
    expect(events[0]?.changes.phone).toEqual({
      before: null,
      after: "+506••••7777",
    });
    expect(serialized()).not.toContain("88887777");
  });

  it("permite borrar el teléfono con un valor vacío", async () => {
    repository.row.phone = "+50688887777";
    const view = await service.updateOwn(auth(), { phone: "" }, meta);
    expect(view.phone).toBeNull();
  });

  it("rechaza teléfonos inválidos sin tocar la base", async () => {
    await expect(
      service.updateOwn(auth(), { phone: "123" }, meta),
    ).rejects.toMatchObject({ response: { code: "PHONE_INVALID" } });
    expect(repository.updateContact).not.toHaveBeenCalled();
  });

  it("no audita cuando nada cambió", async () => {
    await service.updateOwn(auth(), { displayName: "Lucía" }, meta);
    expect(events).toHaveLength(0);
  });

  it("solicita el cambio de correo por Supabase Auth y lo deja pendiente, no definitivo", async () => {
    repository.requestEmailChange.mockImplementation(async () => {
      repository.identity.pendingEmail = "nueva@example.test";
      return Promise.resolve({ status: "REQUESTED" });
    });
    const view = await service.requestEmailChange(
      auth(),
      "user-token",
      { email: "Nueva@Example.test" },
      meta,
    );
    expect(repository.requestEmailChange).toHaveBeenCalledWith(
      "user-token",
      "nueva@example.test",
      undefined,
    );
    expect(view.email).toBe("lucia@example.test");
    expect(view.pendingEmail).toBe("nueva@example.test");
    expect(events[0]?.reasonCode).toBe("EMAIL_CHANGE_REQUESTED");
    expect(serialized()).not.toContain("user-token");
    expect(serialized()).not.toContain("nueva@example.test");
  });

  it("audita la confirmación cuando deja de estar pendiente", async () => {
    repository.row.emailChangeRequestedAt = new Date().toISOString();
    repository.identity = { email: "nueva@example.test", pendingEmail: null };
    await service.view(auth(), meta);
    expect(events.map((event) => event.reasonCode)).toEqual([
      "EMAIL_CHANGE_CONFIRMED",
    ]);
    expect(repository.row.emailChangeRequestedAt).toBeNull();
  });

  it("rechaza un correo igual al actual o no disponible", async () => {
    await expect(
      service.requestEmailChange(
        auth(),
        "t",
        { email: "lucia@example.test" },
        meta,
      ),
    ).rejects.toMatchObject({ response: { code: "EMAIL_UNCHANGED" } });
    repository.emailOutcome = { status: "EMAIL_UNAVAILABLE" };
    await expect(
      service.requestEmailChange(
        auth(),
        "t",
        { email: "otra@example.test" },
        meta,
      ),
    ).rejects.toMatchObject({
      response: { code: "EMAIL_CHANGE_EMAIL_UNAVAILABLE" },
    });
    expect(repository.row.emailChangeRequestedAt).toBeNull();
  });

  it("sube, reemplaza y quita la foto privada sin huérfanos ni rutas o URLs en la auditoría", async () => {
    const first = await service.replacePhoto(auth(), tinyJpeg(), meta);
    const firstPath = repository.row.avatarObjectPath as string;
    expect(firstPath.startsWith(`${ORG}/${PROFILE}/`)).toBe(true);
    expect(first.photo?.url).toContain("token=short");
    expect(
      new Date(first.photo?.expiresAt ?? 0).getTime() - Date.now(),
    ).toBeLessThanOrEqual(60_000);

    await service.replacePhoto(auth(), tinyJpeg(), meta);
    expect(repository.objects.has(firstPath)).toBe(false);
    expect(repository.objects.size).toBe(1);

    const removed = await service.removePhoto(auth(), meta);
    expect(removed.photo).toBeNull();
    expect(repository.objects.size).toBe(0);
    expect(events.map((event) => event.reasonCode)).toEqual([
      "PHOTO_ADDED",
      "PHOTO_REPLACED",
      "PHOTO_REMOVED",
    ]);
    expect(serialized()).not.toContain(`${ORG}/`);
    expect(serialized()).not.toContain("storage.test");
    const uploaded = repository.uploadPhoto.mock.calls[0]?.[1];
    expect(uploaded?.toString("latin1")).not.toContain("secret");
  });

  it("borra el objeto nuevo si falla guardar la referencia", async () => {
    repository.failAvatar = true;
    await expect(
      service.replacePhoto(auth(), tinyJpeg(), meta),
    ).rejects.toThrow("db down");
    expect(repository.objects.size).toBe(0);
    expect(events[0]?.result).toBe("FAILED");
  });

  it("rechaza imágenes que no son JPEG reales", async () => {
    await expect(
      service.replacePhoto(auth(), Buffer.from("GIF89a"), meta),
    ).rejects.toMatchObject({ response: { code: "PHOTO_NOT_JPEG" } });
    expect(repository.uploadPhoto).not.toHaveBeenCalled();
  });

  it("desktop: guarda el teléfono solo con elevación verificada por el servidor", async () => {
    const result = await service.updatePhoneFromStation(
      auth("JEFE_PLANTA"),
      ORG,
      STATION,
      { phone: "+1 415 555 0100", pin: "123456" },
      meta,
    );
    expect(result.phone).toBe("+14155550100");
    expect(station.elevate).toHaveBeenCalledWith(
      ORG,
      STATION,
      "123456",
      expect.anything(),
      meta.correlationId,
    );
    expect(events[0]?.origin).toBe("DESKTOP");
    expect(events[0]?.stationId).toBe(STATION);
    expect(serialized()).not.toContain("123456");
  });

  it("desktop: sin elevación válida no cambia nada", async () => {
    station.elevate.mockResolvedValue({
      result: "REJECTED",
      remainingAttempts: 3,
    });
    await expect(
      service.updatePhoneFromStation(
        auth("JEFE_PLANTA"),
        ORG,
        STATION,
        { phone: "88887777", pin: "000000" },
        meta,
      ),
    ).rejects.toMatchObject({ response: { code: "ELEVATION_REJECTED" } });
    expect(repository.updateContact).not.toHaveBeenCalled();
  });
});
