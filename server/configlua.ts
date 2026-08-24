import fs from "node:fs";
import path from "node:path";
import { httpError } from "./util";

/**
 * Mirrors the bounded TFS-style assignment subset that Forgotten Engine's
 * `forgotten-config` crate parses. Values are quoted strings, integers, or
 * booleans; `experienceStages` may additionally be a literal table which the
 * panel preserves byte-for-byte.
 */
export const CONFIG_SCHEMA: {
  key: string;
  group: string;
  type: "string" | "number" | "boolean" | "stages";
  default?: string;
  label: string;
  hint?: string;
  advanced?: boolean;
}[] = [
  { key: "ip", group: "Network", type: "string", default: '"127.0.0.1"', label: "Bind address", hint: "Address the game listener binds to." },
  { key: "gameProtocolPort", group: "Network", type: "number", default: "7172", label: "Game port" },
  { key: "statusProtocolPort", group: "Network", type: "number", default: "7171", label: "Status port" },
  { key: "maxPlayers", group: "Network", type: "number", default: "0", label: "Max players", hint: "0 = unlimited." },

  { key: "serverName", group: "Identity", type: "string", default: '"Forgotten Engine"', label: "Server name" },
  { key: "worldType", group: "Identity", type: "string", default: '"pvp"', label: "World type", hint: "pvp, no-pvp, or pvp-enforced." },
  { key: "motd", group: "Identity", type: "string", default: '""', label: "Message of the day" },

  { key: "mapName", group: "World", type: "string", default: '"forgotten"', label: "Map name" },
  { key: "mapFormat", group: "World", type: "string", default: '"auto"', label: "Map format", hint: "auto, femap, or otbm.", advanced: true },
  { key: "feProfile", group: "World", type: "string", default: '"fe-7.4"', label: "Compatibility profile", hint: "fe-7.4, fe-8.0, or fe-1.2." },
  { key: "tibiaProtocol", group: "World", type: "string", default: '"7.4"', label: "Tibia protocol", hint: "Quoted string: 7.4, 8.0, or 10.98 - must match the selected profile.", advanced: true },

  { key: "rateExp", group: "Rates", type: "number", default: "1", label: "Experience rate" },
  { key: "rateSkill", group: "Rates", type: "number", default: "1", label: "Skill rate" },
  { key: "rateMagic", group: "Rates", type: "number", default: "1", label: "Magic rate" },
  { key: "deathLosePercent", group: "Rates", type: "number", default: "10", label: "Death loss %", advanced: true },
  { key: "experienceStages", group: "Rates", type: "stages", label: "Experience stages", hint: "Optional literal table; preserved verbatim.", advanced: true },
  { key: "skillRate", group: "Rates", type: "number", default: "1", label: "Native skill rate", advanced: true },
  { key: "magicRate", group: "Rates", type: "number", default: "1", label: "Native magic rate", advanced: true },

  { key: "legacyLoginEnabled", group: "Legacy login (7.4)", type: "boolean", default: "false", label: "Enable legacy login" },
  { key: "rsaPrivateKey", group: "Legacy login (7.4)", type: "string", default: '"key.pem"', label: "RSA private key path", advanced: true },
  { key: "gameSessionEnabled", group: "Legacy login (7.4)", type: "boolean", default: "false", label: "Enable game session" },
  { key: "gameSessionPort", group: "Legacy login (7.4)", type: "number", default: "7173", label: "Game session port", advanced: true },
  { key: "advertisedGameSessionHost", group: "Legacy login (7.4)", type: "string", default: '"127.0.0.1"', label: "Advertised session host", advanced: true },
  { key: "advertisedGameSessionPort", group: "Legacy login (7.4)", type: "number", default: "7173", label: "Advertised session port", advanced: true },

  {
    key: "otclientV8NativeEnabled", group: "OTClientV8 native", type: "boolean", default: "false",
    label: "Enable OTClientV8 path",
  },
  { key: "otclientV8LoginPort", group: "OTClientV8 native", type: "number", default: "7174", label: "OTC login port" },
  { key: "otclientV8GamePort", group: "OTClientV8 native", type: "number", default: "7175", label: "OTC game port" },
  { key: "otclientV8ProtocolVersion", group: "OTClientV8 native", type: "number", default: "740", label: "OTC protocol version", hint: "740 is the only runnable native path; 800 needs unimplemented RSA/XTEA.", advanced: true },
  { key: "advertisedOtClientV8Host", group: "OTClientV8 native", type: "string", default: '"127.0.0.1"', label: "Advertised OTC host", advanced: true },
  { key: "advertisedOtClientV8GamePort", group: "OTClientV8 native", type: "number", default: "7175", label: "Advertised OTC game port", advanced: true },
  { key: "otclientV8NumericAccountIds", group: "OTClientV8 native", type: "boolean", default: "true", label: "Numeric account IDs", advanced: true },
  { key: "otclientV8LoginPacketEncryption", group: "OTClientV8 native", type: "boolean", default: "false", label: "Login packet encryption", advanced: true },
  { key: "otclientV8ProtocolChecksum", group: "OTClientV8 native", type: "boolean", default: "false", label: "Protocol checksum", advanced: true },
  { key: "otclientV8ChallengeOnLogin", group: "OTClientV8 native", type: "boolean", default: "false", label: "Challenge on login", advanced: true },
  { key: "otclientV8NativeEmptyWorldEnabled", group: "OTClientV8 native", type: "boolean", default: "false", label: "Empty-world fixture", advanced: true },
  { key: "otclientV8EmptyWorldGroundThingId", group: "OTClientV8 native", type: "number", default: "0", label: "Fixture ground thing ID", advanced: true },
  { key: "otclientV8PlayerLookType", group: "OTClientV8 native", type: "number", default: "0", label: "Player look type", advanced: true },
  { key: "otclientV8OutfitFirstLookType", group: "OTClientV8 native", type: "number", default: "0", label: "Outfit first look type", advanced: true },
  { key: "otclientV8OutfitLastLookType", group: "OTClientV8 native", type: "number", default: "0", label: "Outfit last look type", advanced: true },
  { key: "otclientV8PlayerSpeed", group: "OTClientV8 native", type: "number", default: "220", label: "Player speed", advanced: true },
  { key: "otclientV8ServerBeat", group: "OTClientV8 native", type: "number", default: "50", label: "Server beat", advanced: true },

  { key: "staticCreatureTargetAttackDamage", group: "Combat bridge", type: "number", default: "0", label: "Static creature attack damage", hint: "0 disables selected-target attacks.", advanced: true },
  { key: "staticCreatureTargetPursuitRange", group: "Combat bridge", type: "number", default: "0", label: "Static creature pursuit range", hint: "0 disables pursuit steps.", advanced: true },
  { key: "corpseDespawnSeconds", group: "Combat bridge", type: "number", default: "300", label: "Corpse despawn seconds", advanced: true },
  { key: "partySharedExperienceEnabled", group: "Party", type: "boolean", default: "false", label: "Shared party experience" },
  { key: "partySharedExperienceRange", group: "Party", type: "number", default: "7", label: "Shared XP range", advanced: true },
  { key: "partySharedExperienceFloorDelta", group: "Party", type: "number", default: "0", label: "Level floor delta", advanced: true },
  { key: "partySharedExperienceActivityTicks", group: "Party", type: "number", default: "30", label: "Activity ticks", advanced: true },

  { key: "mysqlHost", group: "MySQL contract", type: "string", default: '"127.0.0.1"', label: "MySQL host", hint: "Compatibility contract only; FE stores data in SQLite.", advanced: true },
  { key: "mysqlUser", group: "MySQL contract", type: "string", default: '"forgottenengine"', label: "MySQL user", advanced: true },
  { key: "mysqlDatabase", group: "MySQL contract", type: "string", default: '"forgottenengine"', label: "MySQL database", advanced: true },
];

