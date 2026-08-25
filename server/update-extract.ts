import fs from "node:fs";
import path from "node:path";
import type { Options } from "extract-zip";

/**
 * Thin re-export so the self-update module does not import the package at module top level
 * (keeps esbuild bundling simple and mirrors how installer.ts uses extract).
 */
export async function extract(zipPath: string, options: { dir: string } & Partial<Options>) {
  const extractZip = (await import("extract-zip")).default;
  return extractZip(path.resolve(zipPath), options as Options);
}

/** Convenience for callers that only need existence checks on archives. */
export function archiveExists(zipPath: string): boolean {
  return fs.existsSync(zipPath);
}
