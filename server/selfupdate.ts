//! Forgotten Cloud self-update.
//!
//! Downloads the latest main-branch archive of the Forgotten Cloud repository, hot-swaps the
//! application source (never touching `.cloud/` state, `node_modules`, or `dist`), reinstalls
//! dependencies, rebuilds, and flags the panel for restart. Pair with `start.cmd` / `start.sh`,
//! which restart the node process after it exits, so the whole update is one button click.

import fs from "node:fs";
import path from "node:path";
import { PATHS, ensureDirs } from "./paths";
import { extract } from "./update-extract";
import { run } from "./util";

const CLOUD_REPO_OWNER = process.env.FORGETTEN_CLOUD_REPO_OWNER ?? "podkarpacie";
const CLOUD_REPO_NAME = process.env.FORGETTEN_CLOUD_REPO ?? "Forgotten-Cloud";

/// Top-level entries never copied over the running installation. Panel state (.cloud),
/// dependencies, and build output survive updates by design.
const SKIP_ENTRIES = new Set([".cloud", ".git", "node_modules", "dist", ".github"]);

export interface SelfUpdateStep {
  time: number;
  message: string;
}

export interface SelfUpdateJob {
  status: "idle" | "running" | "done" | "failed";
  fromVersion: string | null;
  toVersion: string | null;
  steps: SelfUpdateStep[];
  startedAt: number | null;
  finishedAt: number | null;
  error: string | null;
}

let job: SelfUpdateJob = {
  status: "idle",
  fromVersion: null,
  toVersion: null,
  steps: [],
  startedAt: null,
  finishedAt: null,
  error: null,
};

let running = false;

export function selfUpdateStatus(): SelfUpdateJob {
  return job;
}

function step(message: string): void {
  job.steps.push({ time: Date.now(), message });
  console.log(`[self-update] ${message}`);
}

