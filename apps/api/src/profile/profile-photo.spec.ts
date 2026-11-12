import { PROFILE_PHOTO_MAX_BYTES, sanitizeProfilePhoto } from "./profile-photo";

function segment(marker: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(4);
  header[0] = 0xff;
  header[1] = marker;
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
}

function jpeg(width: number, height: number, extra: Buffer[] = []): Buffer {
  const jfif = segment(
    0xe0,
    Buffer.from(
      "JFIF\u0000\u0001\u0001\u0000\u0000\u0001\u0000\u0001\u0000\u0000",
      "latin1",
    ),
  );
  const sof = Buffer.alloc(15);
  sof[0] = 8;
  sof.writeUInt16BE(height, 1);
  sof.writeUInt16BE(width, 3);
  sof[5] = 3;
  const scan = Buffer.concat([
    segment(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])),
    Buffer.from([0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd9]),
  ]);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    jfif,
    ...extra,
    segment(0xc0, sof),
    scan,
  ]);
}

describe("sanitizeProfilePhoto", () => {
  it("acepta un JPEG válido y elimina EXIF, XMP y comentarios", () => {
    const exif = segment(
      0xe1,
      Buffer.from("Exif\u0000\u0000GPS-SECRETO", "latin1"),
    );
    const comment = segment(
      0xfe,
      Buffer.from("C:/Users/privado.jpg", "latin1"),
    );
    const result = sanitizeProfilePhoto(jpeg(256, 256, [exif, comment]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const text = result.bytes.toString("latin1");
    expect(text).not.toContain("GPS-SECRETO");
    expect(text).not.toContain("privado");
    expect(text).toContain("JFIF");
    expect(result.width).toBe(256);
  });

  it("rechaza contenido que no es JPEG aunque se declare como tal", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(sanitizeProfilePhoto(png)).toEqual({
      ok: false,
      reason: "PHOTO_NOT_JPEG",
    });
  });

  it("rechaza archivos vacíos, truncados o demasiado grandes", () => {
    expect(sanitizeProfilePhoto(Buffer.alloc(0))).toEqual({
      ok: false,
      reason: "PHOTO_EMPTY",
    });
    const valid = jpeg(128, 128);
    expect(sanitizeProfilePhoto(valid.subarray(0, valid.length - 2)).ok).toBe(
      false,
    );
    expect(
      sanitizeProfilePhoto(Buffer.alloc(PROFILE_PHOTO_MAX_BYTES + 1, 0xff)),
    ).toEqual({
      ok: false,
      reason: "PHOTO_TOO_LARGE",
    });
  });

  it("rechaza dimensiones fuera de rango", () => {
    expect(sanitizeProfilePhoto(jpeg(4000, 3000))).toEqual({
      ok: false,
      reason: "PHOTO_DIMENSIONS",
    });
    expect(sanitizeProfilePhoto(jpeg(8, 8))).toEqual({
      ok: false,
      reason: "PHOTO_DIMENSIONS",
    });
  });
});
