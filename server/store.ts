import fs from "node:fs";
import path from "node:path";
import { DEFAULT_SETTINGS, type PanelSettings, type ServerMeta } from "./types";
import { PATHS, ensureDirs, serverMetaDir, serverMetaFile } from "./paths";

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

export function loadSettings(): PanelSettings {
  const stored = readJson<Partial<PanelSettings>>(PATHS.settingsFile, {});
  const merged = { ...DEFAULT_SETTINGS, ...stored };
  if (!merged.engineSourcePath) {
    merged.engineSourcePath =
      DEFAULT_ENGINE_SOURCES.find((candidate) => fs.existsSync(path.join(candidate, "Cargo.toml"))) ?? "";
  }
  return merged;
}

/** Common sibling checkout of Forgotten Engine, used as a build source when configured empty. */
const DEFAULT_ENGINE_SOURCES = [
  path.resolve(PATHS.projectRoot, "..", "Forgotten Engine", "repo"),
  "C:\\Users\\Admin\\Desktop\\Forgotten Engine\\repo",
];

export function saveSettings(settings: PanelSettings): void {
  ensureDirs();
  fs.writeFileSync(PATHS.settingsFile, JSON.stringify(settings, null, 2));
}

export function listServerIds(): string[] {
  try {
    return fs
      .readdirSync(PATHS.serversRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

export function loadServerMeta(id: string): ServerMeta | null {
  const raw = readJson<Partial<ServerMeta> | null>(serverMetaFile(id), null);
  if (!raw || raw.id !== id) return null;
  // Backfill newer fields for records written by older panel builds.
  return {
    aacProvisioned: false,
    lastAutoBackupAt: null,
    plugins: {},
    autoBackup: { enabled: false, intervalHours: 6, keep: 10 },
    ...raw,
  } as ServerMeta;
}

export function saveServerMeta(meta: ServerMeta): void {
  fs.mkdirSync(serverMetaDir(meta.id), { recursive: true });
  fs.writeFileSync(serverMetaFile(meta.id), JSON.stringify(meta, null, 2));
}

/** All metas; missing/corrupt records are skipped silently. */
export function allServerMetas(): ServerMeta[] {
  return listServerIds()
    .map(loadServerMeta)
    .filter((meta): meta is ServerMeta => meta !== null);
}
