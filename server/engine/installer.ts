import fs from "node:fs";
import path from "node:path";
import extract from "extract-zip";
import { PATHS, ensureDirs } from "../paths";
import { loadSettings } from "../store";
import type { EngineJob } from "../types";
import { newId, run } from "../util";
import { engineBinDir, expectedBinaryPath, installedBinaryPath, detectBinaryVersion, parseTagVersion } from "./catalog";

const jobs = new Map<string, EngineJob>();

export function getJob(id: string): EngineJob | null {
  return jobs.get(id) ?? null;
}

function step(job: EngineJob, message: string): void {
  job.steps.push({ time: Date.now(), message });
  console.log(`[engine:${job.kind}${job.version ? ` ${job.version}` : ""}] ${message}`);
}

async function downloadReleaseAsset(job: EngineJob, version: string): Promise<string | null> {
  const settings = loadSettings();
  step(job, "Querying GitHub releases for prebuilt assets…");
  const url = `https://api.github.com/repos/${settings.repoOwner}/${settings.repoName}/releases/tags/${version}`;
  let release: { assets?: { name: string; browser_download_url: string }[] };
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "forgotten-cloud-panel", Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      step(job, `No published release for ${version} (HTTP ${response.status}).`);
      return null;
    }
    release = (await response.json()) as typeof release;
  } catch (error) {
    step(job, `Release lookup failed: ${String(error)}`);
    return null;
  }

  const platformHint = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "linux";
  const archHint = process.arch === "arm64" ? "aarch64" : "x86_64";
  const assets = release.assets ?? [];
  const asset =
    assets.find((entry) => /windows/i.test(entry.name) && /x86_64|x64|amd64/i.test(entry.name) && entry.name.endsWith(".zip")) ??
    assets.find((entry) => entry.name.toLowerCase().includes(platformHint)) ??
    null;
  if (!asset) {
    step(job, `Release exists but no ${platformHint}/${archHint} archive was attached.`);
    return null;
  }

  step(job, `Downloading ${asset.name}…`);
  ensureDirs();
  const zipPath = path.join(PATHS.cacheDir, `${version}-${asset.name}`);
  const response = await fetch(asset.browser_download_url, {
    headers: { "User-Agent": "forgotten-cloud-panel" },
    signal: AbortSignal.timeout(10 * 60_000),
  });
  if (!response.ok || !response.body) throw new Error(`download failed with HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(zipPath, buffer);

  const extractDir = path.join(PATHS.cacheDir, `${version}-extract-${Date.now()}`);
  await extract(zipPath, { dir: extractDir });
  return findExecutable(extractDir);
}

function findExecutable(root: string): string | null {
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.toLowerCase() === "forgotten-engine.exe") return full;
      else if (entry.isFile() && entry.name.toLowerCase() === "forgotten-engine") return full;
    }
  }
  return null;
}

/** Ensures a git clone of the requested tag exists under .cloud/engine/src. */
async function ensureSourceClone(job: EngineJob, version: string): Promise<string> {
  const settings = loadSettings();
  const configured = settings.engineSourcePath.trim();
  if (configured) {
    if (!fs.existsSync(path.join(configured, "Cargo.toml"))) {
      throw new Error(`configured engine source path has no Cargo.toml: ${configured}`);
    }
    step(job, `Using local engine source at ${configured} (tag pinning not applied).`);
    return configured;
  }

  const repoUrl = `https://github.com/${settings.repoOwner}/${settings.repoName}.git`;
  const target = path.join(PATHS.engineSrcDir, version);
  if (fs.existsSync(path.join(target, ".git"))) {
    step(job, `Reusing existing shallow clone for ${version}.`);
    return target;
  }
  step(job, `Shallow-cloning ${repoUrl} at ${version}…`);
  fs.mkdirSync(target, { recursive: true });
  const result = await run("git", ["clone", "--depth", "1", "--branch", version, repoUrl, target], {
    timeoutMs: 5 * 60_000,
  });
  if (result.code !== 0) {
    fs.rmSync(target, { recursive: true, force: true });
    throw new Error(`clone failed: ${result.stderr.trim().slice(0, 400) || result.stdout.slice(0, 400)}`);
  }
  return target;
}

async function buildFromSource(job: EngineJob, version: string): Promise<string> {
  const sourceDir = await ensureSourceClone(job, version);
  step(job, "Running cargo build --release --bin forgotten-engine (this can take several minutes on first run)…");
  const result = await run("cargo", ["build", "--release", "--bin", "forgotten-engine"], {
    cwd: sourceDir,
    timeoutMs: 45 * 60_000,
  });
  if (result.code !== 0) {
    const errorLines = [...result.stdout.split("\n"), ...result.stderr.split("\n")]
      .filter((line) => /error/i.test(line))
      .slice(0, 12)
      .join("\n");
    throw new Error(`cargo build failed:\n${errorLines}`);
  }
  const built =
    process.platform === "win32"
      ? path.join(sourceDir, "target", "release", "forgotten-engine.exe")
      : path.join(sourceDir, "target", "release", "forgotten-engine");
  if (!fs.existsSync(built)) throw new Error(`cargo reported success but binary is missing: ${built}`);
  return built;
}

