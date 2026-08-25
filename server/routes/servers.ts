import express from "express";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { serverMetaDir, serverWorld } from "../paths";
import {
  allServerMetas,
  loadServerMeta,
  loadSettings,
  saveServerMeta,
} from "../store";
import { installedBinaryPath } from "../engine/catalog";
import { startInstall } from "../engine/installer";
import * as supervisor from "../engine/supervisor";
import { applyConfigValues, extractValue } from "../configlua";
import type { ProfileId, ServerMeta, ServerPorts } from "../types";
import { dirSize, findFreePortBlock, httpError, newId, primaryLanIp, run } from "../util";

export const serversRouter = express.Router();

const KNOWN_PROFILES = new Set(["fe-7.4", "fe-8.0", "fe-1.2"]);

export async function allocateFreePorts(enableSession: boolean, enableOtc: boolean): Promise<ServerPorts> {
  const used = new Set<number>();
  for (const meta of allServerMetas()) {
    for (const value of Object.values(meta.ports)) if (value) used.add(value);
  }
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const base = await findFreePortBlock(7171 + attempt * 10, 10);
    const block = [base, base + 1, base + 2, base + 3, base + 4];
    if (block.some((port) => used.has(port))) continue;
    return {
      status: block[0],
      game: block[1],
      session: enableSession ? block[2] : null,
      otcLogin: enableOtc ? block[3] : null,
      otcGame: enableOtc ? block[4] : null,
    };
  }
  throw httpError(500, "unable to allocate free port block");
}

/** Engine-verified protocol strings per compatibility profile (quoted in config.lua). */
const PROFILE_PROTOCOL: Record<ProfileId, string> = {
  "fe-7.4": "7.4",
  "fe-8.0": "8.0",
  "fe-1.2": "10.98",
};

function writeWorldConfig(meta: ServerMeta): void {
  const configPath = path.join(serverWorld(meta.id), "config.lua");
  let lua = fs.existsSync(configPath)
    ? fs.readFileSync(configPath, "utf-8")
    : "-- Forgotten Engine configuration\n-- Managed by Forgotten Cloud\n";

  // LAN sharing: game listeners bind all interfaces and login responses
  // advertise this machine's LAN address so other devices can connect.
  const lan = loadSettings().networkAccess === "lan";
  const bindIp = lan ? "0.0.0.0" : "127.0.0.1";
  const advertisedHost = lan ? (primaryLanIp() ?? "127.0.0.1") : "127.0.0.1";

  lua = applyConfigValues(lua, {
    ip: bindIp,
    statusProtocolPort: meta.ports.status,
    gameProtocolPort: meta.ports.game,
    serverName: meta.name,
    feProfile: meta.profile,
    tibiaProtocol: PROFILE_PROTOCOL[meta.profile],
    legacyLoginEnabled: extractValue(lua, "legacyLoginEnabled").raw === "true",
    ...(meta.ports.session
      ? {
          gameSessionEnabled: true,
          gameSessionPort: meta.ports.session,
          advertisedGameSessionHost: advertisedHost,
          advertisedGameSessionPort: meta.ports.session,
        }
      : {}),
    ...(meta.ports.otcLogin && meta.ports.otcGame
      ? {
          // The engine only accepts the plain classic 740 native foundation:
          // protocol 740, numeric accounts, no encryption/checksum/challenge.
          otclientV8NativeEnabled: true,
          otclientV8LoginPort: meta.ports.otcLogin,
          otclientV8GamePort: meta.ports.otcGame,
          advertisedOtClientV8Host: advertisedHost,
          advertisedOtClientV8GamePort: meta.ports.otcGame,
          // otclientV8ProtocolVersion is deliberately NOT forced here: it belongs to the
          // operator (default 760 for visible text; 740 also works since FE accepts both
          // client versions on classic profiles). Overwriting it on every start kept
          // resetting operator choices back to 740.
          otclientV8NumericAccountIds: true,
          otclientV8LoginPacketEncryption: false,
          otclientV8ProtocolChecksum: false,
          otclientV8ChallengeOnLogin: false,
          // The native game login refuses characters without the fixture
          // ("native map initialization is not enabled"), so it is always on.
          // Operator-tuned fixture values are preserved; zeros are valid and
          // select asset-free fallbacks.
          otclientV8NativeEmptyWorldEnabled: true,
          otclientV8EmptyWorldGroundThingId: fixtureNumber(lua, "otclientV8EmptyWorldGroundThingId", 0),
          otclientV8PlayerLookType: fixtureNumber(lua, "otclientV8PlayerLookType", 0),
          otclientV8OutfitFirstLookType: fixtureNumber(lua, "otclientV8OutfitFirstLookType", 0),
          otclientV8OutfitLastLookType: fixtureNumber(lua, "otclientV8OutfitLastLookType", 0),
          otclientV8PlayerSpeed: fixtureNumber(lua, "otclientV8PlayerSpeed", 220),
          otclientV8ServerBeat: fixtureNumber(lua, "otclientV8ServerBeat", 50),
        }
      : {}),
  });
  fs.writeFileSync(configPath, lua);
}

