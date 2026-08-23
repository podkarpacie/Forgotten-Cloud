# Forgotten Cloud Architecture (v2 — Local Edition)

## Product boundary

Forgotten Cloud is a **single-user, localhost-only control plane** for Forgotten Engine worlds. It deliberately runs game-server child processes (this is a local operator tool, not multi-tenant cloud infrastructure) but binds strictly to `127.0.0.1` and rejects non-loopback requests at middleware level. There is no authentication surface by design.

## Domain model

Panel state lives in plain JSON + the filesystem; no external database is required for the panel itself:

| Store | Location | Responsibility |
|---|---|---|
| `settings.json` | `.cloud/` | Repo coordinates, preferred acquisition method, source paths. |
| `server.json` | `.cloud/servers/<id>/.fc/` | Per-world identity: name, profile, pinned engine tag, allocated ports, autobackup policy, plugin enable-state, AAC flag. |
| World directory | `.cloud/servers/<id>/` | The genuine Forgotten Engine world (`config.lua`, `data/`, SQLite database). The panel treats it as source of truth. |
| Engine cache | `.cloud/engine/<tag>/bin/` | Installed binaries shared across worlds. |

## Supervisor design

One supervised child process per running world:

- spawn: `<engine-bin> run <world-dir>` with cwd = world dir
- stdout/stderr → ring buffer (2000 lines) → SSE fan-out + append-only run log
- stop: graceful `taskkill` then tree-kill fallback (Windows); SIGTERM elsewhere
- crash semantics: immediate-exit spawns surface as HTTP 502 so the UI never claims a false "running"

Console commands: `/clear` and `/broadcast <msg>` are panel-side; anything else is forwarded to engine stdin (future-proofing for interactive CLIs).

## Engine acquisition chain

`release → source-build → local-copy`, ordered automatically or forced in settings. Source builds reuse a configured checkout when present, else shallow-clone the exact tag. Jobs stream step logs through an idempotent polling endpoint (`/api/jobs/:id`) rather than websockets for simplicity.

## Config writer contract

`config.lua` is rewritten **in place**: recognized assignment lines are regex-replaced preserving indentation; everything else (comments, blank lines, unknown keys, the optional `experienceStages` literal table) survives byte-for-byte. Missing keys append under a managed marker. This mirrors the bounded parser subset in `forgotten-config`.

## Security model

- Loopback bind + explicit remote-address rejection middleware
- Path traversal guard on every file operation (`safeJoin`)
- Write-mode SQL requires a stopped server; default connections are `readOnly`
- Backup filenames validated against `^[\w.-]+\.zip$`
- Plugin registry contains only truthful metadata; unavailable packages refuse installation with an explicit SDK-pending message

## Frontend

React 19 + Vite + Tailwind v4 + framer-motion. Theme = `{mode, accent, motion}` persisted in a `fc_theme` cookie (1 year). Modes set semantic CSS variable palettes; accents set `--brand*` gradient stops consumed by both Tailwind theme mapping and inline SVG brand assets.

Routes: `/` dashboard · `/create` wizard · `/engine` versions · `/plugins` registry · `/settings` appearance+acquisition · `/servers/:id/:tab?` with tabs overview/console/files/config/database/backups/plugins/aac.

## Acceptance checks (verified)

- Create → `forgotten-engine init` runs when binary present; skeleton fallback otherwise
- Start/stop lifecycle with PID/uptime reporting; console SSE delivers live lines
- Config edits persist to `config.lua` without corrupting unrelated content
- Backup → restore roundtrip preserves world content and drops archive metadata files
- Export zip downloads; import zip creates a new server with a fresh port block
- Database browser lists engine tables (accounts/players/engine_events/…) from a real SQLite file
