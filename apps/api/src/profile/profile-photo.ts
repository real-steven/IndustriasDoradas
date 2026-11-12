/**
 * Validación del contenido real de la fotografía de perfil.
 *
 * El navegador ya decodifica, corrige la orientación, recorta y vuelve a
 * codificar la imagen como JPEG pequeño. El servidor no confía en eso: comprueba
 * la firma JPEG, recorre los segmentos, rechaza tamaños fuera de rango y elimina
 * cualquier metadato (EXIF, XMP, IPTC, ICC, comentarios) antes de guardarla.
 */
export const PROFILE_PHOTO_MAX_BYTES = 256 * 1024;
export const PROFILE_PHOTO_MAX_DIMENSION = 1024;
export const PROFILE_PHOTO_MIN_DIMENSION = 32;

export type ProfilePhotoRejection =
  | "PHOTO_EMPTY"
  | "PHOTO_TOO_LARGE"
  | "PHOTO_NOT_JPEG"
  | "PHOTO_CORRUPT"
  | "PHOTO_DIMENSIONS";

export type ProfilePhotoValidation =
  | { ok: true; bytes: Buffer; width: number; height: number }
  | { ok: false; reason: ProfilePhotoRejection };

const START_OF_FRAME = new Set([0xc0, 0xc1, 0xc2]);
const STANDALONE = new Set([
  0x01, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7,
]);

export function sanitizeProfilePhoto(input: Buffer): ProfilePhotoValidation {
  if (input.length === 0) return { ok: false, reason: "PHOTO_EMPTY" };
  if (input.length > PROFILE_PHOTO_MAX_BYTES)
    return { ok: false, reason: "PHOTO_TOO_LARGE" };
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8)
    return { ok: false, reason: "PHOTO_NOT_JPEG" };

  const kept: Buffer[] = [Buffer.from([0xff, 0xd8])];
  let offset = 2;
  let width = 0;
  let height = 0;

  while (offset < input.length) {
    if (input[offset] !== 0xff) return { ok: false, reason: "PHOTO_CORRUPT" };
    while (input[offset] === 0xff && offset < input.length) offset += 1;
    const marker = input[offset];
    offset += 1;
    if (marker === undefined) return { ok: false, reason: "PHOTO_CORRUPT" };
    if (marker === 0xd9) return { ok: false, reason: "PHOTO_CORRUPT" };
    if (STANDALONE.has(marker)) {
      kept.push(Buffer.from([0xff, marker]));
      continue;
    }
    if (offset + 2 > input.length)
      return { ok: false, reason: "PHOTO_CORRUPT" };
    const length = input.readUInt16BE(offset);
    if (length < 2 || offset + length > input.length)
      return { ok: false, reason: "PHOTO_CORRUPT" };
    const segment = input.subarray(offset - 2, offset + length);

    if (START_OF_FRAME.has(marker)) {
      if (length < 7) return { ok: false, reason: "PHOTO_CORRUPT" };
      height = input.readUInt16BE(offset + 3);
      width = input.readUInt16BE(offset + 5);
    }

    if (marker === 0xda) {
      if (width === 0 || height === 0)
        return { ok: false, reason: "PHOTO_CORRUPT" };
      const rest = input.subarray(offset - 2);
      if (
        rest.length < 4 ||
        rest[rest.length - 2] !== 0xff ||
        rest[rest.length - 1] !== 0xd9
      ) {
        return { ok: false, reason: "PHOTO_CORRUPT" };
      }
      kept.push(rest);
      if (
        width < PROFILE_PHOTO_MIN_DIMENSION ||
        height < PROFILE_PHOTO_MIN_DIMENSION ||
        width > PROFILE_PHOTO_MAX_DIMENSION ||
        height > PROFILE_PHOTO_MAX_DIMENSION
      ) {
        return { ok: false, reason: "PHOTO_DIMENSIONS" };
      }
      return { ok: true, bytes: Buffer.concat(kept), width, height };
    }

    if (!isMetadata(marker, segment)) kept.push(segment);
    offset += length;
  }

  return { ok: false, reason: "PHOTO_CORRUPT" };
}

function isMetadata(marker: number, segment: Buffer): boolean {
  if (marker === 0xfe) return true; // comentario
  if (marker === 0xe0) {
    // Solo se conserva el encabezado JFIF; cualquier otro APP0 es metadato.
    return segment.subarray(4, 9).toString("latin1") !== "JFIF\u0000";
  }
  return marker >= 0xe1 && marker <= 0xef; // EXIF, XMP, ICC, IPTC, etc.
}