/** Reads a numeric config key, falling back when absent or malformed. */
function fixtureNumber(lua: string, key: string, fallback: number): number {
  const raw = extractValue(lua, key).raw;
  const value = Number(raw);
  return raw !== "" && Number.isFinite(value) ? value : fallback;
}

serversRouter.get("/", (req, res) => {
  const servers = allServerMetas().map((meta) => ({
    ...meta,
    runtime: supervisor.getRuntimeSnapshot(meta.id),
    engineInstalled: installedBinaryPath(meta.engineVersion) !== null,
    diskUsageBytes: dirSize(serverWorld(meta.id)),
  }));
  res.json({ servers });
});

serversRouter.post("/", async (req, res, next) => {
  try {
    const body = req.body as {
      name?: string;
      profile?: string;
      engineVersion?: string;
      template?: string;
      motd?: string;
      enableLegacyLogin?: boolean;
      enableOtcNative?: boolean;
    };
    const name = (body.name ?? "").trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9 _-]{1,38}$/.test(name)) {
      throw httpError(400, "name must be 2-39 chars: letters, digits, spaces, - or _");
    }
    const profile = body.profile ?? "fe-7.4";
    if (!KNOWN_PROFILES.has(profile)) throw httpError(400, `unknown profile ${profile}`);
    const engineVersion = body.engineVersion?.trim() || "";
    if (!/^fe-v\d/.test(engineVersion)) throw httpError(400, "engineVersion must be an fe-vX.Y.Z tag");

    const id = newId("srv");
    const worldDir = serverWorld(id);
    const fcDir = serverMetaDir(id);
    fs.mkdirSync(worldDir, { recursive: true });
    fs.mkdirSync(fcDir, { recursive: true });

    // Provision the FE world through the engine CLI when a binary is available;
    // otherwise fall back to the panel-side skeleton writer.
    const bin = installedBinaryPath(engineVersion);
    let provisionedBy = "panel-skeleton";
    if (bin) {
      const result = await run(bin, ["init", worldDir, "--profile", profile], { timeoutMs: 60_000 });
      if (result.code === 0) provisionedBy = "forgotten-engine init";
      else fs.appendFileSync(path.join(fcDir, "provision.log"), result.stderr + result.stdout);
    }
    ensureContentSkeleton(worldDir);

    const ports = await allocateFreePorts(false, Boolean(body.enableOtcNative));
    const meta: ServerMeta = {
      id,
      name,
      profile: profile as ProfileId,
      engineVersion,
      template: body.template ?? "Empty World",
      motd: body.motd ?? "",
      ports,
      createdAt: Date.now(),
      autoBackup: { enabled: false, intervalHours: 6, keep: 10 },
      lastAutoBackupAt: null,
      plugins: {},
      aacProvisioned: false,
    };

    writeWorldConfig(meta);
    if (body.enableLegacyLogin) {
      applyConfigPatch(worldDir, { legacyLoginEnabled: true });
    }
    saveServerMeta(meta);

    if (!bin) {
      startInstall(engineVersion, "install");
    }

    res.status(201).json({
      meta,
      provisionedBy,
      engineInstallQueued: !Boolean(bin),
    });
  } catch (error) {
    next(error);
  }
});

