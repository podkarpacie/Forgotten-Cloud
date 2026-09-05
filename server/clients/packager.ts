//! Packaged-client pipeline: resolve world → protocol → client build → asset slot →
//! connection files → downloadable zip.
//!
//! Asset policy: the panel never bundles Tibia client assets. A protocol's asset slot is
//! operator-uploaded (server/clients/assets.ts); when the slot is empty the package ships
//! asset-free and the operator distributes the .spr/.dat themselves.

import archiver from "archiver";
import fs from "node:fs";
import path from "node:path";
import { PATHS, serverWorld } from "../paths";
import { loadServerMeta } from "../store";
import { extractValue, readConfigFile } from "../configlua";
import { httpError } from "../util";
import { forkAdapter } from "./forks";
import { getAsset } from "./assets";
import { getBuild, type ClientBuildMeta } from "./builds";

export interface PackageOptions {
  serverId: string;
  buildId: string;
  /** Host written into the package's connection files. Defaults to 127.0.0.1. */
  host?: string;
}

export interface PackageResult {
  file: string;
  fileName: string;
  build: ClientBuildMeta;
  protocol: number;
  assetsIncluded: ("spr" | "dat")[];
}

/** Reads the classic protocol a world speaks, from its config.lua (otclientV8ProtocolVersion),
 * falling back to the profile mapping (fe-7.4 → 740). Returns 0 when nothing resolves. */
export function resolveWorldProtocol(serverId: string): number {
  const meta = loadServerMeta(serverId);
  if (!meta) throw httpError(404, `unknown server ${serverId}`);
  const world = serverWorld(serverId);
  if (fs.existsSync(path.join(world, "config.lua"))) {
    const { lua } = readConfigFile(world);
    const raw = extractValue(lua, "otclientV8ProtocolVersion");
    if (raw.found) {
      const parsed = Number(raw.raw.replace(/["'\s]/g, ""));
      if (Number.isInteger(parsed) && parsed > 0) return parsed;
    }
  }
  return meta.profile === "fe-7.4" ? 740 : 0;
}

function copyDirContents(from: string, to: string): void {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const destination = path.join(to, entry.name);
    if (entry.isDirectory()) copyDirContents(source, destination);
    else fs.copyFileSync(source, destination);
  }
}

function safeName(name: string): string {
  return name.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "world";
}

function zipDirectory(source: string, outZip: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outZip);
    const archive = archiver("zip", { zlib: { level: 6 } });
    output.on("close", () => resolve());
    output.on("error", reject);
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(source, false);
    void archive.finalize();
  });
}

export async function packageClient(options: PackageOptions): Promise<PackageResult> {
  const meta = loadServerMeta(options.serverId);
  if (!meta) throw httpError(404, `unknown server ${options.serverId}`);
  const build = getBuild(options.buildId);
  if (!build) throw httpError(404, `unknown client build ${options.buildId}`);
  const adapter = forkAdapter(build.fork);
  if (!adapter) throw httpError(400, `client build ${build.id} references unknown fork ${build.fork}`);

  const protocol = resolveWorldProtocol(options.serverId);
  if (!protocol) throw httpError(409, `world ${meta.name} has no resolvable client protocol`);
  if (!build.protocols.includes(protocol)) {
    throw httpError(
      409,
      `client build ${build.label} does not support protocol ${protocol} (supports: ${build.protocols.join(", ")})`,
    );
  }

  const buildDir = path.join(PATHS.cloudRoot, "client-builds", build.id);
  if (!fs.existsSync(buildDir)) throw httpError(410, `client build ${build.id} files are missing`);

  const port = meta.ports.game;
  const host = (options.host ?? "127.0.0.1").trim() || "127.0.0.1";

  // Stage the package tree, then zip it.
  const packageDir = path.join(PATHS.cloudRoot, "client-packages");
  const stage = path.join(packageDir, `${meta.id}-${build.id}-${Date.now()}`);
  fs.mkdirSync(stage, { recursive: true });
  try {
    copyDirContents(buildDir, stage);

    // Fork-specific connection files (seed config.otml, templated init.lua, ...).
    for (const [name, content] of Object.entries(
      adapter.connectionFiles({ host, port, protocol, worldName: meta.name }),
    )) {
      const target = path.join(stage, ...name.split("/"));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }

    // Protocol asset slot: only files the operator uploaded are included.
    const assetsIncluded: ("spr" | "dat")[] = [];
    for (const kind of ["spr", "dat"] as const) {
      const asset = getAsset(protocol, kind);
      if (!asset) continue;
      const target = path.join(stage, adapter.assetDir(protocol), adapter.assetFileNames[kind]);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, asset.buffer);
      assetsIncluded.push(kind);
    }

    fs.mkdirSync(packageDir, { recursive: true });
    const fileName = `${safeName(meta.name)}-client-${protocol}.zip`;
    const zipPath = path.join(packageDir, fileName);
    await zipDirectory(stage, zipPath);
    return { file: zipPath, fileName, build, protocol, assetsIncluded };
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}
