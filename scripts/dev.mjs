import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

const children = [];

function run(name, args, color) {
  const child = spawn(process.execPath, args, { env: process.env, shell: false });
  const prefix = `\x1b[${color}m[${name}]\x1b[0m`;
  child.stdout.on("data", (data) => {
    for (const line of data.toString().split(/\r?\n/)) if (line.trim()) console.log(`${prefix} ${line}`);
  });
  child.stderr.on("data", (data) => {
    for (const line of data.toString().split(/\r?\n/)) if (line.trim()) console.error(`${prefix} ${line}`);
  });
  child.on("exit", (code) => {
    console.log(`${prefix} exited (${code})`);
    shutdown();
  });
  children.push(child);
}

function shutdown() {
  for (const child of children) {
    try {
      child.kill();
    } catch {}
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const tsxCli = path.join(path.dirname(require.resolve("tsx/package.json")), "dist", "cli.mjs");
const viteBin = path.join(path.dirname(require.resolve("vite/package.json")), "bin", "vite.js");

run("api", [tsxCli, "watch", "server/index.ts"], "36");
run("web", [viteBin], "35");