const RECOGNIZED_KEYS = new Set(CONFIG_SCHEMA.map((entry) => entry.key));

export interface ConfigValues {
  [key: string]: string | number | boolean;
}

function stripLuaComment(line: string): string {
  let quote: string | null = null;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === "-" && line[index + 1] === "-") return line.slice(0, index);
  }
  return line;
}

/** Extracts the active assignment value for a key, ignoring commented-out lines. */
export function extractValue(lua: string, key: string): { raw: string; found: boolean } {
  const pattern = new RegExp(`^[ \\t]*${key}[ \\t]*=[ \\t]*(.*)$`);
  for (const line of lua.split(/\r?\n/)) {
    const withoutComment = stripLuaComment(line);
    const match = withoutComment.match(pattern);
    if (!match) continue;
    return { raw: match[1].trim(), found: true };
  }
  return { raw: "", found: false };
}

function serializeValue(value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function parseConfig(lua: string): ConfigValues {
  const values: ConfigValues = {};
  for (const line of lua.split(/\r?\n/)) {
    const clean = stripLuaComment(line).trim();
    if (!clean || clean.startsWith("--")) continue;
    const eq = clean.indexOf("=");
    if (eq <= 0) continue;
    const key = clean.slice(0, eq).trim();
    if (!RECOGNIZED_KEYS.has(key)) continue;
    const raw = clean.slice(eq + 1).trim();
    if (raw.startsWith('"') && raw.endsWith('"')) values[key] = raw.slice(1, -1);
    else if (raw === "true") values[key] = true;
    else if (raw === "false") values[key] = false;
    else {
      const num = Number(raw);
      if (!Number.isNaN(num)) values[key] = num;
    }
  }
  return values;
}

/**
 * Rewrites assignments for the provided keys while preserving every other
 * byte of the document, including comments and the optional experienceStages
 * literal table. Missing keys are appended in a managed section.
 */
export function applyConfigValues(lua: string, values: ConfigValues): string {
  let output = lua;
  const pending = new Map(Object.entries(values));
  const lines = output.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (stripLuaComment(line).trim().length === 0 && line.trim().length > 0) continue;
    const clean = stripLuaComment(line);
    const match = clean.match(/^[ \t]*([A-Za-z_][A-Za-z0-9_]*)[ \t]*=/);
    if (!match) continue;
    const key = match[1];
    if (!pending.has(key)) continue;
    const indent = line.slice(0, line.length - line.slice(line.indexOf(key)).length);
    lines[index] = `${indent}${key} = ${serializeValue(pending.get(key)!)}`;
    pending.delete(key);
  }
  output = lines.join("\n");
  if (pending.size > 0) {
    if (!output.endsWith("\n")) output += "\n";
    output += "\n-- == Forgotten Cloud managed additions ==\n";
    for (const [key, value] of pending) {
      output += `${key} = ${serializeValue(value)}\n`;
    }
  }
  return output;
}

export function readConfigFile(worldDir: string): { file: string; lua: string } {
  const file = path.join(worldDir, "config.lua");
  if (!fs.existsSync(file)) throw httpError(404, "config.lua not found in this world");
  return { file, lua: fs.readFileSync(file, "utf-8") };
}

export function writeConfigFile(worldDir: string, lua: string): void {
  fs.writeFileSync(path.join(worldDir, "config.lua"), lua);
}
