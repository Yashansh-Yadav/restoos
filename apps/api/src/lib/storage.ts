import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize, resolve, sep } from "node:path";

// File storage (M2-T1): menu photos now, PDFs later. One interface; the driver comes from env:
// - local: files on disk under STORAGE_DIR, served by the API at /api/files/<key> (dev/tests).
// - s3: AWS S3 (Mumbai) for production — added when the bucket exists (plan §2), like OTP providers.

export type FileStorage = {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** URL the browser loads (same origin for local files). */
  publicUrl(key: string): string;
  /** The stored bytes (menu imports re-read their file; local files are served from it). */
  read(key: string): Promise<{ bytes: Buffer; contentType: string } | null>;
  /** True when GET /api/files/* should serve this driver's files (local disk only). */
  servesFiles: boolean;
};

/** Keys are `a-z0-9-_/.` paths without `..`, so they can't escape the storage root. */
export const SAFE_KEY = /^(?!.*\.\.)[a-z0-9][a-z0-9/_.-]{0,200}$/i;

const TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/** Key prefixes anyone with the URL may load (menu photos). Uploaded imports stay private. */
export const PUBLIC_PREFIXES = ["menu/"];

export const FILES_PREFIX = "/api/files/";

export function createLocalDiskStorage(root: string): FileStorage {
  const base = resolve(root);
  const pathFor = (key: string) => {
    if (!SAFE_KEY.test(key)) throw new Error(`unsafe storage key "${key}"`);
    const full = normalize(join(base, key));
    if (!full.startsWith(base + sep)) throw new Error(`storage key escapes root "${key}"`);
    return full;
  };
  return {
    async put(key, bytes) {
      const full = pathFor(key);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, bytes);
    },
    async delete(key) {
      await rm(pathFor(key), { force: true });
    },
    publicUrl: (key) => `${FILES_PREFIX}${key}`,
    servesFiles: true,
    async read(key) {
      if (!SAFE_KEY.test(key)) return null;
      try {
        const bytes = await readFile(pathFor(key));
        const ext = key.slice(key.lastIndexOf("."));
        return { bytes, contentType: TYPES[ext] ?? "application/octet-stream" };
      } catch {
        return null;
      }
    },
  };
}

/** The storage key behind one of our public URLs (to delete a replaced file), or null. */
export function keyFromPublicUrl(url: string | null): string | null {
  if (!url?.startsWith(FILES_PREFIX)) return null;
  const key = url.slice(FILES_PREFIX.length);
  return SAFE_KEY.test(key) ? key : null;
}
