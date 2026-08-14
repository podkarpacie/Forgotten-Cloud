import { and, desc, eq, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, serverInstances, serverMetrics, serverMemberships, membershipPermissions, serverEvents, pluginInstalls, serverBackups, serverProfiles, publicListings, serverPlayers, serverFiles } from "../drizzle/schema";
import { ENV } from "./_core/env";
import type { PermissionKey } from "./domain";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId, lastSignedIn: new Date() };
  const updateSet: Record<string, unknown> = { lastSignedIn: new Date() };
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  values.role = user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user");
  updateSet.role = values.role;
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getServerAccess(serverId: number, userId: number, permission?: PermissionKey) {
  const db = await getDb();
  if (!db) return { db: null, server: null, membership: null, allowed: false };
  const server = (await db.select().from(serverInstances).where(eq(serverInstances.id, serverId)).limit(1))[0] ?? null;
  if (!server) return { db, server: null, membership: null, allowed: false };
  if (server.ownerId === userId) return { db, server, membership: null, allowed: true };
  const membership = (await db.select().from(serverMemberships).where(and(eq(serverMemberships.serverId, serverId), eq(serverMemberships.userId, userId))).limit(1))[0] ?? null;
  if (!membership) return { db, server, membership: null, allowed: false };
  if (!permission) return { db, server, membership, allowed: true };
  const grant = (await db.select().from(membershipPermissions).where(and(eq(membershipPermissions.membershipId, membership.id), eq(membershipPermissions.permission, permission))).limit(1))[0];
  return { db, server, membership, allowed: Boolean(grant?.enabled) };
}

export async function listAccessibleServers(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const owned = await db.select().from(serverInstances).where(eq(serverInstances.ownerId, userId));
  const memberships = await db.select().from(serverMemberships).where(eq(serverMemberships.userId, userId));
  const memberServerIds = memberships.map(membership => membership.serverId);
  const shared = memberServerIds.length
    ? await db.select().from(serverInstances).where(or(...memberServerIds.map(id => eq(serverInstances.id, id))))
    : [];
  const unique = [...owned, ...shared].filter((server, index, array) => array.findIndex(item => item.id === server.id) === index);
  return Promise.all(unique.map(async server => {
    const metric = (await db.select().from(serverMetrics).where(eq(serverMetrics.serverId, server.id)).limit(1))[0] ?? null;
    return { ...server, metric };
  }));
}

export async function getServerDetail(serverId: number) {
  const db = await getDb();
  if (!db) return null;
  const server = (await db.select().from(serverInstances).where(eq(serverInstances.id, serverId)).limit(1))[0];
  if (!server) return null;
  const [metric, events, installs, backups, profiles, memberships, listing, players, files] = await Promise.all([
    db.select().from(serverMetrics).where(eq(serverMetrics.serverId, serverId)).limit(1),
    db.select().from(serverEvents).where(eq(serverEvents.serverId, serverId)).orderBy(desc(serverEvents.createdAt)).limit(100),
    db.select().from(pluginInstalls).where(eq(pluginInstalls.serverId, serverId)),
    db.select().from(serverBackups).where(eq(serverBackups.serverId, serverId)).orderBy(desc(serverBackups.createdAt)),
    db.select().from(serverProfiles).where(eq(serverProfiles.serverId, serverId)).orderBy(desc(serverProfiles.createdAt)),
    db.select().from(serverMemberships).where(eq(serverMemberships.serverId, serverId)),
    db.select().from(publicListings).where(eq(publicListings.serverId, serverId)).limit(1),
    db.select().from(serverPlayers).where(eq(serverPlayers.serverId, serverId)).orderBy(desc(serverPlayers.level)),
    db.select().from(serverFiles).where(eq(serverFiles.serverId, serverId)).orderBy(serverFiles.path),
  ]);
  return { server, metric: metric[0] ?? null, events, installs, backups, profiles, memberships, listing: listing[0] ?? null, players, files };
}
