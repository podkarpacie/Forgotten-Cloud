//! API routes for the packaged-client feature: per-protocol asset slots, client-build
//! registry, and per-world package assembly (world → protocol → build → assets → zip).

import express from "express";
import {
  CLIENT_PROTOCOL_SLOTS,
  deleteAsset,
  isAssetKind,
  listProtocolSlots,
  saveAsset,
} from "../clients/assets";
import { FORKS, forkAdapter } from "../clients/forks";
import { deleteBuild, getBuild, listBuilds, saveBuild } from "../clients/builds";
import { packageClient } from "../clients/packager";
import { httpError } from "../util";

export const clientsRouter = express.Router();

function parseProtocols(raw: unknown): number[] {
  const list = String(raw ?? "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
  if (list.length === 0) throw httpError(400, "protocols query parameter required (e.g. ?protocols=740)");
  return list;
}

clientsRouter.get("/capabilities", (_req, res) => {
  res.json({
    protocols: CLIENT_PROTOCOL_SLOTS,
    forks: Object.values(FORKS).map((fork) => ({
      id: fork.id,
      label: fork.label,
      assetDirExample: fork.assetDir(CLIENT_PROTOCOL_SLOTS[0]),
    })),
  });
});

clientsRouter.get("/slots", (_req, res) => {
  res.json({ slots: listProtocolSlots() });
});

clientsRouter.put("/slots/:protocol/:kind", express.raw({ type: "*/*", limit: "256mb" }), (req, res) => {
  const protocol = Number(req.params.protocol);
  if (!Number.isInteger(protocol)) throw httpError(400, "protocol must be a number");
  const kind = String(req.params.kind);
  if (!isAssetKind(kind)) throw httpError(400, `unknown asset kind ${kind}`);
  res.json({ slot: saveAsset(protocol, kind, req.body as Buffer) });
});

clientsRouter.delete("/slots/:protocol/:kind", (req, res) => {
  const protocol = Number(req.params.protocol);
  if (!Number.isInteger(protocol)) throw httpError(400, "protocol must be a number");
  const kind = String(req.params.kind);
  if (!isAssetKind(kind)) throw httpError(400, `unknown asset kind ${kind}`);
  deleteAsset(protocol, kind);
  res.json({ ok: true });
});

clientsRouter.get("/builds", (_req, res) => {
  res.json({ builds: listBuilds() });
});

clientsRouter.post("/builds", express.raw({ type: "*/*", limit: "512mb" }), async (req, res, next) => {
  try {
    const fork = String(req.query.fork ?? "forgotten-client");
    if (!forkAdapter(fork)) throw httpError(400, `unknown client fork ${fork}`);
    const label = String(req.query.label ?? "");
    const protocols = parseProtocols(req.query.protocols);
    res.json({ build: await saveBuild(label, fork, protocols, req.body as Buffer) });
  } catch (error) {
    next(error);
  }
});

clientsRouter.delete("/builds/:id", (req, res) => {
  deleteBuild(String(req.params.id));
  res.json({ ok: true });
});

clientsRouter.post("/package/:serverId", express.json(), async (req, res, next) => {
  try {
    const buildId = String(req.body?.buildId ?? "");
    if (!buildId) throw httpError(400, "buildId required");
    const result = await packageClient({
      serverId: String(req.params.serverId),
      buildId,
      host: typeof req.body?.host === "string" ? req.body.host : undefined,
    });
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${result.fileName.replace(/"/g, "")}"`,
    );
    res.download(result.file, result.fileName);
  } catch (error) {
    next(error);
  }
});

clientsRouter.use((req, _res, next) => {
  next(httpError(404, `unknown clients endpoint ${req.method} ${req.path}`));
});
