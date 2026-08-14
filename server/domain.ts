import { z } from "zod";

export const GAME_VERSION = "Tibia 8.0" as const;
export const SERVER_ROLES = ["owner", "developer", "moderator", "mapper", "GM"] as const;
export const PERMISSION_KEYS = ["console", "players", "plugins", "scripts", "database", "backups", "settings"] as const;
export const MAP_TEMPLATES = [
  { value: "global_8", label: "Global 8.0" },
  { value: "high_rate", label: "High Rate" },
  { value: "hardcore", label: "Hardcore" },
  { value: "empty_world", label: "Empty World" },
] as const;
export const PVP_MODES = [
  { value: "open", label: "Open PvP" },
  { value: "optional", label: "Optional PvP" },
  { value: "hardcore", label: "Hardcore PvP" },
] as const;

export const createServerInput = z.object({
  name: z.string().trim().min(3).max(80),
  gameVersion: z.literal(GAME_VERSION),
  mapTemplate: z.enum(["global_8", "high_rate", "hardcore", "empty_world"]),
  experienceRate: z.number().int().min(1).max(1000),
  pvpMode: z.enum(["open", "optional", "hardcore"]),
  databaseMode: z.enum(["automatic_sqlite", "advanced_postgres", "advanced_mysql"]),
});

export const lifecycleInput = z.object({
  serverId: z.number().int().positive(),
  action: z.enum(["start", "stop", "restart"]),
});

export const automaticBackupInput = z.object({
  serverId: z.number().int().positive(),
  cron: z.string().refine(isSixFieldCron, "Use a six-field UTC cron expression."),
  enabled: z.boolean(),
});

export const backupManifestItems = ["database", "player data", "map", "config", "plugins", "scripts"] as const;

export type ServerRole = (typeof SERVER_ROLES)[number];
export type PermissionKey = (typeof PERMISSION_KEYS)[number];
export type ServerStatus = "offline" | "starting" | "online" | "stopping" | "failed";

const defaultPermissions: Record<ServerRole, PermissionKey[]> = {
  owner: [...PERMISSION_KEYS],
  developer: ["console", "players", "plugins", "scripts", "backups"],
  moderator: ["console", "players"],
  mapper: ["scripts", "backups"],
  GM: ["console", "players"],
};

export function permissionsForRole(role: ServerRole): PermissionKey[] {
  return defaultPermissions[role];
}

export function canTransition(status: ServerStatus, action: "start" | "stop" | "restart"): boolean {
  if (action === "start") return status === "offline" || status === "failed";
  if (action === "stop") return status === "online" || status === "starting";
  return status === "online";
}

export function requestedStatusFor(action: "start" | "stop" | "restart"): ServerStatus {
  return action === "start" ? "starting" : "stopping";
}

export function labelForTemplate(value: (typeof MAP_TEMPLATES)[number]["value"]): string {
  return MAP_TEMPLATES.find(template => template.value === value)?.label ?? value;
}

export function isCompatibleEngine(requiredVersion: string, serverVersion: string): boolean {
  return requiredVersion === serverVersion;
}

export function hasCompleteBackupManifest(manifest: string): boolean {
  const parsed = manifest.split(",").map(item => item.trim());
  return backupManifestItems.every(item => parsed.includes(item));
}

export function isSixFieldCron(expression: string): boolean {
  const fields = expression.trim().split(/\s+/);
  return fields.length === 6 && fields.every(field => /^[\d*/,-]+$/.test(field));
}

export const PLUGIN_CATALOG = [
  {
    slug: "packet-guard",
    name: "Packet Guard",
    description: "Validation rules and audit hooks for the protocol boundary.",
    requiredEngineVersion: "0.1.0",
    category: "Security",
  },
  {
    slug: "spawn-validator",
    name: "Spawn Validator",
    description: "Preflight checks for creature spawns and invalid tile positions.",
    requiredEngineVersion: "0.1.0",
    category: "Diagnostics",
  },
  {
    slug: "lua-diagnostics",
    name: "Lua Diagnostics",
    description: "Reports unsupported entries in the evolving TFS Lua compatibility matrix.",
    requiredEngineVersion: "0.1.0",
    category: "Developer tools",
  },
] as const;
