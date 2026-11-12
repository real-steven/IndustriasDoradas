/**
 * Prepara la fotografía de perfil en el navegador antes de enviarla:
 * comprueba el contenido real (no la extensión), aplica la orientación EXIF,
 * recorta al centro, reduce a 384 px y vuelve a codificar como JPEG. Volver a
 * codificar en un canvas descarta todos los metadatos (EXIF, GPS, XMP).
 * La API vuelve a validar y limpiar el resultado.
 */
export const PHOTO_INPUT_MAX_BYTES = 8 * 1024 * 1024;
export const PHOTO_OUTPUT_SIZE = 384;
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

export type PhotoKind = "jpeg" | "png" | "webp";

export class PhotoValidationError extends Error {
  constructor(
    public readonly code: "TOO_LARGE" | "UNSUPPORTED" | "CORRUPT",
    message: string,
  ) {
    super(message);
  }
}

export async function detectPhotoKind(file: Blob): Promise<PhotoKind | null> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpeg";
  if (
    head[0] === 0x89 &&
    head[1] === 0x50 &&
    head[2] === 0x4e &&
    head[3] === 0x47 &&
    head[4] === 0x0d &&
    head[5] === 0x0a &&
    head[6] === 0x1a &&
    head[7] === 0x0a
  )
    return "png";
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...head.slice(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  return null;
}

export async function preparePhoto(file: File): Promise<Blob> {
  if (file.size > PHOTO_INPUT_MAX_BYTES)
    throw new PhotoValidationError(
      "TOO_LARGE",
      "La imagen supera 8 MB. Elija una más liviana.",
    );
  if ((await detectPhotoKind(file)) === null)
    throw new PhotoValidationError(
      "UNSUPPORTED",
      "Solo se aceptan imágenes JPEG, PNG o WebP.",
    );

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new PhotoValidationError(
      "CORRUPT",
      "No fue posible leer la imagen. Puede estar dañada.",
    );
  }
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    if (side < 32)
      throw new PhotoValidationError(
        "CORRUPT",
        "La imagen es demasiado pequeña.",
      );
    const target = Math.min(PHOTO_OUTPUT_SIZE, side);
    const canvas = document.createElement("canvas");
    canvas.width = target;
    canvas.height = target;
    const context = canvas.getContext("2d");
    if (context === null)
      throw new PhotoValidationError("CORRUPT", "No fue posible procesar.");
    context.imageSmoothingQuality = "high";
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      target,
      target,
    );
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.86),
    );
    if (blob === null)
      throw new PhotoValidationError("CORRUPT", "No fue posible procesar.");
    return blob;
  } finally {
    bitmap.close();
  }
}
