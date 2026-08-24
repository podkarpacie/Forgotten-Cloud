import express from "express";
import fs from "node:fs";
import path from "node:path";
import { PATHS, serverMetaDir, serverWorld } from "../paths";
import { loadServerMeta, loadSettings, saveSettings, saveServerMeta } from "../store";
import { PROFILES, listVersions, detectBinaryVersion, installedBinaryPath, outdatedTag, parseTagVersion } from "../engine/catalog";
import { getJob, listJobs, startInstall, startReinstall, uninstallVersion } from "../engine/installer";
import * as supervisor from "../engine/supervisor";
import type { ProfileId } from "../types";
import { dirSize, httpError } from "../util";

export const systemRouter = express.Router();

// ---- Panel settings -------------------------------------------------------------

systemRouter.get("/settings", (req, res) => {
  res.json(loadSettings());
});

systemRouter.put("/settings", (req, res) => {
  const current = loadSettings();
  const body = req.body as Partial<typeof current>;
  saveSettings({
    ...current,
    repoOwner: (body.repoOwner ?? current.repoOwner).trim() || current.repoOwner,
    repoName: (body.repoName ?? current.repoName).trim() || current.repoName,
    githubToken:
      body.githubToken !== undefined ? String(body.githubToken).trim() : (current.githubToken ?? ""),
    engineSourcePath: (body.engineSourcePath ?? current.engineSourcePath).trim(),
    localEngineBinary: (body.localEngineBinary ?? current.localEngineBinary).trim(),
    preferredMethod: body.preferredMethod ?? current.preferredMethod,
    maxBackupsPerServer: Math.min(Math.max(Number(body.maxBackupsPerServer ?? 25), 1), 200),
    consoleHistoryLines: Math.min(Math.max(Number(body.consoleHistoryLines ?? 2000), 200), 5000),
    networkAccess: body.networkAccess === "loopback" ? "loopback" : body.networkAccess === "lan" ? "lan" : current.networkAccess,
  });
  res.json(loadSettings());
});

// ---- Engine catalog + install jobs ----------------------------------------------

systemRouter.get("/profiles", (req, res) => {
  res.json({ profiles: PROFILES });
});

systemRouter.get("/versions", async (req, res, next) => {
  try {
    res.json(await listVersions());
  } catch (error) {
    next(error);
  }
});

systemRouter.post("/install", (req, res) => {
  const version = String((req.body as { version?: string }).version ?? "");
  if (!/^fe-v\d/.test(version)) throw httpError(400, "version must be an fe-vX.Y.Z tag");
  const jobId = startInstall(version, "install");
  res.status(202).json({ jobId });
});

systemRouter.post("/versions/:tag/reinstall", (req, res) => {
  const version = String(req.params.tag);
  if (!/^fe-v\d/.test(version)) throw httpError(400, "version must be an fe-vX.Y.Z tag");
  const jobId = startReinstall(version);
  res.status(202).json({ jobId });
});

systemRouter.delete("/versions/:tag", (req, res) => {
  const version = String(req.params.tag);
  if (!/^fe-v\d/.test(version)) throw httpError(400, "version must be an fe-vX.Y.Z tag");
  const result = uninstallVersion(version);
  if (!result.removed) throw httpError(409, result.error ?? "uninstall failed");
  res.json({ removed: true, version });
});

/** Per-version build report: what the installed binary claims vs the newest known release. */
systemRouter.get("/versions/status", async (req, res, next) => {
  try {
    const catalog = await listVersions();
    const entries = await Promise.all(
      catalog.versions
        .filter((version) => version.installed)
        .map(async (version) => {
          const binPath = installedBinaryPath(version.tag);
          const detected = binPath ? await detectBinaryVersion(binPath) : null;
          return {
            tag: version.tag,
            binaryPath: binPath,
            binaryBuildVersion: detected,
            binaryMatchesTag:
              detected !== null && parseTagVersion(`v${detected}`)?.patch === parseTagVersion(version.tag)?.patch,
            outdatedRelativeToLatest: outdatedTag(version.tag, catalog.latestTag),
          };
        }),
    );
    res.json({
      latestTag: catalog.latestTag,
      catalogSource: catalog.source,
      installs: entries,
    });
  } catch (error) {
    next(error);
  }
});

systemRouter.get("/jobs", (req, res) => {
  res.json({ jobs: listJobs().slice(0, 20) });
});

systemRouter.get("/jobs/:id", (req, res) => {
  const job = getJob(String(req.params.id));
  if (!job) throw httpError(404, "unknown job");
  res.json(job);
});

// ---- Dashboard -------------------------------------------------------------------

