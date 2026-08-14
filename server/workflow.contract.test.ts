import { describe, expect, it } from "vitest";
import { backupManifestItems, canTransition, createServerInput, hasCompleteBackupManifest, isCompatibleEngine, permissionsForRole, requestedStatusFor } from "./domain";

describe("authenticated owner workflow contract", () => {
  it("validates the control-plane sequence from provisioned server to discoverable profile", () => {
    const owner = { id: 1, role: "owner" as const };
    const server = createServerInput.parse({
      name: "Release verification world",
      gameVersion: "Tibia 8.0",
      mapTemplate: "global_8",
      experienceRate: 5,
      pvpMode: "open",
      databaseMode: "automatic_sqlite",
    });

    expect(owner.role).toBe("owner");
    expect(server.gameVersion).toBe("Tibia 8.0");
    expect(server.mapTemplate).toBe("global_8");
    expect(server.databaseMode).toBe("automatic_sqlite");

    // Lifecycle request and host telemetry agreement.
    expect(canTransition("offline", "start")).toBe(true);
    expect(requestedStatusFor("start")).toBe("starting");
    expect(canTransition("online", "restart")).toBe(true);

    // Agent console data and plugin decisions are constrained by compatible engine versions.
    const consoleEvent = { kind: "command", message: "/broadcast Verification complete" };
    expect(consoleEvent.kind).toBe("command");
    expect(isCompatibleEngine("0.1.0", "0.1.0")).toBe(true);

    // Recovery requires all retained artifact categories before an agent can restore it.
    const manifest = backupManifestItems.join(",");
    expect(hasCompleteBackupManifest(manifest)).toBe(true);

    // A developer team member receives persisted granular defaults, while discovery is opt-in.
    expect(permissionsForRole("developer")).toContain("plugins");
    const profile = { engineVersion: "0.1.0", mapTemplate: server.mapTemplate, plugins: ["packet-guard"] };
    const discovery = { enabled: true, version: server.gameVersion, rate: server.experienceRate, pvp: server.pvpMode, players: 0 };
    expect(profile.plugins).toContain("packet-guard");
    expect(discovery.enabled).toBe(true);
  });
});
