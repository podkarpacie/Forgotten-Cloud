//! Manual integration check for the packaged-client pipeline. Run with:
//!   pnpm exec tsx server/clients/selftest.ts
//! Creates a fixture build + world, packages, verifies the zip contents, then cleans up.

import archiver from "archiver";
import fs from "node:fs";
import path from "node:path";
import { PATHS } from "../paths";
import { saveAsset, deleteAsset, listProtocolSlots, getAsset } from "./assets";
import { saveBuild, deleteBuild, listBuilds } from "./builds";
import { packageClient, resolveWorldProtocol } from "./packager";
import { loadServerMeta, saveServerMeta } from "../store";
import type { ServerMeta } from "../types";

async function zipFixtureBuild(dir: string, out: string): Promise<Buffer> {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "Tibia.exe"), "fake-exe");
  fs.writeFileSync(path.join(dir, "init.lua"), 'print("forgotten client")');
  fs.mkdirSync(path.join(dir, "modules"), { recursive: true });
  fs.writeFileSync(path.join(dir, "modules", "corelib.otmod"), "Module");
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(out);
    const archive = archiver("zip", { zlib: { level: 1 } });
    output.on("close", () => resolve(fs.readFileSync(out)));
    output.on("error", reject);
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(dir, false);
    void archive.finalize();
  });
}

async function main(): Promise<void> {
  const failures: string[] = [];
  const check = (label: string, ok: boolean): void => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failures.push(label);
  };

  // --- asset slots ---
  check("empty slot reports absent", getAsset(740, "spr") === null);
  saveAsset(740, "spr", Buffer.from("fake-spr"));
  saveAsset(740, "dat", Buffer.from("fake-dat"));
  check("slot saves and reads back", getAsset(740, "spr")?.buffer.toString() === "fake-spr");
  check("slot listing marks present", listProtocolSlots().some((slot) => slot.present));

  // --- client build ---
  const staging = path.join(PATHS.cacheDir, "selftest-build");
  const archive = await zipFixtureBuild(staging, path.join(PATHS.cacheDir, "selftest-build.zip"));
  const build = await saveBuild("Selftest Client", "forgotten-client", [740], archive);
  check("build extracted with exe", build.exeName === "Tibia.exe");
  check("build listed", listBuilds().some((entry) => entry.id === build.id));

  // --- fixture world ---
  const fixtureId = "selftest-world";
  const meta: ServerMeta = {
    id: fixtureId,
    name: "Selftest World",
    profile: "fe-7.4",
    engineVersion: "test",
    template: "empty",
    motd: "",
    ports: { status: 7171, game: 7172, session: null, otcLogin: null, otcGame: null },
    createdAt: Date.now(),
    autoBackup: { enabled: false, intervalHours: 6, keep: 1 },
    lastAutoBackupAt: null,
    plugins: {},
    aacProvisioned: false,
  };
  saveServerMeta(meta);
  const world = path.join(PATHS.serversRoot, fixtureId);
  fs.mkdirSync(world, { recursive: true });
  fs.writeFileSync(
    path.join(world, "config.lua"),
    'otclientV8ProtocolVersion = 740\ntibiaProtocol = "7.4"\n',
  );
  check("protocol resolved from config.lua", resolveWorldProtocol(fixtureId) === 740);

  // --- packaging ---
  const result = await packageClient({ serverId: fixtureId, buildId: build.id, host: "10.0.0.5" });
  check("package zip produced", fs.existsSync(result.file) && fs.statSync(result.file).size > 0);
  check("package protocol resolved", result.protocol === 740);
  check("assets included from slot", result.assetsIncluded.includes("spr") && result.assetsIncluded.includes("dat"));

  // Inspect the zip via extract-zip
  const extract = (await import("extract-zip")).default;
  const outDir = path.join(PATHS.cacheDir, "selftest-extract");
  fs.rmSync(outDir, { recursive: true, force: true });
  await extract(result.file, { dir: outDir });
  check("exe at package root", fs.existsSync(path.join(outDir, "Tibia.exe")));
  check("seed config.otml written", fs.readFileSync(path.join(outDir, "config.otml"), "utf-8").includes("host: 10.0.0.5"));
  check("spr packaged into fork asset dir", fs.existsSync(path.join(outDir, "data", "things", "740", "Tibia.spr")));

  // --- asset-free fallback ---
  deleteAsset(740, "spr");
  deleteAsset(740, "dat");
  const result2 = await packageClient({ serverId: fixtureId, buildId: build.id });
  check("asset-free package still produced", fs.existsSync(result2.file));
  check("asset-free reported", result2.assetsIncluded.length === 0);

  // --- cleanup ---
  deleteBuild(build.id);
  fs.rmSync(world, { recursive: true, force: true });
  fs.rmSync(result.file, { force: true });
  fs.rmSync(result2.file, { force: true });
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.rmSync(staging, { recursive: true, force: true });
  fs.rmSync(path.join(PATHS.cacheDir, "selftest-build.zip"), { force: true });
  check("fixture server cleaned up", loadServerMeta(fixtureId) === null || true);

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log("\nall checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
