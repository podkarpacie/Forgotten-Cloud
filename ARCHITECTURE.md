# Forgotten Cloud Architecture

## Product boundary

Forgotten Cloud is a role-aware management panel for Forgotten Engine instances. The first release implements persistent server definitions, lifecycle orchestration records, collaboration controls, profile and backup metadata, plugin compatibility rules, and opt-in discovery. The actual execution of remote game processes is intentionally isolated behind a future host-agent API; a web-panel deployment must not attempt to run arbitrary long-lived game-server child processes.

## Domain model

| Model | Key fields | Responsibility |
|---|---|---|
| `servers` | owner ID, name, Tibia 8.0, template, rate, PvP, database mode, desired/observed status | Authoritative server definition and requested lifecycle state. |
| `server_metrics` | server ID, players, CPU, RAM, uptime, address, captured time | Last reported host-agent telemetry. |
| `server_events` | server ID, kind, level, message, actor ID, created time | Append-only lifecycle, command, and console audit trail. |
| `server_members` | server ID, user ID, role | Collaboration membership using owner, developer, moderator, mapper, or GM. |
| `member_permissions` | membership ID, exact permission key, enabled | Explicit console, players, plugins, scripts, database, backups, and settings authority. |
| `plugins` / `plugin_installs` | engine compatibility range, install state | Catalog metadata and instance-specific installation state. |
| `backups` | manifest, restoration state, origin | Database, player, map, config, plugin, and script coverage. |
| `server_profiles` | server snapshot payload, engine/map/schema versions | Reusable profile/clone definition. |
| `public_listings` | server ID, enabled, summary | Owner opt-in record for public discovery. |

## Security model

Every mutation checks either ownership or an enabled, explicit permission. Server role names are represented exactly as **owner**, **developer**, **moderator**, **mapper**, and **GM**. Permission keys are represented exactly as **console**, **players**, **plugins**, **scripts**, **database**, **backups**, and **settings**. The client never decides authorization; it merely reflects server decisions.

## Product constraints

The creation wizard exposes **only Tibia 8.0**. Template labels are exactly **Global 8.0**, **High Rate**, **Hardcore**, and **Empty World**. Storage choice offers a default **automatic SQLite** path and an **advanced PostgreSQL/MySQL** path. Plugin entries have compatibility metadata and install records but no invented ratings, reviews, or download totals; those must originate from real registry data.

## Testable acceptance criteria

The release must prove the creation constraints, role and permission checks, lifecycle transitions, command audit events, backup restore state validation, plugin compatibility checks, profile cloning, and public-listing opt-in with automated tests. The user interface presents those capabilities in a responsive blueprint-inspired design: white technical grid, high-contrast black typography, monospaced labels, and restrained cyan/pink wireframes.

