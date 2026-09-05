//! Client-fork adapters for the packaged-client pipeline.
//!
//! The packaging pipeline (world → protocol → client build → asset slot → connection files →
//! zip) is deliberately not hardcoded to one client fork: every fork registers an adapter here
//! describing how its packages are assembled. Add new forks by appending to FORKS.

export interface ConnectionInfo {
  /** Host the packaged client should connect to (panel-resolved, operator-overridable). */
  host: string;
  /** World game port. */
  port: number;
  /** Classic protocol version the world speaks (e.g. 740, 760). */
  protocol: number;
  /** Human-readable world name, for forks that display it. */
  worldName: string;
}

export interface ClientForkAdapter {
  id: string;
  label: string;
  /** Directory (inside the packaged client) where the protocol's .spr/.dat slot belongs. */
  assetDir(protocol: number): string;
  /** File names expected inside assetDir, keyed by asset kind. */
  assetFileNames: Record<"spr" | "dat", string>;
  /**
   * Connection files written into the package root so a fresh install points at the world.
   * For the Forgotten Client fork this is a seed config.otml: g_configs.loadSettings
   * ("/config.otml") picks it up on first launch, before the user directory has a config.
   */
  connectionFiles(info: ConnectionInfo): Record<string, string>;
}

export const FORKS: Record<string, ClientForkAdapter> = {
  "forgotten-client": {
    id: "forgotten-client",
    label: "Forgotten Client",
    assetDir: (protocol) => `data/things/${protocol}`,
    assetFileNames: { spr: "Tibia.spr", dat: "Tibia.dat" },
    connectionFiles(info) {
      return {
        "config.otml": [
          `host: ${info.host}`,
          `port: ${info.port}`,
          `client-version: ${info.protocol}`,
        ].join("\n"),
      };
    },
  },
};

export function forkAdapter(id: string): ClientForkAdapter | null {
  return FORKS[id] ?? null;
}
