export type LifecycleStatus = "stopped" | "starting" | "running" | "stopping" | "error";

export interface ServerPorts {
  status: number;
  game: number;
  session: number | null;
  otcLogin: number | null;
  otcGame: number | null;
}

export interface AutoBackup {
  enabled: boolean;
  intervalHours: number;
  keep: number;
}

export interface ServerMeta {
  id: string;
  name: string;
  profile: string;
  engineVersion: string;
  template: string;
  motd: string;
  ports: ServerPorts;
  createdAt: number;
  autoBackup: AutoBackup;
  lastAutoBackupAt: number | null;
  plugins: Record<string, { enabled: boolean; installedAt: number }>;
  aacProvisioned: boolean;
}

export interface RuntimeSnapshot {
  status: LifecycleStatus;
  pid: number | null;
  startedAt: number | null;
  uptimeMs: number;
}

export interface ServerSummary extends ServerMeta {
  runtime: RuntimeSnapshot;
  engineInstalled: boolean;
  diskUsageBytes: number;
}

export interface ProfileInfo {
  id: string;
  label: string;
  protocol: number;
  reference: string;
  blurb: string;
  experimental?: boolean;
}

export interface VersionCatalog {
  versions: { tag: string; installed: boolean }[];
  source: "github" | "cache" | "fallback";
  fetchedAt: number;
  latestTag?: string | null;
}

export interface ConsoleLine {
  seq: number;
  stream: "out" | "err" | "system";
  text: string;
  time: number;
}

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
  modified: number;
}

export interface BackupEntry {
  file: string;
  size: number;
  createdAt: number;
  origin: "manual" | "automatic" | "pre-restore" | "unknown";
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

export interface PanelSettings {
  repoOwner: string;
  repoName: string;
  engineSourcePath: string;
  localEngineBinary: string;
  preferredMethod: "auto" | "release" | "source" | "local";
  maxBackupsPerServer: number;
  consoleHistoryLines: number;
  networkAccess: "loopback" | "lan";
}
