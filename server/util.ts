import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

export function nowMs(): number {
  return Date.now();
}

/** Resolves userPath inside root and guarantees containment. */
export function safeJoin(root: string, userPath: string): string {
  const normalized = path.normalize(userPath).replace(/^([/\\])+/, "");
  const resolved = path.resolve(root, normalized);
  const rootResolved = path.resolve(root);
  if (resolved !== rootResolved && !resolved.startsWith(rootResolved + path.sep)) {
    throw Object.assign(new Error("path escapes server directory"), { status: 400 });
  }
  return resolved;
}

export function dirSize(dir: string): number {
  let total = 0;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) total += dirSize(full);
      else total += entry.isFile() ? fs.statSync(full).size : 0;
    }
  } catch {
    // unreadable entries contribute zero
  }
  return total;
}

export function isPortFree(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen({ port, host, exclusive: true });
  });
}

/** Picks the next free contiguous base port block of the given size starting from start. */
export async function findFreePortBlock(start: number, size: number): Promise<number> {
  outer: for (let base = start; base < 65_535 - size; base += 1) {
    for (let offset = 0; offset < size; offset += 1) {
      if (!(await isPortFree(base + offset))) continue outer;
    }
    return base;
  }
  throw new Error("no free port block available");
}

export function humanError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** First non-internal IPv4 address of this machine, for advertising to LAN clients. */
export function primaryLanIp(): string | null {
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const info of interfaces ?? []) {
      if (info.family === "IPv4" && !info.internal) return info.address;
    }
  }
  return null;
}

export function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status });
}

export async function run(
  command: string,
  args: string[],
  options: { cwd?: string; timeoutMs?: number } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  const { spawn } = await import("node:child_process");
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      windowsHide: true,
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    const timer = options.timeoutMs
      ? setTimeout(() => {
          child.kill();
          reject(new Error(`${command} timed out after ${options.timeoutMs}ms`));
        }, options.timeoutMs)
      : undefined;
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}