systemRouter.get("/overview", (req, res) => {
  const servers = fs
    .readdirSync(PATHS.serversRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .map((id) => ({ id, meta: loadServerMeta(id) }))
    .filter((entry) => entry.meta !== null)
    .map((entry) => ({
      id: entry.id,
      name: entry.meta!.name,
      profile: entry.meta!.profile,
      engineVersion: entry.meta!.engineVersion,
      status: supervisor.getStatus(entry.id),
      diskUsageBytes: dirSize(serverWorld(entry.id)),
      createdAt: entry.meta!.createdAt,
    }));
  res.json({
    servers: servers.sort((a, b) => b.createdAt - a.createdAt),
    engineInstalls: fs.existsSync(PATHS.engineDir)
      ? fs
          .readdirSync(PATHS.engineDir, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => ({
            version: entry.name,
            binPath: path.join(PATHS.engineDir, entry.name, "bin"),
          }))
      : [],
    runningCount: servers.filter((server) => server.status === "running").length,
  });
});

// ---- Plugin scaffolding (future SDK surface) ---------------------------------------

export interface RegistryEntry {
  id: string;
  name: string;
  description: string;
  version: string;
  engineCompatibility: string[];
  status: "planned" | "available" | "coming-soon";
}

/** Honest seed registry; entries gain download URLs once the plugin SDK ships. */
const PLUGIN_REGISTRY_SEED: RegistryEntry[] = [
  {
    id: "forgotten-aac",
    name: "Forgotten AAC",
    description:
      "Official MyAAC-style web panel for accounts/characters. Installs into the world's /aac workspace once the SDK contract lands.",
    version: "0.0.1",
    engineCompatibility: ["fe-7.4"],
    status: "planned",
  },
];

systemRouter.get("/plugins/registry", (req, res) => {
  res.json({ entries: PLUGIN_REGISTRY_SEED });
});

function pluginsRoot(id: string): string {
  return path.join(serverWorld(id), "data", "plugins");
}

systemRouter.get("/servers/:id/plugins", (req, res) => {
  const id = String(req.params.id);
  const meta = loadServerMeta(id);
  if (!meta) throw httpError(404, "unknown server");
  const root = pluginsRoot(id);
  const installed: Record<string, unknown>[] = [];
  if (fs.existsSync(root)) {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifestPath = ["manifest.json", "plugin.json", ".fcplugin"]
        .map((name) => path.join(root, entry.name, name))
        .find((candidate) => fs.existsSync(candidate));
      let manifest: Record<string, unknown> = { name: entry.name };
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath!, "utf-8"));
      } catch {
        /* unnamed scaffold */
      }
      installed.push({
        dir: entry.name,
        manifest,
        enabled: meta.plugins[entry.name]?.enabled ?? true,
        installedAt: meta.plugins[entry.name]?.installedAt ?? null,
      });
    }
  }
  res.json({ installed, sdkStatus: "awaiting-forgotten-engine-plugin-sdk" });
});

systemRouter.post("/servers/:id/plugins/install", express.json(), (req, res) => {
  const id = String(req.params.id);
  const meta = loadServerMeta(id);
  if (!meta) throw httpError(404, "unknown server");
  const pluginId = String((req.body as { id?: string }).id ?? "").trim();
  const seed = PLUGIN_REGISTRY_SEED.find((entry) => entry.id === pluginId);
  if (!seed) throw httpError(404, `plugin ${pluginId} is not in the registry`);
  if (seed.status !== "available") {
    throw httpError(
      409,
      `${seed.name} cannot be installed yet: the Forgotten Engine plugin SDK has not shipped. This panel is ready to one-click-install packages the moment it does.`,
    );
  }
  const dir = path.join(pluginsRoot(id), pluginId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(seed, null, 2));
  meta.plugins[pluginId] = { enabled: true, installedAt: Date.now() };
  saveServerMeta(meta);
  res.status(201).json({ installed: pluginId });
});

systemRouter.post("/servers/:id/plugins/:dir/toggle", express.json(), (req, res) => {
  const id = String(req.params.id);
  const meta = loadServerMeta(id);
  if (!meta) throw httpError(404, "unknown server");
  const dir = String(req.params.dir);
  const current = meta.plugins[dir] ?? { enabled: true, installedAt: Date.now() };
  meta.plugins[dir] = { ...current, enabled: !current.enabled };
  saveServerMeta(meta);
  res.json(meta.plugins[dir]);
});

systemRouter.delete("/servers/:id/plugins/:dir", (req, res) => {
  const id = String(req.params.id);
  const meta = loadServerMeta(id);
  if (!meta) throw httpError(404, "unknown server");
  const dir = String(req.params.dir);
  fs.rmSync(path.join(pluginsRoot(id), dir), { recursive: true, force: true });
  delete meta.plugins[dir];
  saveServerMeta(meta);
  res.json({ removed: dir });
});

// ---- Forgotten AAC scaffold ---------------------------------------------------------

systemRouter.get("/servers/:id/aac", (req, res) => {
  const id = String(req.params.id);
  const meta = loadServerMeta(id);
  if (!meta) throw httpError(404, "unknown server");
  const dir = path.join(serverWorld(id), "aac");
  res.json({
    provisioned: meta.aacProvisioned && fs.existsSync(dir),
    root: "aac/",
    roadmap: [
      "Forgotten Engine exposes its account/player database schema (already browsable in this panel's Database tab).",
      "The Forgotten AAC project will ship as a static web bundle + thin API reading that schema.",
      "This panel will then serve it under the world's /aac workspace with one click.",
    ],
  });
});

systemRouter.post("/servers/:id/aac/provision", (req, res) => {
  const id = String(req.params.id);
  const meta = loadServerMeta(id);
  if (!meta) throw httpError(404, "unknown server");
  const dir = path.join(serverWorld(id), "aac");
  fs.mkdirSync(path.join(dir, "www"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "README.md"),
    [
      "# Forgotten AAC workspace",
      "",
      "Reserved workspace for **Forgotten AAC**, the upcoming MyAAC-style web panel",
      "for Forgotten Engine worlds. The panel runtime will mount this folder and",
      "serve the AAC bundle once the first public build is published.",
      "",
      "- Account data source: `data/forgotten-engine.db` (SQLite)",
      "- Status: awaiting Forgotten AAC v0.1 release",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(dir, "aac.config.json"),
    JSON.stringify({ serverId: id, engineProfile: meta.profile, theme: "classic", enabled: false }, null, 2),
  );
  meta.aacProvisioned = true;
  saveServerMeta(meta);
  res.status(201).json({ provisioned: true, dir: "aac/" });
});
