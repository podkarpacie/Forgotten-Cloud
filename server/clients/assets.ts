//! Per-protocol client asset slots.
//!
//! The panel never sources or bundles Tibia client assets: the operator uploads their own
//! lawful .spr/.dat pair once per supported protocol version. A slot left empty simply means
//! packaged clients for that protocol ship asset-free (the operator already distributes them
//! themselves, e.g. inside a full game client install).

import fs from "node:fs";
import path from "node:path";
import { PATHS } from "../paths";
import { httpError } from "../util";

/**
 * Protocol versions with upload slots. KEEP IN SYNC: this list must stay within the engine's
 * supported classic protocols (Forgotten-Engine currently runs 740 and 760) and within what the
 * registered client forks actually test. Advertising a slot here only allows an upload; packaging
 * additionally requires a client build that supports the protocol.
 */
export const CLIENT_PROTOCOL_SLOTS: readonly number[] = [740, 760];

export type AssetKind = "spr" | "dat";

const KINDS: readonly AssetKind[] = ["spr", "dat"];
export const MAX_ASSET_BYTES = 256 * 1024 * 1024;

function assetsRoot(): string {
  return path.join(PATHS.cloudRoot, "client-assets");
}

function slotDir(protocol: number): string {
  return path.join(assetsRoot(), String(protocol));
}

export function isProtocolSlot(protocol: number): boolean {
  return CLIENT_PROTOCOL_SLOTS.includes(protocol);
}

export function isAssetKind(kind: string): kind is AssetKind {
  return (KINDS as readonly string[]).includes(kind);
}

function assertSlot(protocol: number, kind: AssetKind): void {
  if (!isProtocolSlot(protocol)) throw httpError(400, `protocol ${protocol} has no upload slot`);
  if (!isAssetKind(kind)) throw httpError(400, `unknown asset kind ${kind}`);
}

function assetFileName(kind: AssetKind): string {
  return kind === "spr" ? "Tibia.spr" : "Tibia.dat";
}

export interface AssetSlotInfo {
  protocol: number;
  kind: AssetKind;
  present: boolean;
  size: number;
  updatedAt: number | null;
}

function slotInfo(protocol: number, kind: AssetKind): AssetSlotInfo {
  const file = path.join(slotDir(protocol), assetFileName(kind));
  const stat = fs.existsSync(file) ? fs.statSync(file) : null;
  return {
    protocol,
    kind,
    present: Boolean(stat?.isFile()),
    size: stat?.size ?? 0,
    updatedAt: stat ? stat.mtimeMs : null,
  };
}

export function listProtocolSlots(): AssetSlotInfo[] {
  const slots: AssetSlotInfo[] = [];
  for (const protocol of CLIENT_PROTOCOL_SLOTS) {
    for (const kind of KINDS) {
      slots.push(slotInfo(protocol, kind));
    }
  }
  return slots;
}

export function getAsset(
  protocol: number,
  kind: AssetKind,
): { buffer: Buffer; size: number } | null {
  assertSlot(protocol, kind);
  const file = path.join(slotDir(protocol), assetFileName(kind));
  if (!fs.existsSync(file)) return null;
  return { buffer: fs.readFileSync(file), size: fs.statSync(file).size };
}

export function saveAsset(protocol: number, kind: AssetKind, content: Buffer): AssetSlotInfo {
  assertSlot(protocol, kind);
  if (!Buffer.isBuffer(content) || content.length === 0) {
    throw httpError(400, "empty asset upload");
  }
  if (content.length > MAX_ASSET_BYTES) {
    throw httpError(413, `asset exceeds the ${Math.floor(MAX_ASSET_BYTES / (1024 * 1024))}mb limit`);
  }
  const dir = slotDir(protocol);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, assetFileName(kind));
  fs.writeFileSync(file, content);
  const stat = fs.statSync(file);
  return { protocol, kind, present: true, size: stat.size, updatedAt: stat.mtimeMs };
}

export function deleteAsset(protocol: number, kind: AssetKind): void {
  assertSlot(protocol, kind);
  const file = path.join(slotDir(protocol), assetFileName(kind));
  if (fs.existsSync(file)) fs.rmSync(file);
}
