import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { serverMetaDir, serverWorld } from "../paths";
import { httpError, newId } from "../util";
import type { ConsoleLine, LifecycleStatus } from "../types";

interface SupervisorEntry {
  status: LifecycleStatus;
  pid: number | null;
  child: ChildProcess | null;
  startedAt: number | null;
  runId: string | null;
  logFile: string | null;
  history: ConsoleLine[];
  seq: number;
  emitter: EventEmitter;
  lastExit: { code: number | null; signal: string | null; at: number } | null;
}

const entries = new Map<string, SupervisorEntry>();

function entryFor(id: string): SupervisorEntry {
  let entry = entries.get(id);
  if (!entry) {
    entry = {
      status: "stopped",
      pid: null,
      child: null,
      startedAt: null,
      runId: null,
      logFile: null,
      history: [],
      seq: 0,
      emitter: new EventEmitter(),
      lastExit: null,
    };
    entry.emitter.setMaxListeners(200);
    entries.set(id, entry);
  }
  return entry;
}

export function getStatus(id: string): LifecycleStatus {
  return entryFor(id).status;
}

export function getRuntimeSnapshot(id: string): {
  status: LifecycleStatus;
  pid: number | null;
  startedAt: number | null;
  uptimeMs: number;
  lastExit: SupervisorEntry["lastExit"];
} {
  const entry = entryFor(id);
  return {
    status: entry.status,
    pid: entry.pid,
    startedAt: entry.startedAt,
    uptimeMs: entry.status === "running" && entry.startedAt ? Date.now() - entry.startedAt : 0,
    lastExit: entry.lastExit,
  };
}

export function getHistory(id: string, limit = 500): ConsoleLine[] {
  const history = entryFor(id).history;
  return history.slice(Math.max(0, history.length - limit));
}

export function clearHistory(id: string): void {
  const entry = entryFor(id);
  entry.history = [];
  pushLine(entry, "system", "console cleared by operator");
}

/** Panel-side system announcements into the console feed. */
export function pushSystemLine(id: string, text: string): void {
  pushLine(entryFor(id), "system", text);
}

function pushLine(entry: SupervisorEntry, stream: ConsoleLine["stream"], text: string): void {
  entry.seq += 1;
  const line: ConsoleLine = { seq: entry.seq, stream, text, time: Date.now() };
  entry.history.push(line);
  if (entry.history.length > 2000) entry.history.splice(0, entry.history.length - 2000);
  entry.emitter.emit("line", line);
}

export function subscribe(
  id: string,
  listener: (event: { type: "line" | "status"; payload: unknown }) => void,
): () => void {
  const entry = entryFor(id);
  const onLine = (payload: unknown) => listener({ type: "line", payload });
  const onStatus = (payload: unknown) => listener({ type: "status", payload });
  entry.emitter.on("line", onLine);
  entry.emitter.on("status", onStatus);
  return () => {
    entry.emitter.off("line", onLine);
    entry.emitter.off("status", onStatus);
  };
}

function setStatus(entry: SupervisorEntry, id: string, status: LifecycleStatus): void {
  entry.status = status;
  entry.emitter.emit("status", getRuntimeSnapshot(id));
}

function pruneRunLogs(id: string): void {
  const logsDir = path.join(serverMetaDir(id), "logs");
  try {
    const files = fs
      .readdirSync(logsDir)
      .filter((name) => name.endsWith(".log"))
      .sort()
      .reverse();
    for (const stale of files.slice(20)) fs.rmSync(path.join(logsDir, stale), { force: true });
  } catch {
    /* no logs yet */
  }
}

