//! Client-build registry.
//!
//! A "client build" is one packaged client fork (the zip produced by the fork's own packaging
//! script, e.g. Forgotten-Client's tools/package-release-windows.ps1). The operator uploads
//! builds; the packaging pipeline pairs one build with a world's protocol assets and connection
//! files. Builds are stored extracted under .cloud/client-builds/<id>/ so packaging can copy
//! from them directly.

import fs from "node:fs";
import path from "node:path";
import extract from "extract-zip";
import { PATHS } from "../paths";
import { forkAdapter } from "./forks";
import { httpError } from "../util";

const MAX_BUILD_BYTES = 512 * 1024 * 1024;

export interface ClientBuildMeta {
  id: string;
  label: string;
  fork: string;
  /** Protocol versions this build was packaged for (operator-declared at upload). */
  protocols: number[];
  /** Executable name inside the build, if one was found. */
  exeName: string | null;
  createdAt: number;
}

function buildsRoot(): string {
  return path.join(PATHS.cloudRoot, "client-builds");
}

function buildDir(id: string): string {
  return path.join(buildsRoot(), id);
}

function buildMetaFile(id: string): string {
  return path.join(buildsRoot(), `${id}.json`);
}

export function listBuilds(): ClientBuildMeta[] {
  const root = buildsRoot();
  if (!fs.existsSync(root)) return [];
  const builds: ClientBuildMeta[] = [];
  for (const file of fs.readdirSync(root)) {
    if (!file.endsWith(".json")) continue;
    try {
      builds.push(JSON.parse(fs.readFileSync(path.join(root, file), "utf-8")) as ClientBuildMeta);
    } catch {
      // skip unreadable build metadata rather than failing the listing
    }
  }
  return builds.sort((a, b) => b.createdAt - a.createdAt);
}

export function getBuild(id: string): ClientBuildMeta | null {
  try {
    return JSON.parse(fs.readFileSync(buildMetaFile(id), "utf-8")) as ClientBuildMeta;
  } catch {
    return null;
  }
}

/** Finds the single top-level directory inside an extracted archive, if any. */
function findArchiveRoot(dir: string): string | null {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory());
  return directories.length === 1 && entries.length === 1
    ? path.join(dir, directories[0].name)
    : null;
}

function findExecutable(dir: string): string | null {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".exe")) return entry.name;
  }
  return null;
}

export async function saveBuild(
  label: string,
  fork: string,
  protocols: number[],
  archive: Buffer,
): Promise<ClientBuildMeta> {
  const adapter = forkAdapter(fork);
  if (!adapter) throw httpError(400, `unknown client fork ${fork}`);
  if (!Buffer.isBuffer(archive) || archive.length === 0) {
    throw httpError(400, "empty client build upload");
  }
  if (archive.length > MAX_BUILD_BYTES) {
    throw httpError(413, `client build exceeds the ${Math.floor(MAX_BUILD_BYTES / (1024 * 1024))}mb limit`);
  }
  if (protocols.length === 0 || protocols.some((protocol) => !Number.isInteger(protocol))) {
    throw httpError(400, "build must declare at least one supported protocol version");
  }

  const id = `cb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const target = buildDir(id);
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });

  const staging = path.join(buildsRoot(), `${id}-staging`);
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  const archiveFile = path.join(staging, "build.zip");
  fs.writeFileSync(archiveFile, archive);
  try {
    const extractDir = path.join(staging, "extracted");
    fs.mkdirSync(extractDir, { recursive: true });
    await extract(archiveFile, { dir: extractDir });
    // Flatten a single top-level archive folder (Forgotten-Cloud-main style) so the build
    // root holds the executable and work-directory files directly.
    const root = findArchiveRoot(extractDir) ?? extractDir;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      fs.renameSync(path.join(root, entry.name), path.join(target, entry.name));
    }
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }

  const meta: ClientBuildMeta = {
    id,
    label: label.trim() || adapter.label,
    fork,
    protocols,
    exeName: findExecutable(target),
    createdAt: Date.now(),
  };
  fs.writeFileSync(buildMetaFile(id), JSON.stringify(meta, null, 2));
  return meta;
}

export function deleteBuild(id: string): void {
  const meta = getBuild(id);
  if (!meta) throw httpError(404, `unknown client build ${id}`);
  fs.rmSync(buildDir(id), { recursive: true, force: true });
  fs.rmSync(buildMetaFile(id), { force: true });
}
