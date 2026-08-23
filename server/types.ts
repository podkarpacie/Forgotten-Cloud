export type ProfileId = "fe-7.4" | "fe-8.0" | "fe-1.2";

export interface ProfileInfo {
  id: ProfileId;
  label: string;
  protocol: number;
  reference: string;
  blurb: string;
  experimental?: boolean;
}

export interface ServerPorts {
  status: number;
  game: number;
  session: number | null;
  otcLogin: number | null;
  otcGame: number | null;
}

export interface AutoBackupSettings {
  enabled: boolean;
  intervalHours: number;
  keep: number;
}

export type LifecycleStatus =
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "error";

export interface PluginState {
  enabled: boolean;
  installedAt: number;
}

export interface ServerMeta {
  id: string;
  name: string;
  profile: ProfileId;
  engineVersion: string;
  template: string;
  motd: string;
  ports: ServerPorts;
  createdAt: number;
  autoBackup: AutoBackupSettings;
  lastAutoBackupAt: number | null;
  plugins: Record<string, PluginState>;
  aacProvisioned: boolean;
}

export interface EngineInstallInfo {
  version: string;
  binPath: string;
  installedAt: number;
  source: "cache" | "release" | "source-build" | "local-copy";
}

export interface PanelSettings {
  repoOwner: string;
  repoName: string;
  engineSourcePath: string;
  preferredMethod: "auto" | "release" | "source" | "local";
  maxBackupsPerServer: number;
  localEngineBinary: string;
  consoleHistoryLines: number;
}

export const DEFAULT_SETTINGS: PanelSettings = {
  repoOwner: "podkarpacie",
  repoName: "Forgotten-Engine",
  engineSourcePath: "",
  preferredMethod: "auto",
  maxBackupsPerServer: 25,
  localEngineBinary: "",
  consoleHistoryLines: 2000,
};

export interface ConsoleLine {
  seq: number;
  stream: "out" | "err" | "system";
  text: string;
  time: number;
}

export interface BackupEntry {
  file: string;
  size: number;
  createdAt: number;
  origin: "manual" | "automatic" | "pre-restore" | "unknown";
}

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
  modified: number;
}

export interface EngineJob {
  id: string;
  kind: string;
  version?: string;
  status: "queued" | "running" | "done" | "failed";
  steps: { time: number; message: string }[];
  result?: { binPath?: string; source?: string; error?: string };
  startedAt: number;
}
