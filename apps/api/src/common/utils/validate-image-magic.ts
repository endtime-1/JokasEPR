import { readFileSync, unlinkSync } from "fs";

type ImageType = "jpeg" | "png" | "webp" | "gif";

/**
 * Read the first 12 bytes of a file and match against known image magic bytes.
 * Returns the detected image type, or null if the file is not a recognised image.
 * JPEG: FF D8 FF
 * PNG:  89 50 4E 47 0D 0A 1A 0A
 * WebP: 52 49 46 46 ?? ?? ?? ?? 57 45 42 50
 * GIF:  47 49 46 38
 */
export function detectImageType(filePath: string): ImageType | null {
  try {
    const buf = readFileSync(filePath);
    if (buf.length < 4) return null;

    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";

    if (
      buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
      buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
    ) return "png";

    if (
      buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf.length >= 12 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
    ) return "webp";

    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return "gif";

    return null;
  } catch {
    return null;
  }
}

/**
 * Validate an uploaded file is a real image by checking its magic bytes.
 * Deletes the file and returns false if it is not a recognised image format.
 */
export function validateAndCleanImageUpload(filePath: string): boolean {
  const type = detectImageType(filePath);
  if (!type) {
    try { unlinkSync(filePath); } catch {}
    return false;
  }
  return true;
}
