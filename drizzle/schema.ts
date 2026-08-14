import {
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const serverRoles = ["owner", "developer", "moderator", "mapper", "GM"] as const;
export const serverPermissions = ["console", "players", "plugins", "scripts", "database", "backups", "settings"] as const;
export const serverTemplates = ["global_8", "high_rate", "hardcore", "empty_world"] as const;
export const serverStatuses = ["offline", "starting", "online", "stopping", "failed"] as const;
export const databaseModes = ["automatic_sqlite", "advanced_postgres", "advanced_mysql"] as const;
export const pvpModes = ["open", "optional", "hardcore"] as const;

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const serverInstances = mysqlTable(
  "server_instances",
  {
    id: int("id").autoincrement().primaryKey(),
    uuid: varchar("uuid", { length: 48 }).notNull().unique(),
    ownerId: int("owner_id").notNull().references(() => users.id),
    name: varchar("name", { length: 80 }).notNull(),
    gameVersion: varchar("game_version", { length: 16 }).notNull().default("Tibia 8.0"),
    engineVersion: varchar("engine_version", { length: 24 }).notNull().default("0.1.0"),
    mapTemplate: mysqlEnum("map_template", serverTemplates).notNull(),
    experienceRate: int("experience_rate").notNull().default(1),
    pvpMode: mysqlEnum("pvp_mode", pvpModes).notNull().default("open"),
    databaseMode: mysqlEnum("database_mode", databaseModes).notNull().default("automatic_sqlite"),
    desiredStatus: mysqlEnum("desired_status", serverStatuses).notNull().default("offline"),
    observedStatus: mysqlEnum("observed_status", serverStatuses).notNull().default("offline"),
    backupCronTaskUid: varchar("backup_cron_task_uid", { length: 65 }).unique(),
    backupCron: varchar("backup_cron", { length: 64 }),
    backupEnabled: boolean("backup_enabled").notNull().default(false),
    address: varchar("address", { length: 255 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("server_owner_idx").on(table.ownerId)],
);

export const serverMetrics = mysqlTable(
  "server_metrics",
  {
    id: int("id").autoincrement().primaryKey(),
    serverId: int("server_id").notNull().references(() => serverInstances.id),
    playerCount: int("player_count").notNull().default(0),
    playerLimit: int("player_limit").notNull().default(100),
    uptimeSeconds: int("uptime_seconds").notNull().default(0),
    cpuPercent: int("cpu_percent").notNull().default(0),
    ramMb: int("ram_mb").notNull().default(0),
    capturedAt: timestamp("captured_at").defaultNow().notNull(),
  },
  table => [uniqueIndex("server_metrics_server_unique").on(table.serverId)],
);

export const serverAgents = mysqlTable(
  "server_agents",
  {
    id: int("id").autoincrement().primaryKey(),
    serverId: int("server_id").notNull().references(() => serverInstances.id).unique(),
    label: varchar("label", { length: 80 }).notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    lastSeenAt: timestamp("last_seen_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const serverPlayers = mysqlTable(
  "server_players",
  {
    id: int("id").autoincrement().primaryKey(),
    serverId: int("server_id").notNull().references(() => serverInstances.id),
    externalId: varchar("external_id", { length: 64 }).notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    level: int("level").notNull().default(1),
    online: boolean("online").notNull().default(false),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("server_player_unique").on(table.serverId, table.externalId)],
);

export const serverFiles = mysqlTable(
  "server_files",
  {
    id: int("id").autoincrement().primaryKey(),
    serverId: int("server_id").notNull().references(() => serverInstances.id),
    path: varchar("path", { length: 512 }).notNull(),
    kind: varchar("kind", { length: 32 }).notNull(),
    sizeBytes: int("size_bytes").notNull().default(0),
    checksum: varchar("checksum", { length: 128 }),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("server_file_unique").on(table.serverId, table.path)],
);

export const serverEvents = mysqlTable(
  "server_events",
  {
    id: int("id").autoincrement().primaryKey(),
    serverId: int("server_id").notNull().references(() => serverInstances.id),
    actorUserId: int("actor_user_id").references(() => users.id),
    kind: mysqlEnum("kind", ["lifecycle", "command", "info", "warning", "backup", "restore"]).notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  table => [index("server_event_idx").on(table.serverId, table.createdAt)],
);

export const serverMemberships = mysqlTable(
  "server_memberships",
  {
    id: int("id").autoincrement().primaryKey(),
    serverId: int("server_id").notNull().references(() => serverInstances.id),
    userId: int("user_id").notNull().references(() => users.id),
    role: mysqlEnum("role", serverRoles).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  table => [uniqueIndex("server_member_unique").on(table.serverId, table.userId)],
);

export const membershipPermissions = mysqlTable(
  "membership_permissions",
  {
    id: int("id").autoincrement().primaryKey(),
    membershipId: int("membership_id").notNull().references(() => serverMemberships.id),
    permission: mysqlEnum("permission", serverPermissions).notNull(),
    enabled: boolean("enabled").notNull().default(false),
  },
  table => [uniqueIndex("membership_permission_unique").on(table.membershipId, table.permission)],
);

export const pluginInstalls = mysqlTable(
  "plugin_installs",
  {
    id: int("id").autoincrement().primaryKey(),
    serverId: int("server_id").notNull().references(() => serverInstances.id),
    pluginSlug: varchar("plugin_slug", { length: 64 }).notNull(),
    pluginName: varchar("plugin_name", { length: 120 }).notNull(),
    engineVersion: varchar("engine_version", { length: 24 }).notNull(),
    installedBy: int("installed_by").notNull().references(() => users.id),
    installedAt: timestamp("installed_at").defaultNow().notNull(),
  },
  table => [uniqueIndex("server_plugin_unique").on(table.serverId, table.pluginSlug)],
);

export const serverBackups = mysqlTable(
  "server_backups",
  {
    id: int("id").autoincrement().primaryKey(),
    serverId: int("server_id").notNull().references(() => serverInstances.id),
    createdBy: int("created_by").references(() => users.id),
    backupType: mysqlEnum("backup_type", ["automatic", "manual"]).notNull(),
    restoreState: mysqlEnum("restore_state", ["ready", "requested", "restored", "failed"]).notNull().default("ready"),
    manifest: text("manifest").notNull(),
    restoreReconciliation: text("restore_reconciliation"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  table => [index("server_backup_idx").on(table.serverId, table.createdAt)],
);

export const serverProfiles = mysqlTable(
  "server_profiles",
  {
    id: int("id").autoincrement().primaryKey(),
    serverId: int("server_id").notNull().references(() => serverInstances.id),
    createdBy: int("created_by").notNull().references(() => users.id),
    name: varchar("name", { length: 80 }).notNull(),
    snapshot: text("snapshot").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  table => [index("server_profile_idx").on(table.serverId, table.createdAt)],
);

export const publicListings = mysqlTable(
  "public_listings",
  {
    id: int("id").autoincrement().primaryKey(),
    serverId: int("server_id").notNull().references(() => serverInstances.id),
    enabled: boolean("enabled").notNull().default(false),
    description: varchar("description", { length: 240 }),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("public_listing_server_unique").on(table.serverId)],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
