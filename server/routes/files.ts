import express from "express";
import fs from "node:fs";
import path from "node:path";
import { serverWorld } from "../paths";
import { loadServerMeta } from "../store";
import { CONFIG_SCHEMA, applyConfigValues, parseConfig } from "../configlua";
import * as supervisor from "../engine/supervisor";
import type { FileNode } from "../types";
import { httpError, safeJoin } from "../util";

export const filesRouter = express.Router();

const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".otb", ".otbm", ".spr", ".dat",
  ".db", ".sqlite", ".zip", ".gz", ".exe", ".dll", ".so", ".dylib", ".pem",
]);

function requireWorld(id: string): string {
  const meta = loadServerMeta(String(id));
  if (!meta) throw httpError(404, `unknown server ${id}`);
  return serverWorld(meta.id);
}

filesRouter.get("/:id/list", (req, res) => {
  const world = requireWorld(req.params.id);
  const dir = safeJoin(world, String(req.query.path ?? "."));
  if (!fs.existsSync(dir)) throw httpError(404, "directory not found");
  if (!fs.statSync(dir).isDirectory()) throw httpError(400, "not a directory");
  const nodes: FileNode[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".fc") continue;
    const full = path.join(dir, entry.name);
    const stat = fs.statSync(full);
    nodes.push({
      name: entry.name,
      path: path.relative(world, full).split(path.sep).join("/"),
      type: entry.isDirectory() ? "dir" : "file",
      size: entry.isFile() ? stat.size : 0,
      modified: stat.mtimeMs,
    });
  }
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  res.json({ cwd: path.relative(world, dir).split(path.sep).join("/") || ".", nodes });
});

filesRouter.get("/:id/file", (req, res) => {
  const world = requireWorld(req.params.id);
  const file = safeJoin(world, String(req.query.path ?? ""));
  const stat = fs.statSync(file);
  if (!stat.isFile()) throw httpError(400, "not a file");
  const wantsRaw = req.query.download === "1";
  const ext = path.extname(file).toLowerCase();
  if (!wantsRaw && (stat.size > MAX_TEXT_BYTES || BINARY_EXTENSIONS.has(ext))) {
    throw httpError(415, `binary or oversized file (${stat.size} bytes); use download`);
  }
  res.setHeader("Content-Type", "application/octet-stream");
  if (wantsRaw) {
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${path.basename(file).replace(/"/g, "")}"`,
    );
  }
  res.sendFile(file);
});

const WRITE_LOCK_MESSAGE = "stop the server before writing engine files";

filesRouter.put("/:id/file", express.raw({ type: "*/*", limit: "64mb" }), (req, res) => {
  const id = String(req.params.id);
  const world = requireWorld(id);
  const target = safeJoin(world, String(req.query.path ?? ""));
  if (!target.startsWith(world)) throw httpError(400, "bad path");
  const isDbFile = /\.db$|\.sqlite$/i.test(target);
  if (supervisor.isRunning(id) && !isDbFile) {
    // Text/config edits while running are allowed but discouraged; large binary drops are blocked.
    const size = Buffer.isBuffer(req.body) ? req.body.length : 0;
    if (size > MAX_TEXT_BYTES) throw httpError(409, WRITE_LOCK_MESSAGE);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, req.body);
  res.json({ saved: true, bytes: Buffer.isBuffer(req.body) ? req.body.length : 0 });
});

filesRouter.post("/:id/mkdir", (req, res) => {
  const world = requireWorld(req.params.id);
  const target = safeJoin(world, String((req.body as { path?: string }).path ?? ""));
  fs.mkdirSync(target, { recursive: true });
  res.json({ created: true });
});

filesRouter.post("/:id/touch", (req, res) => {
  const world = requireWorld(req.params.id);
  const target = safeJoin(world, String((req.body as { path?: string }).path ?? ""));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (!fs.existsSync(target)) fs.writeFileSync(target, "");
  res.json({ created: fs.existsSync(target) });
});

filesRouter.post("/:id/rename", (req, res) => {
  const world = requireWorld(req.params.id);
  const body = req.body as { from?: string; to?: string };
  const from = safeJoin(world, String(body.from ?? ""));
  const to = safeJoin(world, String(body.to ?? ""));
  if (!fs.existsSync(from)) throw httpError(404, "source not found");
  if (fs.existsSync(to)) throw httpError(409, "destination already exists");
  fs.renameSync(from, to);
  res.json({ renamed: true });
});

filesRouter.delete("/:id/file", (req, res) => {
  const world = requireWorld(req.params.id);
  const target = safeJoin(world, String(req.query.path ?? ""));
  if (path.resolve(target) === path.resolve(world)) {
    throw httpError(400, "refusing to delete the world root");
  }
  fs.rmSync(target, { recursive: true, force: true });
  res.json({ deleted: true });
});

// ---- config.lua structured editor -------------------------------------------

filesRouter.get("/:id/config", (req, res) => {
  const world = requireWorld(req.params.id);
  const file = path.join(world, "config.lua");
  if (!fs.existsSync(file)) throw httpError(404, "config.lua not found");
  const lua = fs.readFileSync(file, "utf-8");
  res.json({ values: parseConfig(lua), rawBytes: Buffer.byteLength(lua), schema: CONFIG_SCHEMA });
});

filesRouter.put("/:id/config", (req, res) => {
  const id = String(req.params.id);
  const world = requireWorld(id);
  const file = path.join(world, "config.lua");
  if (!fs.existsSync(file)) throw httpError(404, "config.lua not found");
  const lua = fs.readFileSync(file, "utf-8");
  const updated = applyConfigValues(lua, (req.body as { values?: Record<string, string | number | boolean> }).values ?? {});
  fs.writeFileSync(file, updated);
  res.json({ saved: true, requiresRestart: supervisor.isRunning(id) });
});