function applyConfigPatch(worldDir: string, values: Record<string, string | number | boolean>): void {
  const file = path.join(worldDir, "config.lua");
  const lua = fs.readFileSync(file, "utf-8");
  fs.writeFileSync(file, applyConfigValues(lua, values));
}

/** Minimal stand-in for `forgotten-engine init` when no binary exists yet. */
function ensureContentSkeleton(worldDir: string): void {
  for (const dir of [
    "data/actions",
    "data/chatchannels",
    "data/creaturescripts",
    "data/events",
    "data/globalevents",
    "data/lib",
    "data/movements",
    "data/npc",
    "data/plugins",
    "data/spells",
    "data/talkactions",
    "data/weapons",
    "data/world",
  ]) {
    fs.mkdirSync(path.join(worldDir, dir), { recursive: true });
  }
  const manifest = path.join(worldDir, "data", "content.manifest");
  if (!fs.existsSync(manifest)) {
    fs.writeFileSync(
      manifest,
      "format=fe-content-v1\nsource=original-forgotten-engine-content-contract\nstatus=empty-skeleton\n",
    );
  }
  const emptyWorld = path.join(worldDir, "data", "world", "empty-world.manifest");
  if (!fs.existsSync(emptyWorld)) {
    fs.writeFileSync(
      emptyWorld,
      "format=fe-empty-world-v1\nworld=empty\nviewport_radius_x=8\nviewport_radius_y=6\nsource=original-forgotten-engine-content-contract\n",
    );
  }
  const defaultMap = path.join(worldDir, "data", "world", "forgotten.femap");
  if (!fs.existsSync(defaultMap)) {
    fs.writeFileSync(
      defaultMap,
      "# Forgotten Engine original map document\nformat=fe-map-v1\nspawn=100,100,7\n# x1,y1,x2,y2,z,groundThingId,walkable\nfill=80,80,120,120,7,0,true\n",
    );
  }
  const channels = path.join(worldDir, "data", "chatchannels", "chatchannels.xml");
  if (!fs.existsSync(channels)) {
    fs.writeFileSync(channels, '<?xml version="1.0" encoding="UTF-8"?><channels></channels>\n');
  }
}

function requireMeta(req: express.Request): ServerMeta {
  const id = String(req.params.id);
  const meta = loadServerMeta(id);
  if (!meta) throw httpError(404, `unknown server ${id}`);
  return meta;
}

serversRouter.get("/:id", (req, res) => {
  const meta = requireMeta(req);
  res.json({
    meta,
    runtime: supervisor.getRuntimeSnapshot(meta.id),
    engineInstalled: installedBinaryPath(meta.engineVersion) !== null,
  });
});

serversRouter.patch("/:id", (req, res) => {
  const meta = requireMeta(req);
  if (supervisor.isRunning(meta.id)) throw httpError(409, "stop the server before editing core settings");
  const body = req.body as Partial<Pick<ServerMeta, "name" | "motd">> & {
    ports?: Partial<ServerPorts>;
    reassignPorts?: boolean;
    engineVersion?: string;
  };
  if (body.name) meta.name = body.name.trim().slice(0, 39);
  if (body.motd !== undefined) meta.motd = String(body.motd).slice(0, 256);
  if (body.reassignPorts || body.ports) {
    meta.ports = { ...meta.ports, ...(body.ports ?? {}) };
  }
  // Engine version upgrades: the target must be an installed binary. Player data lives in
  // the world's SQLite database and survives version switches untouched.
  if (body.engineVersion !== undefined) {
    const requested = body.engineVersion.trim();
    if (!/^fe-v\d/.test(requested)) throw httpError(400, "engineVersion must be an fe-vX.Y.Z tag");
    const bin = installedBinaryPath(requested);
    if (!bin) throw httpError(409, `engine ${requested} is not installed; install it from the Engine page first`);
    meta.engineVersion = requested;
  }
  writeWorldConfig(meta);
  saveServerMeta(meta);
  res.json({
    meta,
    engineInstalled: installedBinaryPath(meta.engineVersion) !== null,
  });
});

