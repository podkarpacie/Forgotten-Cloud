# Forgotten Cloud

Forgotten Cloud is a technical, role-aware control plane for **Forgotten Engine** instances. It provides a deliberate separation between a web management surface and the privileged host software that actually supervises server processes, files, and backups.

> The dashboard is a control plane, not a game-server container. It does not start untrusted server processes inside the web runtime. A Forgotten Host Agent must be installed on an approved server node to confirm lifecycle state, send telemetry and console events, preserve backups, and complete restores.

## Included first-release workflows

| Area | Implemented behavior |
|---|---|
| Server creation | User-scoped creation wizard constrained to **Tibia 8.0**, with **Global 8.0**, **High Rate**, **Hardcore**, and **Empty World** templates. |
| Database choice | A default **automatic SQLite** route plus advanced **PostgreSQL** or **MySQL** deployment intent. |
| Lifecycle | Authorized start, stop, and restart requests create auditable desired-state commands; an agent reports observed state. |
| Telemetry | One agent per server may publish status, address, live player count, uptime, CPU, RAM, and console/lifecycle events. |
| Console | Console events use an authenticated server-sent event channel; command requests are persisted for agent execution. |
| Team authority | Exact roles are `owner`, `developer`, `moderator`, `mapper`, and `GM`. Exact permission keys are `console`, `players`, `plugins`, `scripts`, `database`, `backups`, and `settings`. |
| Plugins | Searchable registry metadata with version compatibility checks and per-server install/uninstall records. No fabricated reviews, ratings, or download totals are shown. |
| Backups | Manual and scheduled backup records include database, player data, map, config, plugins, and scripts; restore requests are confirmed by an agent. |
| Profiles & discovery | Full-profile capture/clone metadata and owner-controlled public discovery opt-in. |

## Host-agent protocol

An owner issues one credential per server through `agents.issueCredential`. The raw token is displayed once and must be stored only on the trusted host node. Cloud stores only a SHA-256 hash. The agent then authenticates as `Authorization: Bearer <token>`.

| Endpoint | Agent responsibility |
|---|---|
| `POST /api/agent/telemetry` | Report observed lifecycle state, address, player count, uptime, CPU, RAM, and up to 50 append-only console events. |
| `POST /api/agent/restore` | Acknowledge a requested restore with success/failure and a durable message after artifact reconciliation. |
| `GET /api/servers/:serverId/events` | Authenticated browser subscribers receive live console/audit events over server-sent events. |

The initial agent contract intentionally treats server commands and restore jobs as **requested** until a trusted host confirms the observed result. This prevents the UI from claiming that a remote operation succeeded before it has.

## Automatic backups

Automatic backups are scheduled through the managed HTTP scheduling service; no in-process timer is used. A per-server task identifier is persisted on the server record, and the authenticated callback resolves the server by that identifier rather than a request payload. The first schedule configuration must happen after a deployed release is available because callbacks target the production service.

## Development

```bash
pnpm install
pnpm drizzle-kit generate
pnpm check
pnpm test
pnpm build
```

Database changes are represented in `drizzle/` and applied through the managed database migration workflow. Do not place raw backup archives, maps, or server binaries in this repository; agent-controlled artifacts belong in managed object storage with metadata in the database.

## Validation

The release checks TypeScript, builds the production bundle, and runs Vitest coverage for constraints, lifecycle gates, cron validation, plugin compatibility, backup manifests, authentication, and sensitive router authorization paths. A true end-to-end production test additionally needs a deployed Cloud instance, an installed host agent, and a non-production Forgotten Engine server node.
