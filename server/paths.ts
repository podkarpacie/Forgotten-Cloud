import fs from "node:fs";
import path from "node:path";

function findProjectRoot(start: string): string {
  let current = start;
  while (true) {
    if (fs.existsSync(path.join(current, "package.json"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return start;
    current = parent;
  }
}

const PROJECT_ROOT = findProjectRoot(import.meta.dirname);
export const CLOUD_ROOT = path.join(PROJECT_ROOT, ".cloud");

export const PATHS = {
  projectRoot: PROJECT_ROOT,
  cloudRoot: CLOUD_ROOT,
  settingsFile: path.join(CLOUD_ROOT, "settings.json"),
  cacheDir: path.join(CLOUD_ROOT, "cache"),
  tagsCache: path.join(CLOUD_ROOT, "cache", "tags.json"),
  engineDir: path.join(CLOUD_ROOT, "engine"),
  engineSrcDir: path.join(CLOUD_ROOT, "engine", "src"),
  jobsFile: path.join(CLOUD_ROOT, "cache", "jobs.json"),
  serversRoot: path.join(CLOUD_ROOT, "servers"),
};

export function serverWorld(id: string): string {
  return path.join(PATHS.serversRoot, id);
}

export function serverMetaDir(id: string): string {
  return path.join(serverWorld(id), ".fc");
}

export function serverMetaFile(id: string): string {
  return path.join(serverMetaDir(id), "server.json");
}

export function ensureDirs(): void {
  for (const dir of [
    PATHS.cloudRoot,
    PATHS.cacheDir,
    PATHS.engineDir,
    PATHS.engineSrcDir,
    PATHS.serversRoot,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
