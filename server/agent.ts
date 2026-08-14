import { createHash, randomBytes } from "crypto";
import type { Request, Response } from "express";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { serverAgents, serverBackups, serverEvents, serverFiles, serverInstances, serverMetrics, serverPlayers } from "../drizzle/schema";
import { getDb, getServerAccess } from "./db";
import { sdk } from "./_core/sdk";

const agentPayload = z.object({
  status: z.enum(["offline", "starting", "online", "stopping", "failed"]),
  address: z.string().min(1).max(255).optional(),
  players: z.number().int().min(0).max(100000),
  playerLimit: z.number().int().min(1).max(100000),
  uptimeSeconds: z.number().int().min(0),
  cpuPercent: z.number().int().min(0).max(100),
  ramMb: z.number().int().min(0),
  playerRecords: z.array(z.object({ externalId: z.string().min(1).max(64), name: z.string().min(1).max(80), level: z.number().int().min(1), online: z.boolean() })).max(10000).default([]),
  files: z.array(z.object({ path: z.string().min(1).max(512), kind: z.string().min(1).max(32), sizeBytes: z.number().int().min(0), checksum: z.string().max(128).optional() })).max(10000).default([]),
  events: z.array(z.object({ kind: z.enum(["lifecycle", "command", "info", "warning", "backup", "restore"]), message: z.string().min(1).max(2000) })).max(50).default([]),
});

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function issueAgentCredential(serverId: number, userId: number, label: string) {
  const access = await getServerAccess(serverId, userId, "settings");
  if (!access.db || !access.server) throw new Error("Server unavailable");
  if (access.server.ownerId !== userId) throw new Error("Only the owner may issue an agent credential");
  const token = `fe_agent_${randomBytes(32).toString("base64url")}`;
  await access.db.insert(serverAgents).values({ serverId, label, tokenHash: hashToken(token) }).onDuplicateKeyUpdate({ set: { label, tokenHash: hashToken(token), lastSeenAt: null } });
  await access.db.insert(serverEvents).values({ serverId, actorUserId: userId, kind: "info", message: `Host agent credential rotated for ${label}.` });
  return { token };
}

async function authenticateAgent(req: Request) {
  const raw = req.headers.authorization;
  if (!raw?.startsWith("Bearer ")) return null;
  const tokenHash = hashToken(raw.slice(7));
  const db = await getDb();
  if (!db) return null;
  const agent = (await db.select().from(serverAgents).where(eq(serverAgents.tokenHash, tokenHash)).limit(1))[0];
  return agent ? { db, agent } : null;
}

export async function ingestTelemetry(req: Request, res: Response) {
  try {
    const session = await authenticateAgent(req);
    if (!session) return res.status(401).json({ error: "invalid-agent-token" });
    const payload = agentPayload.parse(req.body);
    await Promise.all([
      session.db.update(serverAgents).set({ lastSeenAt: new Date() }).where(eq(serverAgents.id, session.agent.id)),
      session.db.update(serverInstances).set({ observedStatus: payload.status, address: payload.address ?? undefined }).where(eq(serverInstances.id, session.agent.serverId)),
      session.db.insert(serverMetrics).values({ serverId: session.agent.serverId, playerCount: payload.players, playerLimit: payload.playerLimit, uptimeSeconds: payload.uptimeSeconds, cpuPercent: payload.cpuPercent, ramMb: payload.ramMb }).onDuplicateKeyUpdate({ set: { playerCount: payload.players, playerLimit: payload.playerLimit, uptimeSeconds: payload.uptimeSeconds, cpuPercent: payload.cpuPercent, ramMb: payload.ramMb, capturedAt: new Date() } }),
    ]);
    if (payload.playerRecords.length) await session.db.insert(serverPlayers).values(payload.playerRecords.map(player => ({ serverId: session.agent.serverId, ...player }))).onDuplicateKeyUpdate({ set: { name: sql`VALUES(name)`, level: sql`VALUES(level)`, online: sql`VALUES(online)`, updatedAt: new Date() } });
    if (payload.files.length) await session.db.insert(serverFiles).values(payload.files.map(file => ({ serverId: session.agent.serverId, ...file }))).onDuplicateKeyUpdate({ set: { kind: sql`VALUES(kind)`, sizeBytes: sql`VALUES(size_bytes)`, checksum: sql`VALUES(checksum)`, updatedAt: new Date() } });
    if (payload.events.length) await session.db.insert(serverEvents).values(payload.events.map(event => ({ serverId: session.agent.serverId, kind: event.kind, message: event.message })));
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ error: String(error) });
  }
}

export async function acknowledgeRestore(req: Request, res: Response) {
  try {
    const session = await authenticateAgent(req);
    if (!session) return res.status(401).json({ error: "invalid-agent-token" });
    const input = z.object({ backupId: z.number().int().positive(), success: z.boolean(), message: z.string().min(1).max(2000), reconciliation: z.record(z.string(), z.unknown()).default({}) }).parse(req.body);
    const backup = (await session.db.select().from(serverBackups).where(and(eq(serverBackups.id, input.backupId), eq(serverBackups.serverId, session.agent.serverId))).limit(1))[0];
    if (!backup || backup.restoreState !== "requested") return res.status(409).json({ error: "restore-not-requested" });
    await session.db.update(serverBackups).set({ restoreState: input.success ? "restored" : "failed", restoreReconciliation: JSON.stringify(input.reconciliation) }).where(eq(serverBackups.id, backup.id));
    await session.db.insert(serverEvents).values({ serverId: session.agent.serverId, kind: "restore", message: input.message });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ error: String(error) });
  }
}

export async function streamConsoleEvents(req: Request, res: Response) {
  const serverId = Number(req.params.serverId);
  try {
    const user = await sdk.authenticateRequest(req);
    const access = await getServerAccess(serverId, user.id, "console");
    if (!access.db || !access.allowed) return res.status(403).json({ error: "forbidden" });
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    let lastId = Number(req.query.after ?? 0);
    const flush = async () => {
      const events = await access.db!.select().from(serverEvents).where(and(eq(serverEvents.serverId, serverId), gt(serverEvents.id, lastId))).orderBy(serverEvents.id).limit(100);
      for (const event of events) { lastId = event.id; res.write(`event: console\ndata: ${JSON.stringify(event)}\n\n`); }
    };
    await flush();
    const timer = setInterval(() => { void flush().catch(() => undefined); }, 1000);
    const closer = setTimeout(() => res.end(), 25_000);
    req.on("close", () => { clearInterval(timer); clearTimeout(closer); });
  } catch {
    if (!res.headersSent) res.status(403).json({ error: "forbidden" });
    else res.end();
  }
}
