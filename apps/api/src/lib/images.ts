import { MENU_IMAGE_MAX_BYTES, MENU_IMAGE_MAX_PX } from "@restoos/shared";
import sharp from "sharp";
import { AppError } from "./errors";

// Menu photo pipeline (M2-T1): any JPEG/PNG/WebP up to 5 MB → upright, fits in 800×800, WebP q80,
// metadata (EXIF/GPS) stripped. Small files load fast on 4G (plan §14 LCP target).

const ACCEPTED = new Set(["jpeg", "png", "webp"]);

export async function processMenuImage(input: Buffer): Promise<Buffer> {
  if (input.length > MENU_IMAGE_MAX_BYTES) {
    throw new AppError(400, "IMAGE_TOO_LARGE", "Photos can be up to 5 MB. Try a smaller one.");
  }
  let format: string | undefined;
  try {
    format = (await sharp(input).metadata()).format;
  } catch {
    format = undefined;
  }
  if (!format || !ACCEPTED.has(format)) {
    throw new AppError(400, "IMAGE_TYPE", "Upload a JPG, PNG or WebP photo.");
  }
  try {
    return await sharp(input)
      .rotate() // honour the camera's orientation, then drop the EXIF
      .resize(MENU_IMAGE_MAX_PX, MENU_IMAGE_MAX_PX, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    // The header looked fine but the pixels don't decode (truncated or corrupt file).
    throw new AppError(400, "IMAGE_UNREADABLE", "This photo couldn't be read. Try another one.");
  }
}
