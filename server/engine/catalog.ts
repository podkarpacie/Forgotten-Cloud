import fs from "node:fs";
import path from "node:path";
import { PATHS, ensureDirs } from "../paths";
import { loadSettings } from "../store";
import type { ProfileInfo } from "../types";

export const PROFILES: ProfileInfo[] = [
  {
    id: "fe-7.4",
    label: "Classic 7.4",
    protocol: 740,
    reference: "Tibia 7.4",
    blurb: "Native legacy path with login foundation, OTClientV8 native support and bounded melee combat.",
  },
  {
    id: "fe-8.0",
    label: "Classic 8.0",
    protocol: 800,
    reference: "Tibia 8.0",
    blurb: "Compatibility target for the 8.0 protocol family.",
    experimental: true,
  },
  {
    id: "fe-1.2",
    label: "TFS 1.2 era",
    protocol: 1098,
    reference: "TFS 1.2 / Tibia 10.98",
    blurb: "TFS 1.2 behavioral compatibility target.",
    experimental: true,
  },
];

/** Offline fallback used when GitHub is unreachable; mirrors upstream fe-* tags. */
const FALLBACK_TAGS = [
  "fe-v8.0.0",
  "fe-v7.4.44", "fe-v7.4.43", "fe-v7.4.42", "fe-v7.4.41", "fe-v7.4.40",
  "fe-v7.4.39", "fe-v7.4.38", "fe-v7.4.37", "fe-v7.4.36", "fe-v7.4.35",
  "fe-v7.4.34", "fe-v7.4.33", "fe-v7.4.32", "fe-v7.4.31", "fe-v7.4.30",
  "fe-v7.4.29", "fe-v7.4.28", "fe-v7.4.27", "fe-v7.4.26", "fe-v7.4.25",
  "fe-v7.4.24", "fe-v7.4.23", "fe-v7.4.22", "fe-v7.4.21", "fe-v7.4.20",
  "fe-v7.4.19", "fe-v7.4.18", "fe-v7.4.17", "fe-v7.4.16", "fe-v7.4.15",
  "fe-v7.4.14", "fe-v7.4.13", "fe-v7.4.12", "fe-v7.4.11", "fe-v7.4.10",
  "fe-v7.4.9", "fe-v7.4.8", "fe-v7.4.7", "fe-v7.4.6", "fe-v7.4.5", "fe-v7.4.4",
];

interface TagCacheEntry {
  fetchedAt: number;
  tags: string[];
}

const TAG_CACHE_TTL_MS = 10 * 60 * 1000;

function readTagCache(): TagCacheEntry | null {
  try {
    return JSON.parse(fs.readFileSync(PATHS.tagsCache, "utf-8")) as TagCacheEntry;
  } catch {
    return null;
  }
}

function writeTagCache(tags: string[]): void {
  ensureDirs();
  fs.writeFileSync(
    PATHS.tagsCache,
    JSON.stringify({ fetchedAt: Date.now(), tags } satisfies TagCacheEntry, null, 2),
  );
}

async function fetchGithubTags(): Promise<string[] | null> {
  const settings = loadSettings();
  const url = `https://api.github.com/repos/${settings.repoOwner}/${settings.repoName}/tags?per_page=100`;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "forgotten-cloud-panel", Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { name?: string }[];
    const tags = body
      .map((entry) => entry.name ?? "")
      .filter((name) => /^fe-v\d/.test(name));
    return tags.length > 0 ? tags : null;
  } catch {
    return null;
  }
}

export interface VersionCatalog {
  versions: { tag: string; installed: boolean }[];
  source: "github" | "cache" | "fallback";
  fetchedAt: number;
}

export async function listVersions(): Promise<VersionCatalog> {
  let tags: string[];
  let source: VersionCatalog["source"] = "fallback";
  let fetchedAt = 0;

  const cached = readTagCache();
  if (cached && Date.now() - cached.fetchedAt < TAG_CACHE_TTL_MS) {
    return decorate("cache", cached.fetchedAt, sortTags(cached.tags));
  }

  const fresh = await fetchGithubTags();
  if (fresh) {
    tags = sortTags(fresh);
    source = "github";
    fetchedAt = Date.now();
    writeTagCache(tags);
  } else if (cached) {
    return decorate("cache", cached.fetchedAt, sortTags(cached.tags));
  } else {
    tags = FALLBACK_TAGS;
  }
  return decorate(source, fetchedAt, tags);
}

function decorate(source: VersionCatalog["source"], fetchedAt: number, tags: string[]): VersionCatalog {
  return {
    source,
    fetchedAt,
    versions: tags.map((tag) => ({ tag, installed: installedBinaryPath(tag) !== null })),
  };
}

function sortTags(tags: string[]): string[] {
  const weight = (tag: string): number => {
    const match = tag.match(/(\d+)\.(\d+)\.(\d+)/);
    if (!match) return 0;
    return Number(match[1]) * 1_000_000 + Number(match[2]) * 1_000 + Number(match[3]);
  };
  return [...tags].sort((a, b) => weight(b) - weight(a));
}

const BIN_NAME = process.platform === "win32" ? "forgotten-engine.exe" : "forgotten-engine";

export function engineBinDir(version: string): string {
  return path.join(PATHS.engineDir, version, "bin");
}

export function expectedBinaryPath(version: string): string {
  return path.join(engineBinDir(version), BIN_NAME);
}

/** Returns a usable cached binary path, or null when this version is not installed. */
export function installedBinaryPath(version: string): string | null {
  const candidate = expectedBinaryPath(version);
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return candidate;
  } catch {
    return null;
  }
}
