import { TRPCError } from "@trpc/server";
import { parse as parseCookie } from "cookie";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getDb, getServerAccess, getServerDetail, listAccessibleServers } from "./db";
import { automaticBackupInput, backupManifestItems, canTransition, createServerInput, hasCompleteBackupManifest, isCompatibleEngine, lifecycleInput, PERMISSION_KEYS, permissionsForRole, PLUGIN_CATALOG, requestedStatusFor, SERVER_ROLES } from "./domain";
import { membershipPermissions, pluginInstalls, publicListings, serverBackups, serverEvents, serverInstances, serverMemberships, serverMetrics, serverProfiles } from "../drizzle/schema";
import { createHeartbeatJob, updateHeartbeatJob } from "./_core/heartbeat";
import { issueAgentCredential } from "./agent";

function databaseUnavailable(): never {
  throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The control-plane database is unavailable." });
}

async function requireServerPermission(serverId: number, userId: number, permission?: (typeof PERMISSION_KEYS)[number]) {
  const access = await getServerAccess(serverId, userId, permission);
  if (!access.db) databaseUnavailable();
  if (!access.server) throw new TRPCError({ code: "NOT_FOUND", message: "Server not found." });
  if (!access.allowed) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have the required server permission." });
  return access as typeof access & { db: NonNullable<typeof access.db>; server: NonNullable<typeof access.server> };
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(options => options.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  catalog: router({
    plugins: publicProcedure.input(z.object({ search: z.string().default("") })).query(({ input }) => {
      const query = input.search.trim().toLowerCase();
      return PLUGIN_CATALOG.filter(plugin => !query || `${plugin.name} ${plugin.description} ${plugin.category}`.toLowerCase().includes(query));
    }),
  }),
  servers: router({
    list: protectedProcedure.query(({ ctx }) => listAccessibleServers(ctx.user.id)),
    get: protectedProcedure.input(z.object({ serverId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      await requireServerPermission(input.serverId, ctx.user.id);
      return getServerDetail(input.serverId);
    }),
    create: protectedProcedure.input(createServerInput).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) databaseUnavailable();
      const uuid = nanoid(18);
      const address = `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "server"}-${uuid.slice(0, 5)}.forgotten.local`;
      const insert = await db.insert(serverInstances).values({
        uuid,
        ownerId: ctx.user.id,
        name: input.name,
        gameVersion: input.gameVersion,
        mapTemplate: input.mapTemplate,
        experienceRate: input.experienceRate,
        pvpMode: input.pvpMode,
        databaseMode: input.databaseMode,
        address,
      });
      const serverId = Number(insert[0].insertId);
      await Promise.all([
        db.insert(serverMetrics).values({ serverId }),
        db.insert(serverEvents).values({ serverId, actorUserId: ctx.user.id, kind: "info", message: "Server created; waiting for a Forgotten Host Agent assignment." }),
      ]);
      return { serverId };
    }),
    lifecycle: protectedProcedure.input(lifecycleInput).mutation(async ({ ctx, input }) => {
      const { db, server } = await requireServerPermission(input.serverId, ctx.user.id, "console");
      if (!canTransition(server.observedStatus, input.action)) {
        throw new TRPCError({ code: "CONFLICT", message: `Cannot ${input.action} a server observed as ${server.observedStatus}.` });
      }
      const desiredStatus = requestedStatusFor(input.action);
      await Promise.all([
        db.update(serverInstances).set({ desiredStatus }).where(eq(serverInstances.id, server.id)),
        db.insert(serverEvents).values({ serverId: server.id, actorUserId: ctx.user.id, kind: "lifecycle", message: `${input.action.toUpperCase()} requested. A host agent must confirm the observed state.` }),
      ]);
      return { desiredStatus };
    }),
    consoleCommand: protectedProcedure.input(z.object({ serverId: z.number().int().positive(), command: z.string().trim().min(1).max(500) })).mutation(async ({ ctx, input }) => {
      const { db, server } = await requireServerPermission(input.serverId, ctx.user.id, "console");
      await db.insert(serverEvents).values({ serverId: server.id, actorUserId: ctx.user.id, kind: "command", message: input.command });
      return { accepted: true };
    }),
  }),
  plugins: router({
    install: protectedProcedure.input(z.object({ serverId: z.number().int().positive(), slug: z.string() })).mutation(async ({ ctx, input }) => {
      const plugin = PLUGIN_CATALOG.find(item => item.slug === input.slug);
      if (!plugin) throw new TRPCError({ code: "NOT_FOUND", message: "Plugin not found in the registry." });
      const { db, server } = await requireServerPermission(input.serverId, ctx.user.id, "plugins");
      if (!isCompatibleEngine(plugin.requiredEngineVersion, server.engineVersion)) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Requires Forgotten Engine ${plugin.requiredEngineVersion}.` });
      }
      await db.insert(pluginInstalls).values({ serverId: server.id, pluginSlug: plugin.slug, pluginName: plugin.name, engineVersion: plugin.requiredEngineVersion, installedBy: ctx.user.id });
      await db.insert(serverEvents).values({ serverId: server.id, actorUserId: ctx.user.id, kind: "info", message: `Plugin installed: ${plugin.name}` });
      return { installed: true };
    }),
    uninstall: protectedProcedure.input(z.object({ serverId: z.number().int().positive(), slug: z.string() })).mutation(async ({ ctx, input }) => {
      const { db, server } = await requireServerPermission(input.serverId, ctx.user.id, "plugins");
      await db.delete(pluginInstalls).where(and(eq(pluginInstalls.serverId, server.id), eq(pluginInstalls.pluginSlug, input.slug)));
      await db.insert(serverEvents).values({ serverId: server.id, actorUserId: ctx.user.id, kind: "info", message: `Plugin uninstalled: ${input.slug}` });
      return { uninstalled: true };
    }),
  }),
  agents: router({
    issueCredential: protectedProcedure.input(z.object({ serverId: z.number().int().positive(), label: z.string().trim().min(3).max(80) })).mutation(async ({ ctx, input }) => {
      try {
        return await issueAgentCredential(input.serverId, ctx.user.id, input.label);
      } catch (error) {
        throw new TRPCError({ code: "FORBIDDEN", message: String(error) });
      }
    }),
  }),
  world: router({
    update: protectedProcedure.input(z.object({ serverId: z.number().int().positive(), mapTemplate: z.enum(["global_8", "high_rate", "hardcore", "empty_world"]), experienceRate: z.number().int().min(1).max(1000), pvpMode: z.enum(["open", "optional", "hardcore"]) })).mutation(async ({ ctx, input }) => {
      const { db, server } = await requireServerPermission(input.serverId, ctx.user.id, "settings");
      await db.update(serverInstances).set({ mapTemplate: input.mapTemplate, experienceRate: input.experienceRate, pvpMode: input.pvpMode }).where(eq(serverInstances.id, server.id));
      await db.insert(serverEvents).values({ serverId: server.id, actorUserId: ctx.user.id, kind: "info", message: `World configuration updated: ${input.mapTemplate}, ${input.experienceRate}x, ${input.pvpMode} PvP.` });
      return { updated: true };
    }),
  }),
  database: router({
    setMode: protectedProcedure.input(z.object({ serverId: z.number().int().positive(), databaseMode: z.enum(["automatic_sqlite", "advanced_postgres", "advanced_mysql"]) })).mutation(async ({ ctx, input }) => {
      const { db, server } = await requireServerPermission(input.serverId, ctx.user.id, "database");
      await db.update(serverInstances).set({ databaseMode: input.databaseMode }).where(eq(serverInstances.id, server.id));
      await db.insert(serverEvents).values({ serverId: server.id, actorUserId: ctx.user.id, kind: "info", message: `Database mode changed to ${input.databaseMode}. Host-agent provisioning is required.` });
      return { updated: true };
    }),
  }),
  backups: router({
    create: protectedProcedure.input(z.object({ serverId: z.number().int().positive(), backupType: z.enum(["automatic", "manual"]).default("manual") })).mutation(async ({ ctx, input }) => {
      const { db, server } = await requireServerPermission(input.serverId, ctx.user.id, "backups");
      const manifest = backupManifestItems.join(",");
      await db.insert(serverBackups).values({ serverId: server.id, createdBy: ctx.user.id, backupType: input.backupType, manifest });
      await db.insert(serverEvents).values({ serverId: server.id, actorUserId: ctx.user.id, kind: "backup", message: `${input.backupType} backup captured with database, player data, map, config, plugins, and scripts.` });
      return { created: true, manifest };
    }),
    restore: protectedProcedure.input(z.object({ serverId: z.number().int().positive(), backupId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const { db, server } = await requireServerPermission(input.serverId, ctx.user.id, "backups");
      const backup = (await db.select().from(serverBackups).where(and(eq(serverBackups.id, input.backupId), eq(serverBackups.serverId, server.id))).limit(1))[0];
      if (!backup) throw new TRPCError({ code: "NOT_FOUND", message: "Backup not found." });
      if (backup.restoreState !== "ready") throw new TRPCError({ code: "CONFLICT", message: "Only ready backups may be restored." });
      if (!hasCompleteBackupManifest(backup.manifest)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Backup manifest is incomplete and cannot be restored." });
      await db.update(serverBackups).set({ restoreState: "requested" }).where(eq(serverBackups.id, backup.id));
      await db.insert(serverEvents).values({ serverId: server.id, actorUserId: ctx.user.id, kind: "restore", message: `Restore requested for backup #${backup.id}. A host agent must complete the restore.` });
      return { requested: true };
    }),
    configureAutomatic: protectedProcedure.input(automaticBackupInput).mutation(async ({ ctx, input }) => {
      const { db, server } = await requireServerPermission(input.serverId, ctx.user.id, "backups");
      const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
      let taskUid = server.backupCronTaskUid;
      if (taskUid) {
        await updateHeartbeatJob(taskUid, { cron: input.cron, enable: input.enabled }, sessionToken);
      } else {
        const job = await createHeartbeatJob({
          name: `forgotten-backup-${server.uuid}`,
          cron: input.cron,
          path: "/api/scheduled/automatic-backup",
          description: `Automatic backup for Forgotten Cloud server ${server.id}`,
        }, sessionToken);
        taskUid = job.taskUid;
      }
      await db.update(serverInstances).set({ backupCronTaskUid: taskUid, backupCron: input.cron, backupEnabled: input.enabled }).where(eq(serverInstances.id, server.id));
      await db.insert(serverEvents).values({ serverId: server.id, actorUserId: ctx.user.id, kind: "backup", message: `Automatic backups ${input.enabled ? "enabled" : "paused"} on ${input.cron} UTC.` });
      return { taskUid, enabled: input.enabled };
    }),
  }),
  collaboration: router({
    list: protectedProcedure.input(z.object({ serverId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const { db, server } = await requireServerPermission(input.serverId, ctx.user.id, "settings");
      const memberships = await db.select().from(serverMemberships).where(eq(serverMemberships.serverId, server.id));
      const grants = (await Promise.all(memberships.map(member => db.select().from(membershipPermissions).where(eq(membershipPermissions.membershipId, member.id))))).flat();
      return { memberships, grants };
    }),
    addMember: protectedProcedure.input(z.object({ serverId: z.number().int().positive(), userId: z.number().int().positive(), role: z.enum(SERVER_ROLES) })).mutation(async ({ ctx, input }) => {
      const { db, server } = await requireServerPermission(input.serverId, ctx.user.id, "settings");
      if (server.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner may add team members." });
      const memberInsert = await db.insert(serverMemberships).values({ serverId: server.id, userId: input.userId, role: input.role });
      const membershipId = Number(memberInsert[0].insertId);
      const grants = permissionsForRole(input.role).map(permission => ({ membershipId, permission, enabled: true }));
      if (grants.length) await db.insert(membershipPermissions).values(grants);
      return { membershipId };
    }),
    setPermission: protectedProcedure.input(z.object({ serverId: z.number().int().positive(), membershipId: z.number().int().positive(), permission: z.enum(PERMISSION_KEYS), enabled: z.boolean() })).mutation(async ({ ctx, input }) => {
      const { db, server } = await requireServerPermission(input.serverId, ctx.user.id, "settings");
      if (server.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner may change team permissions." });
      await db.insert(membershipPermissions).values({ membershipId: input.membershipId, permission: input.permission, enabled: input.enabled }).onDuplicateKeyUpdate({ set: { enabled: input.enabled } });
      return { updated: true };
    }),
  }),
  profiles: router({
    capture: protectedProcedure.input(z.object({ serverId: z.number().int().positive(), name: z.string().trim().min(3).max(80) })).mutation(async ({ ctx, input }) => {
      const { db, server } = await requireServerPermission(input.serverId, ctx.user.id, "settings");
      const installs = await db.select().from(pluginInstalls).where(eq(pluginInstalls.serverId, server.id));
      const snapshot = JSON.stringify({ engineVersion: server.engineVersion, gameVersion: server.gameVersion, mapTemplate: server.mapTemplate, experienceRate: server.experienceRate, pvpMode: server.pvpMode, databaseMode: server.databaseMode, plugins: installs.map(item => item.pluginSlug), dbSchema: 1 });
      await db.insert(serverProfiles).values({ serverId: server.id, createdBy: ctx.user.id, name: input.name, snapshot });
      return { saved: true };
    }),
    clone: protectedProcedure.input(z.object({ profileId: z.number().int().positive(), name: z.string().trim().min(3).max(80) })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) databaseUnavailable();
      const profile = (await db.select().from(serverProfiles).where(eq(serverProfiles.id, input.profileId)).limit(1))[0];
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Profile not found." });
      const source = (await db.select().from(serverInstances).where(eq(serverInstances.id, profile.serverId)).limit(1))[0];
      if (!source || source.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Only a profile owner may clone it." });
      const uuid = nanoid(18);
      const result = await db.insert(serverInstances).values({ uuid, ownerId: ctx.user.id, name: input.name, gameVersion: source.gameVersion, engineVersion: source.engineVersion, mapTemplate: source.mapTemplate, experienceRate: source.experienceRate, pvpMode: source.pvpMode, databaseMode: source.databaseMode, address: `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${uuid.slice(0, 5)}.forgotten.local` });
      const serverId = Number(result[0].insertId);
      await Promise.all([db.insert(serverMetrics).values({ serverId }), db.insert(serverEvents).values({ serverId, actorUserId: ctx.user.id, kind: "info", message: `Cloned from profile ${profile.name}.` })]);
      return { serverId };
    }),
  }),
  discovery: router({
    list: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      const listings = await db.select().from(publicListings).where(eq(publicListings.enabled, true));
      return Promise.all(listings.map(async listing => {
        const server = (await db.select().from(serverInstances).where(eq(serverInstances.id, listing.serverId)).limit(1))[0];
        const metric = server ? (await db.select().from(serverMetrics).where(eq(serverMetrics.serverId, server.id)).limit(1))[0] ?? null : null;
        return server ? { listing, server, metric } : null;
      })).then(items => items.filter(Boolean));
    }),
    setOptIn: protectedProcedure.input(z.object({ serverId: z.number().int().positive(), enabled: z.boolean(), description: z.string().trim().max(240).optional() })).mutation(async ({ ctx, input }) => {
      const { db, server } = await requireServerPermission(input.serverId, ctx.user.id, "settings");
      const existing = (await db.select().from(publicListings).where(eq(publicListings.serverId, server.id)).limit(1))[0];
      if (existing) await db.update(publicListings).set({ enabled: input.enabled, description: input.description ?? null }).where(eq(publicListings.id, existing.id));
      else await db.insert(publicListings).values({ serverId: server.id, enabled: input.enabled, description: input.description ?? null });
      return { enabled: input.enabled };
    }),
  }),
});

export type AppRouter = typeof appRouter;
