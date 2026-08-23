import archiver from "archiver";
import extract from "extract-zip";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { applyConfigValues } from "../configlua";
import { serverMetaDir, serverWorld } from "../paths";
import { loadServerMeta, saveServerMeta } from "../store";
import * as supervisor from "../engine/supervisor";
import type { BackupEntry, ProfileId, ServerMeta, ServerPorts } from "../types";
import { httpError, newId } from "../util";

export const backupsRouter = express.Router();

function requireWorld(id: string): string {
  const meta = loadServerMeta(String(id));
  if (!meta) throw httpError(404, `unknown server ${id}`);
  return serverWorld(meta.id);
}

function backupsDir(world: string): string {
  return path.join(serverMetaDir(path.basename(world)), "backups");
}

function listBackups(world: string): BackupEntry[] {
  const dir = backupsDir(world);
  try {
    return fs
      .readdirSync(dir)
      .filter((name) => name.endsWith(".zip"))
      .map((name) => {
        const stat = fs.statSync(path.join(dir, name));
        const origin = name.includes("-auto")
          ? "automatic"
          : name.startsWith("preRestore-")
            ? "pre-restore"
            : "manual";
        return { file: name, size: stat.size, createdAt: stat.mtimeMs, origin } satisfies BackupEntry;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export function createZip(world: string, outZip: string, label: string): Promise<number> {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(outZip), { recursive: true });
    const output = fs.createWriteStream(outZip);
    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.on("error", reject);
    output.on("close", () => resolve(archive.pointer()));
    output.on("error", reject);
    archive.pipe(output);

    const metaFile = path.join(serverMetaDir(path.basename(world)), "server.json");
    if (fs.existsSync(metaFile)) {
      archive.append(fs.readFileSync(metaFile), { name: "fc-manifest.json" });
    }
    archive.append(
      JSON.stringify(
        { label, createdAt: new Date().toISOString(), format: "forgotten-cloud-backup-v2" },
        null,
        2,
      ),
      { name: "BACKUP.txt" },
    );

    for (const entry of fs.readdirSync(world, { withFileTypes: true })) {
      if (entry.name === ".fc") continue;
      const full = path.join(world, entry.name);
      if (entry.isDirectory()) archive.directory(full, entry.name);
      else archive.file(full, { name: entry.name });
    }
    void archive.finalize();
  });
}

backupsRouter.get("/:id/backups", (req, res) => {
  const id = String(req.params.id);
  const world = requireWorld(id);
  res.json({
    backups: listBackups(world),
    autoBackup: loadServerMeta(id)?.autoBackup ?? null,
  });
});

backupsRouter.post("/:id/backups/create", async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const meta = loadServerMeta(id);
    if (!meta) throw httpError(404, "unknown server");
    const world = serverWorld(id);
    if (supervisor.isRunning(id) && (req.body as { force?: boolean })?.force !== true) {
      throw httpError(409, "stop the server first, or pass force:true to snapshot a live world");
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const file = `${stamp}${req.query.auto ? "-auto" : ""}-${newId("bk")}.zip`;
    const bytes = await createZip(world, path.join(backupsDir(world), file), req.body?.label ?? "manual");
    enforceBackupRetention(id);
    res.status(201).json({ created: file, bytes, backups: listBackups(world) });
  } catch (error) {
    next(error);
  }
});

