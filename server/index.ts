import express from "express";
import fs from "node:fs";
import path from "node:path";
import { backupsRouter, importServerFromZip } from "./routes/backups";
import { databaseRouter } from "./routes/database";
import { filesRouter } from "./routes/files";
import { serversRouter } from "./routes/servers";
import { systemRouter } from "./routes/system";
import { ensureDirs, PATHS } from "./paths";
import { httpError } from "./util";

ensureDirs();

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));

// Local-only panel: refuse non-loopback traffic explicitly (defense in depth).
app.use((req, res, next) => {
  const remote = req.socket.remoteAddress ?? "";
  const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote);
  if (!loopback && !req.path.startsWith("/api/noop")) {
    return res.status(403).json({ error: "Forgotten Cloud is a local panel; loopback connections only" });
  }
  next();
});

app.use("/api/servers", serversRouter);
app.use("/api/servers", filesRouter);
app.use("/api/servers", databaseRouter);
app.use("/api/servers", backupsRouter);
app.use("/api", systemRouter);

// Import an exported world zip as a new server.
app.put("/api/import", express.raw({ type: "*/*", limit: "512mb" }), async (req, res, next) => {
  try {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw httpError(400, "upload a zip body");
    const name = String(req.query.name ?? "").trim() || "Imported server";
    res.status(201).json({ meta: await importServerFromZip(name.slice(0, 39), req.body) });
  } catch (error) {
    next(error);
  }
});

app.use("/api", (req, res) => {
  res.status(404).json({ error: `no route ${req.method} ${req.path}` });
});

// Error handler
app.use(
  (
    error: unknown,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const status = (error as { status?: number }).status ?? 500;
    const message = error instanceof Error ? error.message : String(error);
    if (status >= 500) console.error("[panel]", message);
    res.status(status).json({ error: message });
  },
);

// Static client (production)
const publicDir = path.resolve(PATHS.projectRoot, "dist", "public");
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

const port = Number(process.env.FC_PORT ?? 4870);
const server = app.listen(port, "127.0.0.1", () => {
  console.log(`Forgotten Cloud panel → http://127.0.0.1:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log("\nshutting down panel…");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  });
}