serversRouter.delete("/:id", async (req, res, next) => {
  try {
    const meta = requireMeta(req);
    await supervisor.stopServer(meta.id);
    fs.rmSync(serverWorld(meta.id), { recursive: true, force: true });
    res.json({ deleted: meta.id });
  } catch (error) {
    next(error);
  }
});

// ---- Lifecycle ------------------------------------------------------------

serversRouter.post("/:id/start", async (req, res, next) => {
  try {
    const meta = requireMeta(req);
    const bin = installedBinaryPath(meta.engineVersion);
    if (!bin) {
      const jobId = startInstall(meta.engineVersion, "install");
      throw httpError(409, `engine ${meta.engineVersion} is not installed yet; install job ${jobId} queued`);
    }

    // Resync the panel-owned config keys so the engine always receives a
    // valid document (protocol strings, native-path switches, ports).
    writeWorldConfig(meta);

    // Legacy login requires the 1024-bit RSA key; generate it on first use.
    const worldDir = serverWorld(meta.id);
    const lua = fs.readFileSync(path.join(worldDir, "config.lua"), "utf-8");
    if (extractValue(lua, "legacyLoginEnabled").raw === "true") {
      const rawKey = extractValue(lua, "rsaPrivateKey").raw.replace(/^"|"$/g, "");
      const keyPath = path.resolve(worldDir, rawKey || "key.pem");
      if (!fs.existsSync(keyPath)) {
        supervisor.pushSystemLine(meta.id, "legacy login enabled but RSA key missing — running generate-key");
        const result = await run(bin, ["generate-key", worldDir], { timeoutMs: 60_000 });
        if (result.code !== 0) {
          throw httpError(502, `generate-key failed: ${(result.stderr || result.stdout).trim().slice(0, 300)}`);
        }
      }
    }

    await supervisor.startServer(meta.id, bin);
    if (loadSettings().networkAccess === "lan") {
      const ports = [meta.ports.status, meta.ports.game, meta.ports.otcLogin, meta.ports.otcGame]
        .filter((value): value is number => value != null);
      supervisor.pushSystemLine(
        meta.id,
        `LAN sharing on - clients connect to ${primaryLanIp() ?? "<lan-ip>"}; open TCP ${ports.join(", ")} in Windows Firewall`,
      );
    }
    res.json(supervisor.getRuntimeSnapshot(meta.id));
  } catch (error) {
    next(error);
  }
});

serversRouter.post("/:id/stop", async (req, res, next) => {
  try {
    const meta = requireMeta(req);
    await supervisor.stopServer(meta.id);
    res.json(supervisor.getRuntimeSnapshot(meta.id));
  } catch (error) {
    next(error);
  }
});

serversRouter.post("/:id/restart", async (req, res, next) => {
  try {
    const meta = requireMeta(req);
    const wasRunning = supervisor.isRunning(meta.id);
    if (wasRunning) await supervisor.stopServer(meta.id);
    const bin = installedBinaryPath(meta.engineVersion);
    if (!bin) throw httpError(409, `engine ${meta.engineVersion} is not installed`);
    await supervisor.startServer(meta.id, bin);
    res.json(supervisor.getRuntimeSnapshot(meta.id));
  } catch (error) {
    next(error);
  }
});

// ---- Console ----------------------------------------------------------------

serversRouter.get("/:id/console/history", (req, res) => {
  const id = String(req.params.id);
  const limit = Math.min(Number(req.query.limit ?? 400), supervisorHistoryCap());
  res.json({ lines: supervisor.getHistory(id, limit), runtime: supervisor.getRuntimeSnapshot(id) });
});

