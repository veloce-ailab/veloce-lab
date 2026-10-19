import { existsSync } from "node:fs";

/** Accept native paths and the URL pathnames used by plugin registrations. */
export function dashboardAssetPath(file: string): string {
  const native = (value: string) => /^\/[A-Za-z]:[\\/]/.test(value) ? value.slice(1) : value;
  const original = native(file);
  // Preserve real filenames containing percent escapes instead of decoding twice.
  if (existsSync(original)) return original;
  try {
    const decoded = native(decodeURIComponent(file));
    return existsSync(decoded) ? decoded : original;
  } catch {
    return original;
  }
}
