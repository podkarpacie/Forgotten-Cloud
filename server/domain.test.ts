import { describe, expect, it } from "vitest";
import { backupManifestItems, canTransition, createServerInput, GAME_VERSION, hasCompleteBackupManifest, isCompatibleEngine, isSixFieldCron, MAP_TEMPLATES, PERMISSION_KEYS, permissionsForRole, SERVER_ROLES } from "./domain";

describe("Forgotten Cloud domain constraints", () => {
  it("accepts only Tibia 8.0 and the four required templates", () => {
    const valid = createServerInput.safeParse({ name: "Aegis", gameVersion: GAME_VERSION, mapTemplate: "global_8", experienceRate: 1, pvpMode: "open", databaseMode: "automatic_sqlite" });
    expect(valid.success).toBe(true);
    expect(createServerInput.safeParse({ ...valid.data, gameVersion: "Tibia 7.4" }).success).toBe(false);
    expect(MAP_TEMPLATES.map(template => template.label)).toEqual(["Global 8.0", "High Rate", "Hardcore", "Empty World"]);
  });

  it("uses the exact collaboration role and permission vocabulary", () => {
    expect(SERVER_ROLES).toEqual(["owner", "developer", "moderator", "mapper", "GM"]);
    expect(PERMISSION_KEYS).toEqual(["console", "players", "plugins", "scripts", "database", "backups", "settings"]);
    expect(permissionsForRole("owner")).toEqual(PERMISSION_KEYS);
    expect(permissionsForRole("GM")).toEqual(["console", "players"]);
  });

  it("permits only safe lifecycle requests", () => {
    expect(canTransition("offline", "start")).toBe(true);
    expect(canTransition("online", "restart")).toBe(true);
    expect(canTransition("offline", "stop")).toBe(false);
  });

  it("requires compatible plugin versions and complete restore manifests", () => {
    expect(isCompatibleEngine("0.1.0", "0.1.0")).toBe(true);
    expect(isCompatibleEngine("0.2.0", "0.1.0")).toBe(false);
    expect(hasCompleteBackupManifest(backupManifestItems.join(","))).toBe(true);
    expect(hasCompleteBackupManifest("database,map,config")).toBe(false);
  });

  it("accepts only managed six-field cron expressions for automatic backups", () => {
    expect(isSixFieldCron("0 0 3 * * *")).toBe(true);
    expect(isSixFieldCron("0 3 * * *")).toBe(false);
    expect(isSixFieldCron("every night")).toBe(false);
  });
});
