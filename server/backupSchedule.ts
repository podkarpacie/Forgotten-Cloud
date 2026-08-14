import type { Request, Response } from "express";
import { and, desc, eq, gt } from "drizzle-orm";
import { getDb } from "./db";
import { backupManifestItems } from "./domain";
import { serverBackups, serverEvents, serverInstances } from "../drizzle/schema";
import { sdk } from "./_core/sdk";

/**
 * Managed HTTP schedule callback. The platform identifies the scheduled job in
 * the authenticated request, so no caller-supplied server identifier is trusted.
 */
export async function runAutomaticBackup(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "database-unavailable" });
    const server = (await db.select().from(serverInstances).where(eq(serverInstances.backupCronTaskUid, user.taskUid)).limit(1))[0];
    if (!server || !server.backupEnabled) return res.json({ ok: true, skipped: "orphan-or-disabled" });

    const recent = (await db.select().from(serverBackups).where(and(
      eq(serverBackups.serverId, server.id),
      eq(serverBackups.backupType, "automatic"),
      gt(serverBackups.createdAt, new Date(Date.now() - 45_000)),
    )).orderBy(desc(serverBackups.createdAt)).limit(1))[0];
    if (recent) return res.json({ ok: true, skipped: "duplicate-retry", backupId: recent.id });

    const manifest = backupManifestItems.join(",");
    const inserted = await db.insert(serverBackups).values({ serverId: server.id, backupType: "automatic", manifest });
    const backupId = Number(inserted[0].insertId);
    await db.insert(serverEvents).values({
      serverId: server.id,
      kind: "backup",
      message: `Automatic backup #${backupId} requested. A host agent must retain the artifact bundle.`,
    });
    return res.json({ ok: true, backupId });
  } catch (error) {
    console.error("[automatic-backup] callback failed", error);
    return res.status(500).json({
      error: String(error),
      context: { url: req.originalUrl },
      timestamp: new Date().toISOString(),
    });
  }
}
