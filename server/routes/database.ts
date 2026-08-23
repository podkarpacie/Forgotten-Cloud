import express from "express";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { serverWorld } from "../paths";
import { loadServerMeta } from "../store";
import { installedBinaryPath } from "../engine/catalog";
import * as supervisor from "../engine/supervisor";
import { httpError, run } from "../util";

export const databaseRouter = express.Router();

function dbPath(id: string): string {
  const meta = loadServerMeta(String(id));
  if (!meta) throw httpError(404, `unknown server ${id}`);
  const file = path.join(serverWorld(id), "data", "forgotten-engine.db");
  if (!fs.existsSync(file)) throw httpError(404, "world database not found; initialize the world first");
  return file;
}

function quoteIdent(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) throw httpError(400, `unsafe identifier ${identifier}`);
  return `"${identifier}"`;
}

databaseRouter.get("/:id/info", (req, res) => {
  const file = dbPath(String(req.params.id));
  const stat = fs.statSync(file);
  let schemaVersion: number | null = null;
  try {
    const db = new DatabaseSync(file, { readOnly: true });
    const row = db.prepare("SELECT MAX(version) AS v FROM schema_migrations").get() as { v: number | null };
    schemaVersion = row.v ?? null;
    db.close();
  } catch {
    schemaVersion = null;
  }
  res.json({ file: path.basename(file), bytes: stat.size, modified: stat.mtimeMs, schemaVersion });
});

databaseRouter.get("/:id/tables", (req, res) => {
  const file = dbPath(String(req.params.id));
  const db = new DatabaseSync(file, { readOnly: true });
  const tables = (
    db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    ).all() as { name: string }[]
  ).map(({ name }) => {
    const columns = db.prepare(`PRAGMA table_info(${quoteIdent(name)})`).all() as {
      name: string;
      type: string;
      pk: number;
    }[];
    let rows = 0;
    try {
      rows = (db.prepare(`SELECT COUNT(*) AS c FROM ${quoteIdent(name)}`).get() as { c: number }).c;
    } catch {
      rows = -1;
    }
    return { name, rowCount: rows, columns: columns.map((column) => ({ ...column, pk: Boolean(column.pk) })) };
  });
  db.close();
  res.json({ tables });
});

databaseRouter.get("/:id/table/:table", (req, res) => {
  const file = dbPath(String(req.params.id));
  const params = req.params as Record<string, string>;
  const table = String(params.table);
  const offset = Math.max(Number(req.query.offset ?? 0), 0);
  const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 500);
  const db = new DatabaseSync(file, { readOnly: true });
  const columns = (db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all() as { name: string }[]).map(
    (column) => column.name,
  );
  const orderBy = req.query.order && columns.includes(String(req.query.order)) ? quoteIdent(String(req.query.order)) : null;
  const direction = String(req.query.dir ?? "asc").toLowerCase() === "desc" ? "DESC" : "ASC";
  const rows = db
    .prepare(
      `SELECT * FROM ${quoteIdent(table)} ${orderBy ? `ORDER BY ${orderBy} ${direction}` : ""} LIMIT ? OFFSET ?`,
    )
    .all(limit, offset);
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM ${quoteIdent(table)}`).get() as { c: number }).c;
  db.close();
  res.json({ table, columns, rows, total, offset, limit });
});

databaseRouter.post("/:id/query", express.json(), (req, res) => {
  const id = String(req.params.id);
  const sql = String((req.body as { sql?: string }).sql ?? "").trim();
  if (!sql) throw httpError(400, "sql is required");
  const writeMode = Boolean((req.body as { write?: boolean }).write);
  if (writeMode && supervisor.isRunning(id)) {
    throw httpError(409, "stop the server before running write-mode SQL against the live database");
  }
  const file = dbPath(id);
  const started = Date.now();
  const db = new DatabaseSync(file, { readOnly: !writeMode });
  try {
    const statements = splitStatements(sql).slice(0, 20);
    const results = statements.map((statement) => {
      try {
        const prepared = db.prepare(statement);
        const isSelect = /^\s*(select|pragma|explain)/i.test(statement);
        if (isSelect) return { statement, ok: true, rows: prepared.all(), changes: 0 };
        else return { statement, ok: true, rows: [], changes: prepared.run().changes };
      } catch (error) {
        return { statement, ok: false, error: error instanceof Error ? error.message : String(error), rows: [], changes: 0 };
      }
    });
    res.json({ results, elapsedMs: Date.now() - started, mode: writeMode ? "write" : "read-only" });
  } finally {
    db.close();
  }
});

function splitStatements(sql: string): string[] {
  return sql
    .split(/;\s*(?:\n|$)/)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0 && !statement.startsWith("--"));
}

databaseRouter.get("/:id/export-table", (req, res) => {
  const file = dbPath(String(req.params.id));
  const table = String((req.params as Record<string, string>).table);
  const format = String(req.query.format ?? "json") === "csv" ? "csv" : "json";
  const db = new DatabaseSync(file, { readOnly: true });
  const rows = db.prepare(`SELECT * FROM ${quoteIdent(table)}`).all() as Record<string, unknown>[];
  db.close();
  if (format === "csv") {
    const columns = Object.keys(rows[0] ?? {});
    const csv = [
      columns.join(","),
      ...rows.map((row) =>
        columns
          .map((column) => {
            const value = row[column];
            const text = value === null || value === undefined ? "" : String(value);
            return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
          })
          .join(","),
      ),
    ].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${table}.csv"`);
    return res.send(csv);
  }
  res.setHeader("Content-Disposition", `attachment; filename="${table}.json"`);
  res.json(rows);
});