function supervisorHistoryCap(): number {
  return Math.max(loadSettings().consoleHistoryLines, 200);
}

serversRouter.get("/:id/console/stream", (req, res) => {
  const id = String(req.params.id);
  if (!loadServerMeta(id)) throw httpError(404, `unknown server ${id}`);
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(`event: snapshot\ndata: ${JSON.stringify(supervisor.getRuntimeSnapshot(id))}\n\n`);
  const unsubscribe = supervisor.subscribe(id, (event) => {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`);
  });
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 15_000);
  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

serversRouter.post("/:id/console/input", (req, res) => {
  const meta = requireMeta(req);
  const input = String((req.body as { input?: string }).input ?? "").slice(0, 512);
  if (!input.trim()) throw httpError(400, "empty command");

  if (input.startsWith("/")) {
    const [command, ...rest] = input.slice(1).split(/\s+/);
    switch (command) {
      case "clear":
        supervisor.clearHistory(meta.id);
        return res.json({ ok: true, handled: "clear" });
      case "broadcast": {
        const message = rest.join(" ");
        if (!message) throw httpError(400, "usage: /broadcast <message>");
        const bin = installedBinaryPath(meta.engineVersion);
        if (!bin) throw httpError(409, "engine binary is not installed yet");
        void run(bin, ["command", serverWorld(meta.id), "broadcast", message], { timeoutMs: 30_000 })
          .then((result) => {
            if (result.code !== 0) {
              supervisor.pushSystemLine(meta.id, `broadcast rejected by engine: ${result.stderr.trim() || result.stdout.trim()}`);
            }
          })
          .catch(() => undefined);
        return res.json({ ok: true, handled: "broadcast" });
      }
      // Gamemaster verbs forward to the engine's live operator bridge when the world is
      // running; otherwise they fall back to the CLI for offline-capable effects.
      case "spawn":
      case "give":
      case "tp":
      case "kick":
      case "gm":
      case "heal":
      case "playerinfo":
      case "goto":
      case "tome":
      case "status": {
        const outcome = forwardOperatorCommand(meta.id, meta.engineVersion, command, rest);
        return res.json(outcome);
      }
      default:
        throw httpError(400, `unsupported panel command /${command}; available: clear, broadcast, spawn, give, tp, kick, gm, status`);
    }
  }

  const delivered = supervisor.sendInput(meta.id, input);
  if (!delivered) throw httpError(409, "server is not running; stdin is unavailable");
  res.json({ ok: true, handled: "stdin" });
});

/** Builds the bridge JSON payload for one console GM verb, or null when the verb/arguments do
 * not map to a bridge operation. */
function operatorBridgePayload(
  command: string,
  args: string[],
): Record<string, unknown> | null {
  switch (command) {
    case "status":
      return { op: "status" };
    case "spawn": {
      const [entity, player] = args;
      if (!entity) throw httpError(400, "usage: /spawn <entity> [player]");
      return { op: "spawn", entity, player: player ?? "" };
    }
    case "give": {
      const [player, itemId, count] = args;
      if (!player || !itemId) throw httpError(400, "usage: /give <player> <item-id> [count]");
      return { op: "give", player, item_id: Number(itemId), count: Number(count ?? 1) };
    }
    case "tp": {
      const [from, to] = args;
      if (!from || !to) throw httpError(400, "usage: /tp <player> <player>");
      return { op: "tp", from, to };
    }
    case "kick": {
      const [player] = args;
      if (!player) throw httpError(400, "usage: /kick <player>");
      return { op: "kick", player };
    }
    case "heal": {
      const [player] = args;
      if (!player) throw httpError(400, "usage: /heal <player>");
      return { op: "heal", player };
    }
    case "playerinfo": {
      const [player, scope = "offline"] = args;
      if (!player) throw httpError(400, "usage: /playerinfo <player>");
      return { op: "playerinfo", player, scope };
    }
    case "goto":
    case "tome": {
      const [target] = args;
      if (!target) throw httpError(400, `usage: /${command} <player>`);
      return { op: command === "goto" ? "goto" : "tome", player: target };
    }
    case "gm": {
      const scope = args[0];
      const player = args[1];
      if ((scope !== "online" && scope !== "offline") || !player) {
        throw httpError(400, "usage: /gm <online|offline> <player> [level]");
      }
      return { op: "gm", player, scope, level: Number(args[2] ?? 1) };
    }
    default:
      return null;
  }
}

/** Sends one GM command to the live operator bridge and returns a console-visible result.
 * When no bridge port is published (server stopped), falls back to the engine CLI so
 * offline-capable commands still apply. The bridge exchange is async: the reply arrives on the
 * console feed shortly after the HTTP response returns. */
function forwardOperatorCommand(
  id: string,
  engineVersion: string,
  command: string,
  args: string[],
): { ok: boolean; handled: string; detail?: string } {
  const payload = operatorBridgePayload(command, args);
  if (!payload) throw httpError(400, `unsupported command /${command}`);

  const portFile = path.join(serverWorld(id), ".fe-operator-port");
  let portText = "";
  try {
    portText = fs.readFileSync(portFile, "utf-8").trim();
  } catch {
    /* no live server */
  }
  if (/^\d+$/.test(portText)) {
    const socket = net.createConnection({ host: "127.0.0.1", port: Number(portText) }, () => {
      socket.write(`${JSON.stringify(payload)}\n`);
    });
    let reply = "";
    socket.on("data", (chunk: Buffer) => {
      reply += chunk.toString();
      if (reply.includes("\n")) {
        socket.end();
        supervisor.pushSystemLine(
          id,
          `bridge ${command}: ${reply.trim().slice(0, 300) || "no response body"}`,
        );
      }
    });
    socket.on("error", (error: Error) => {
      supervisor.pushSystemLine(id, `bridge ${command} failed: ${error.message}`);
    });
    return { ok: true, handled: command, detail: "sent to live operator bridge" };
  }

  // Offline fallback through the engine CLI.
  const bin = installedBinaryPath(engineVersion);
  if (!bin) throw httpError(409, "engine binary is not installed and no live server to command");
  const cliArgs = ["command", serverWorld(id), command, ...args];
  void run(bin, cliArgs, { timeoutMs: 30_000 })
    .then((result) => {
      const text = (result.stdout.trim() || result.stderr.trim()).slice(0, 300);
      supervisor.pushSystemLine(id, text || `${command} completed`);
    })
    .catch(() => undefined);
  return {
    ok: true,
    handled: command,
    detail: "server offline: queued through the engine CLI",
  };
}

// ---- Engine tool bridge ------------------------------------------------------

const ALLOWED_CLI_ROOTS = new Set([
  "validate",
  "tfs-audit",
  "compatibility",
  "generate-key",
  "backup",
  "status",
]);

serversRouter.post("/:id/tools/:tool", async (req, res, next) => {
  try {
    const meta = requireMeta(req);
    const tool = String(req.params.tool);
    if (!ALLOWED_CLI_ROOTS.has(tool)) throw httpError(400, `unsupported tool ${tool}`);
    const bin = installedBinaryPath(meta.engineVersion);
    if (!bin) throw httpError(409, "engine binary is not installed yet");
    if ((tool === "generate-key" || tool === "validate") && supervisor.isRunning(meta.id)) {
      throw httpError(409, "stop the server before running this tool");
    }
    const args =
      tool === "compatibility"
        ? ["compatibility"]
        : [tool, serverWorld(meta.id)];
    const result = await run(bin, args, { timeoutMs: 120_000 });
    res.json({
      code: result.code,
      output: `${result.stdout}${result.stderr ? `\n${result.stderr}` : ""}`.trim(),
    });
  } catch (error) {
    next(error);
  }
});