export async function startServer(
  id: string,
  engineBin: string,
  extraEnv: Record<string, string> = {},
): Promise<void> {
  const entry = entryFor(id);
  if (entry.status === "running" || entry.status === "starting") {
    throw httpError(409, "server is already running");
  }
  const worldDir = serverWorld(id);

  entry.runId = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const logsDir = path.join(serverMetaDir(id), "logs");
  fs.mkdirSync(logsDir, { recursive: true });
  entry.logFile = path.join(logsDir, `run-${entry.runId}.log`);
  pruneRunLogs(id);

  setStatus(entry, id, "starting");
  pushLine(entry, "system", `launching ${engineBin} run ${worldDir}`);

  const child = spawn(engineBin, ["run", worldDir], {
    cwd: worldDir,
    env: { ...process.env, ...extraEnv },
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  entry.child = child;
  entry.pid = child.pid ?? null;
  entry.startedAt = Date.now();

  const appendLog = (text: string) => {
    try {
      fs.appendFileSync(entry.logFile!, text.endsWith("\n") ? text : `${text}\n`);
    } catch {
      /* logging must never crash the host */
    }
  };

  child.stdout?.on("data", (chunk: Buffer) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      if (line.length > 0) {
        pushLine(entry, "out", line);
        appendLog(line);
      }
    }
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      if (line.length > 0) {
        pushLine(entry, "err", line);
        appendLog(`[stderr] ${line}`);
      }
    }
  });

  child.on("error", (error) => {
    pushLine(entry, "system", `spawn error: ${error.message}`);
    setStatus(entry, id, "error");
    entry.child = null;
    entry.pid = null;
  });

  child.on("close", (code, signal) => {
    entry.lastExit = { code, signal, at: Date.now() };
    pushLine(entry, "system", `engine exited (code=${code ?? "null"} signal=${signal ?? "null"})`);
    if (entry.status !== "stopping") setStatus(entry, id, code === 0 ? "stopped" : "error");
    else setStatus(entry, id, "stopped");
    entry.child = null;
    entry.pid = null;
    entry.startedAt = null;
  });

  // Give the process a moment to surface immediate failures (bad config, port in use).
  await new Promise((resolve) => setTimeout(resolve, 1200));
  if (child.exitCode !== null || child.signalCode !== null) {
    throw httpError(502, "engine process exited immediately; inspect the console output");
  }
  setStatus(entry, id, "running");
  pushLine(entry, "system", `engine running with pid ${entry.pid}`);
}

/** Sends stdin text to the engine when it is running. */
export function sendInput(id: string, input: string): boolean {
  const entry = entryFor(id);
  if (!entry.child || entry.status !== "running") return false;
  entry.child.stdin?.write(`${input}\n`);
  pushLine(entry, "system", `> ${input}`);
  return true;
}

async function killTree(pid: number): Promise<void> {
  if (process.platform === "win32") {
    // Graceful WM_CLOSE first, then hard tree termination as a fallback.
    await new Promise((resolve) => {
      const graceful = spawn("taskkill", ["/pid", String(pid)], { windowsHide: true });
      graceful.on("close", resolve);
      graceful.on("error", resolve);
    });
    await new Promise((resolve) => setTimeout(resolve, 800));
    await new Promise((resolve) => {
      const hard = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true });
      hard.on("close", resolve);
      hard.on("error", resolve);
    });
  } else {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        /* already gone */
      }
    }
  }
}

export async function stopServer(id: string): Promise<void> {
  const entry = entryFor(id);
  const child = entry.child;
  if (entry.status === "stopped" || !child) {
    if (entry.status !== "stopped") setStatus(entry, id, "stopped");
    return;
  }
  setStatus(entry, id, "stopping");
  pushLine(entry, "system", "stop requested by panel");
  const pid = entry.pid ?? child.pid ?? null;
  if (pid != null) await killTree(pid);
  try {
    child.kill();
  } catch {
    /* close handler may have already reaped it */
  }
  // Wait up to 8s for the close event.
  for (let waited = 0; waited < 8000 && child.exitCode === null; waited += 250) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (entry.child === child) {
    entry.child = null;
    entry.pid = null;
  }
}

export function isRunning(id: string): boolean {
  return entryFor(id).status === "running" || entryFor(id).status === "starting";
}