// ---- Player / account operations bridged through the engine CLI ----------------

const SKILLS = ["fist", "club", "sword", "axe", "distance", "shielding", "fishing"] as const;

databaseRouter.post("/:id/players/action", express.json(), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const meta = loadServerMeta(id);
    if (!meta) throw httpError(404, "unknown server");
    const bin = installedBinaryPath(meta.engineVersion);
    if (!bin) throw httpError(409, "engine binary is not installed yet");
    const body = req.body as Record<string, string | number | undefined>;
    const world = serverWorld(id);
    const args: string[] = [];

    switch (body.action) {
      case "account-create":
        args.push("account", "create", world, String(body.name ?? ""), String(body.password ?? ""));
        break;
      case "player-create":
        args.push("player", "create", world, String(body.accountId ?? ""), String(body.name ?? ""));
        if (body.vocationId !== undefined) args.push(String(body.vocationId));
        break;
      case "player-town":
        args.push("player", "town", world, String(body.playerId ?? ""), String(body.townId ?? ""));
        break;
      case "player-vocation":
        args.push("player", "vocation", world, String(body.playerId ?? ""), String(body.vocationId ?? ""));
        break;
      case "player-skill": {
        const skill = String(body.skill ?? "");
        if (!SKILLS.includes(skill as (typeof SKILLS)[number])) throw httpError(400, `skill must be one of ${SKILLS.join(", ")}`);
        args.push("player", "skill", world, String(body.playerId ?? ""), skill, String(body.level ?? ""));
        if (body.percent !== undefined) args.push(String(body.percent));
        break;
      }
      case "player-bank-get":
        args.push("player", "bank", world, String(body.playerId ?? ""), "get");
        break;
      case "player-bank-set":
        args.push("player", "bank", world, String(body.playerId ?? ""), String(body.bankOp ?? "set"), String(body.amount ?? ""));
        break;
      case "player-respawn":
        args.push("player", "respawn", world, String(body.playerId ?? ""));
        break;
      default:
        throw httpError(400, "unknown player action");
    }

    const result = await run(bin, args, { timeoutMs: 60_000 });
    res.json({
      code: result.code,
      output: `${result.stdout}${result.stderr ? `\n${result.stderr}` : ""}`.trim(),
    });
  } catch (error) {
    next(error);
  }
});