/** Current panel version, read live from the project's package.json. */
export function currentPanelVersion(): string {
  try {
    const raw = fs.readFileSync(path.join(PATHS.projectRoot, "package.json"), "utf-8");
    return (JSON.parse(raw) as { version?: string }).version ?? "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Latest version published on the repository's default branch, read from its package.json.
 * This avoids requiring GitHub Releases for the panel itself.
 */
export async function latestMainVersion(): Promise<string | null> {
  try {
    const url = `https://raw.githubusercontent.com/${CLOUD_REPO_OWNER}/${CLOUD_REPO_NAME}/main/package.json`;
    const response = await fetch(url, {
      headers: { "User-Agent": "forgotten-cloud-panel" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { version?: string };
    return body.version ?? null;
  } catch {
    return null;
  }
}

function copyRecursive(source: string, destination: string): void {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (SKIP_ENTRIES.has(entry.name)) continue;
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) copyRecursive(from, to);
    else fs.copyFileSync(from, to);
  }
}

async function downloadMainArchive(target: string): Promise<void> {
  const url = `https://codeload.github.com/${CLOUD_REPO_OWNER}/${CLOUD_REPO_NAME}/zip/refs/heads/main`;
  const response = await fetch(url, {
    headers: { "User-Agent": "forgotten-cloud-panel" },
    signal: AbortSignal.timeout(5 * 60_000),
  });
  if (!response.ok || !response.body) {
    throw new Error(`archive download failed with HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(target, buffer);
}

/** Finds the single root directory inside the extracted archive (e.g. Forgotten-Cloud-main). */
function findArchiveRoot(extractDir: string): string | null {
  const entries = fs.readdirSync(extractDir, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory());
  return directories.length === 1 ? path.join(extractDir, directories[0]!.name) : null;
}

async function hasPnpm(): Promise<boolean> {
  try {
    await run("pnpm", ["--version"], { timeoutMs: 15_000 });
    return true;
  } catch {
    return false;
  }
}

export function startSelfUpdate(): { started: boolean; error?: string } {
  if (running) return { started: false, error: "an update is already running" };
  running = true;
  job = {
    status: "running",
    fromVersion: currentPanelVersion(),
    toVersion: null,
    steps: [],
    startedAt: Date.now(),
    finishedAt: null,
    error: null,
  };
  void execute().catch((error) => {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : String(error);
    job.finishedAt = Date.now();
    running = false;
  });
  return { started: true };
}

async function execute(): Promise<void> {
  try {
    ensureDirs();
    job.toVersion = await latestMainVersion();

    const stagingRoot = path.join(PATHS.cloudRoot, "update-staging");
    fs.rmSync(stagingRoot, { recursive: true, force: true });
    fs.mkdirSync(stagingRoot, { recursive: true });

    step("Downloading latest Forgotten Cloud main archive…");
    const zipPath = path.join(stagingRoot, "main.zip");
    await downloadMainArchive(zipPath);

    step("Extracting archive…");
    const extractDir = path.join(stagingRoot, `extract-${Date.now()}`);
    await extract(zipPath, { dir: extractDir });
    const archiveRoot = findArchiveRoot(extractDir);
    if (!archiveRoot || !fs.existsSync(path.join(archiveRoot, "package.json"))) {
      throw new Error("archive layout unexpected: no package.json at its root");
    }

    const incoming = (
      JSON.parse(fs.readFileSync(path.join(archiveRoot, "package.json"), "utf-8")) as {
        version?: string;
      }
    ).version;
    job.toVersion = incoming ?? job.toVersion;
    step(`Staged source version ${job.toVersion ?? "unknown"}; swapping application files…`);

    // Swap application source over the running install. .cloud/, node_modules/, dist/ are
    // skipped, so worlds, engines, settings, and the current build stay untouched here.
    for (const entry of fs.readdirSync(archiveRoot, { withFileTypes: true })) {
      if (SKIP_ENTRIES.has(entry.name)) continue;
      const from = path.join(archiveRoot, entry.name);
      const to = path.join(PATHS.projectRoot, entry.name);
      if (entry.isDirectory()) copyRecursive(from, to);
      else fs.copyFileSync(from, to);
    }
    step("Application files swapped.");

    step("Installing dependencies…");
    const packageManager = (await hasPnpm()) ? "pnpm" : "npm";
    const installArgs =
      packageManager === "pnpm" ? ["install"] : ["install", "--no-audit", "--no-fund"];
    const installResult = await run(packageManager, installArgs, {
      cwd: PATHS.projectRoot,
      timeoutMs: 15 * 60_000,
    });
    if (installResult.code !== 0) {
      throw new Error(
        `dependency install failed: ${(installResult.stderr || installResult.stdout).slice(0, 300)}`,
      );
    }
    step(`Dependencies installed (${packageManager}).`);

    step("Rebuilding panel…");
    const buildResult = await run(packageManager, ["run", "build"], {
      cwd: PATHS.projectRoot,
      timeoutMs: 15 * 60_000,
    });
    if (buildResult.code !== 0) {
      throw new Error(
        `build failed: ${(buildResult.stderr || buildResult.stdout).slice(0, 300)}`,
      );
    }
    step("Build complete.");

    fs.writeFileSync(
      path.join(PATHS.cloudRoot, "update-pending.json"),
      JSON.stringify(
        { fromVersion: job.fromVersion, toVersion: job.toVersion, at: Date.now() },
        null,
        2,
      ),
    );

    job.status = "done";
    job.finishedAt = Date.now();
    step(
      `Updated to ${job.toVersion ?? "latest"}. Panel shutting down now — start.cmd / start.sh will bring it back up.`,
    );
    running = false;
    // Give the HTTP response a moment to flush, then exit; the launcher loop restarts us
    // straight into the new build.
    setTimeout(() => process.exit(0), 1_500).unref();
  } catch (error) {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : String(error);
    job.finishedAt = Date.now();
    running = false;
    step(`Failed: ${job.error}`);
  }
}
