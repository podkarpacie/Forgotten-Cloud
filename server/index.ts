import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { backupsRouter, importServerFromZip } from "./routes/backups";
import { databaseRouter } from "./routes/database";
import { filesRouter } from "./routes/files";
import { serversRouter } from "./routes/servers";
import { systemRouter } from "./routes/system";
import { ensureDirs, PATHS } from "./paths";
import { loadSettings } from "./store";
import { httpError } from "./util";

ensureDirs();

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));

// Network policy from settings (applied at boot): loopback-only or LAN sharing.
const settings = loadSettings();
const lanAllowed = settings.networkAccess === "lan";

app.use((req, res, next) => {
  const remote = req.socket.remoteAddress ?? "";
  const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote);
  if (!loopback && !lanAllowed) {
    return res.status(403).json({ error: "Forgotten Cloud is restricted to this machine (networkAccess = loopback)" });
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
const host = lanAllowed ? "0.0.0.0" : "127.0.0.1";

function lanAddresses(): string[] {
  const results: string[] = [];
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const info of interfaces ?? []) {
      if (info.family === "IPv4" && !info.internal) results.push(info.address);
    }
  }
  return results;
}

const server = app.listen(port, host, () => {
  console.log(`Forgotten Cloud panel → http://127.0.0.1:${port}`);
  if (lanAllowed) {
    for (const address of lanAddresses()) {
      console.log(`                    → http://${address}:${port}  (LAN)`);
    }
    console.log(
      "If other devices cannot connect, allow Node.js through Windows Firewall or run:",
    );
    console.log(
      `  netsh advfirewall firewall add rule name="Forgotten Cloud" dir=in action=allow protocol=TCP localport=${port}`,
    );
  } else {
    console.log("Network sharing is off (settings: networkAccess = loopback).");
  }
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log("\nshutting down panel…");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  });
}