function enforceBackupRetention(id: string): void {
  const meta = loadServerMeta(id);
  const keep = Math.max(meta?.autoBackup.keep ?? 10, 1);
  const dir = backupsDir(serverWorld(id));
  try {
    const zips = fs
      .readdirSync(dir)
      .filter((name) => name.endsWith(".zip"))
      .map((name) => ({ name, mtime: fs.statSync(path.join(dir, name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const stale of zips.slice(keep)) fs.rmSync(path.join(dir, stale.name), { force: true });
  } catch {
    /* nothing to prune */
  }
}

backupsRouter.put("/:id/autobackup", (req, res) => {
  const id = String(req.params.id);
  const meta = loadServerMeta(id);
  if (!meta) throw httpError(404, "unknown server");
  const body = (req.body ?? {}) as { enabled?: boolean; intervalHours?: number; keep?: number };
  meta.autoBackup = {
    enabled: Boolean(body.enabled),
    intervalHours: Math.min(Math.max(Number(body.intervalHours ?? 6), 1), 168),
    keep: Math.min(Math.max(Number(body.keep ?? 10), 1), 100),
  };
  saveServerMeta(meta);
  res.json({ autoBackup: meta.autoBackup });
});

backupsRouter.post("/:id/backups/restore", async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const world = requireWorld(id);
    if (supervisor.isRunning(id)) throw httpError(409, "stop the server before restoring a backup");
    const file = String((req.body as { file?: string }).file ?? "");
    if (!/^[\w.-]+\.zip$/.test(file)) throw httpError(400, "invalid backup filename");
    const zipPath = path.join(backupsDir(world), file);
    if (!fs.existsSync(zipPath)) throw httpError(404, "backup not found");

    // Safety net: snapshot current state before overwriting.
    await createZip(world, path.join(backupsDir(world), `preRestore-${Date.now()}.zip`), "pre-restore safety");

    const tmp = path.join(serverMetaDir(id), `restore-${Date.now()}`);
    await extract(zipPath, { dir: tmp });

    for (const entry of fs.readdirSync(world, { withFileTypes: true })) {
      if (entry.name === ".fc") continue;
      fs.rmSync(path.join(world, entry.name), { recursive: true, force: true });
    }
    for (const entry of fs.readdirSync(tmp, { withFileTypes: true })) {
      // Archive metadata is not world content.
      if (entry.name === "BACKUP.txt" || entry.name === "fc-manifest.json") continue;
      fs.renameSync(path.join(tmp, entry.name), path.join(world, entry.name));
    }
    fs.rmSync(tmp, { recursive: true, force: true });

    // Ports may collide after import/restore; reassert this server's allocation.
    const meta = loadServerMeta(id)!;
    const luaPath = path.join(world, "config.lua");
    if (fs.existsSync(luaPath)) {
      const lua = fs.readFileSync(luaPath, "utf-8");
      fs.writeFileSync(luaPath, applyConfigValues(lua, portsToValues(meta)));
    }
    saveServerMeta(meta);
    res.json({ restored: file });
  } catch (error) {
    next(error);
  }
});

function portsToValues(meta: ServerMeta): Record<string, string | number | boolean> {
  const values: Record<string, string | number | boolean> = {
    statusProtocolPort: meta.ports.status,
    gameProtocolPort: meta.ports.game,
  };
  if (meta.ports.session != null) {
    values.gameSessionPort = meta.ports.session;
    values.advertisedGameSessionPort = meta.ports.session;
  }
  if (meta.ports.otcLogin != null && meta.ports.otcGame != null) {
    values.otclientV8LoginPort = meta.ports.otcLogin;
    values.otclientV8GamePort = meta.ports.otcGame;
    values.advertisedOtClientV8GamePort = meta.ports.otcGame;
  }
  return values;
}

backupsRouter.delete("/:id/backups/:file", (req, res) => {
  const world = requireWorld(req.params.id);
  const file = String(req.params.file);
  if (!/^[\w.-]+\.zip$/.test(file)) throw httpError(400, "invalid backup filename");
  const target = path.join(backupsDir(world), file);
  if (!fs.existsSync(target)) throw httpError(404, "backup not found");
  fs.rmSync(target);
  res.json({ deleted: file });
});

// ---- Full export / import -----------------------------------------------------

backupsRouter.get("/:id/export", (req, res, next) => {
  try {
    const id = String(req.params.id);
    const world = requireWorld(id);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${metaName(id)}-${stamp}-export.zip"`,
    );
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", next);
    archive.pipe(res);

    for (const entry of fs.readdirSync(world, { withFileTypes: true })) {
      if (entry.name === ".fc") continue;
      const full = path.join(world, entry.name);
      if (entry.isDirectory()) archive.directory(full, entry.name);
      else archive.file(full, { name: entry.name });
    }
    void archive.finalize();
  } catch (error) {
    next(error);
  }
});

function metaName(id: string): string {
  return (loadServerMeta(id)?.name ?? id).replace(/[^\w-]+/g, "_");
}

/** Import an exported world zip as a new server. Body is the raw zip bytes. */
export async function importServerFromZip(name: string, zipBytes: Buffer): Promise<ServerMeta> {
  const { allocateFreePorts } = await import("./servers");
  const id = newId("srv");
  const world = serverWorld(id);
  fs.mkdirSync(world, { recursive: true });
  const zipPath = path.join(serverMetaDir(id), "import.zip");
  fs.mkdirSync(serverMetaDir(id), { recursive: true });
  fs.writeFileSync(zipPath, zipBytes);
  await extract(zipPath, { dir: world });
  fs.rmSync(zipPath, { force: true });
  if (!fs.existsSync(path.join(world, "config.lua"))) {
    fs.rmSync(world, { recursive: true, force: true });
    throw httpError(400, "archive does not contain config.lua at its root");
  }

  const luaPath = path.join(world, "config.lua");
  let lua = fs.readFileSync(luaPath, "utf-8");
  const profileMatch = lua.match(/feProfile\s*=\s*"([\w.-]+)"/);
  const versionMatch = lua.match(/feProfile[\s\S]{0,400}?fe-v(\d)/); // best-effort
  void versionMatch;

  const ports: ServerPorts = await allocateFreePorts(false, false);
  lua = applyConfigValues(lua, {
    statusProtocolPort: ports.status,
    gameProtocolPort: ports.game,
    ...(ports.session ? { gameSessionPort: ports.session, advertisedGameSessionPort: ports.session } : {}),
    ...(ports.otcLogin && ports.otcGame
      ? { otclientV8LoginPort: ports.otcLogin, otclientV8GamePort: ports.otcGame, advertisedOtClientV8GamePort: ports.otcGame }
      : {}),
  });
  fs.writeFileSync(luaPath, lua);

  const profileId = (
    ["fe-7.4", "fe-8.0", "fe-1.2"].includes(profileMatch?.[1] ?? "") ? profileMatch![1] : "fe-7.4"
  ) as ProfileId;

  const meta: ServerMeta = {
    id,
    name,
    profile: profileId,
    engineVersion: detectEngineVersion(lua),
    template: "Imported",
    motd: "",
    ports,
    createdAt: Date.now(),
    autoBackup: { enabled: false, intervalHours: 6, keep: 10 },
    lastAutoBackupAt: null,
    plugins: {},
    aacProvisioned: false,
  };
  saveServerMeta(meta);
  return meta;
}

function detectEngineVersion(lua: string): string {
  const match = lua.match(/forgottenCloudEngineVersion\s*=\s*"?(fe-v[\w.]+)"?/);
  return match?.[1] ?? "fe-v7.4.44";
}