function copyLocalOverride(): string | null {
  const settings = loadSettings();
  if (settings.localEngineBinary && fs.existsSync(settings.localEngineBinary)) {
    return settings.localEngineBinary;
  }
  // Fall back to a prebuilt binary inside a configured source checkout.
  const source = settings.engineSourcePath.trim();
  if (source) {
    const candidate =
      process.platform === "win32"
        ? path.join(source, "target", "release", "forgotten-engine.exe")
        : path.join(source, "target", "release", "forgotten-engine");
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      /* not built yet */
    }
  }
  return null;
}

export function startInstall(version: string, kind = "install"): string {
  const job: EngineJob = {
    id: newId("job"),
    kind,
    version,
    status: "queued",
    steps: [],
    startedAt: Date.now(),
  };
  jobs.set(job.id, job);
  void executeInstall(job).catch(() => undefined);
  return job.id;
}

/**
 * Replaces an installed engine binary with a fresh copy from the release chain. Unlike plain
 * install, the cached-binary short-circuit is skipped so stale builds get overwritten in place.
 */
export function startReinstall(version: string): string {
  return startInstall(version, "reinstall");
}

/** Removes an installed engine directory. Running servers pin their own binary path, so this
 * refuses only while that exact version's binary is executing. */
export function uninstallVersion(version: string): { removed: boolean; error?: string } {
  const binDir = engineBinDir(version);
  const versionRoot = path.dirname(binDir);
  if (!fs.existsSync(versionRoot)) {
    return { removed: false, error: `${version} is not installed` };
  }
  try {
    fs.rmSync(versionRoot, { recursive: true, force: true });
    return { removed: true };
  } catch (error) {
    // Windows keeps files locked while a child process runs from them.
    return {
      removed: false,
      error: `could not remove ${version}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function executeInstall(job: EngineJob): Promise<void> {
  const version = job.version!;
  const overwrite = job.kind === "reinstall";
  job.status = "running";
  const settings = loadSettings();
  const destination = expectedBinaryPath(version);
  try {
    if (!overwrite) {
      const cached = installedBinaryPath(version);
      if (cached) {
        // Even cached installs get one cheap identity check so a stale copy cannot masquerade
        // under a newer tag forever.
        const detected = await detectBinaryVersion(cached);
        const expected = parseTagVersion(version)?.patch;
        if (detected && expected !== undefined && parseTagVersion(`v${detected}`)?.patch !== expected) {
          step(
            job,
            `Cached ${version} binary reports build ${detected}; treating it as stale and reinstalling.`,
          );
        } else {
          step(job, `Engine ${version} already installed at ${cached}.`);
          job.result = { binPath: cached, source: "cache" };
          job.status = "done";
          persistJobs();
          return;
        }
      }
    } else {
      step(job, `Reinstall requested; replacing any existing ${version} binary.`);
      try {
        fs.rmSync(destination, { force: true });
      } catch {
        step(job, "Could not delete the existing binary; it may be running. Stop servers using it first.");
      }
    }

    const methodOrder =
      settings.preferredMethod === "auto"
        ? (["release", "source", "local"] as const)
        : ([settings.preferredMethod] as const);

    for (const method of methodOrder) {
      try {
        let found: string | null = null;
        if (method === "release") found = await downloadReleaseAsset(job, version);
        else if (method === "source") found = await buildFromSource(job, version);
        else found = copyLocalOverride();

        if (!found) continue;
        // Identity gate: the binary must self-report the requested build. This catches CDN
        // cache staleness and wrong-file uploads before they masquerade as an install.
        const expected = parseTagVersion(version)?.patch;
        const detected = await detectBinaryVersion(found);
        if (expected !== undefined && (!detected || parseTagVersion(`v${detected}`)?.patch !== expected)) {
          step(
            job,
            `${method} route rejected: candidate reports build ${detected ?? "unknown"}, expected ${version}.`,
          );
          continue;
        }
        fs.mkdirSync(engineBinDir(version), { recursive: true });
        fs.copyFileSync(found, destination);
        step(job, `Installed engine ${version} → ${destination} (${method}).`);
        job.result = { binPath: destination, source: method };
        job.status = "done";
        persistJobs();
        return;
      } catch (error) {
        step(job, `${method} route failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    job.status = "failed";
    job.result = {
      error:
        "No install route succeeded. Publish a GitHub release asset, install Rust (cargo) for source builds, or set an engine source path in Settings.",
    };
  } catch (error) {
    job.status = "failed";
    job.result = { error: error instanceof Error ? error.message : String(error) };
    step(job, `Failed: ${job.result.error}`);
  }
  persistJobs();
}

function persistJobs(): void {
  ensureDirs();
  const snapshot = [...jobs.values()].slice(-40);
  fs.writeFileSync(PATHS.jobsFile, JSON.stringify(snapshot, null, 2));
}

export function listJobs(): EngineJob[] {
  return [...jobs.values()].sort((a, b) => b.startedAt - a.startedAt);
}
