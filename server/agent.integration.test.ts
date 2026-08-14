import { EventEmitter } from "events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getServerAccess: vi.fn(),
  authenticateRequest: vi.fn(),
}));

vi.mock("./db", () => ({ getDb: mocks.getDb, getServerAccess: mocks.getServerAccess }));
vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: mocks.authenticateRequest } }));

import { acknowledgeRestore, ingestTelemetry, streamConsoleEvents } from "./agent";

function response() {
  return {
    headersSent: false,
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
  } as any;
}

function mutationDb() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  const onDuplicateKeyUpdate = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn(() => ({ onDuplicateKeyUpdate }));
  const insert = vi.fn(() => ({ values }));
  return { update, insert, where, values, onDuplicateKeyUpdate };
}

describe("host-agent integrated handlers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts a scoped telemetry report and persists live metrics", async () => {
    const db = mutationDb();
    const limit = vi.fn().mockResolvedValue([{ id: 4, serverId: 7, tokenHash: "hash" }]);
    (db as any).select = vi.fn(() => ({ from: () => ({ where: () => ({ limit }) }) }));
    mocks.getDb.mockResolvedValue(db);
    const res = response();
    await ingestTelemetry({ headers: { authorization: "Bearer test-token" }, body: { status: "online", players: 2, playerLimit: 100, uptimeSeconds: 60, cpuPercent: 4, ramMb: 128 } } as any, res);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(db.update).toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalled();
  });

  it("records an agent restore acknowledgment with reconciliation data", async () => {
    const db = mutationDb();
    const agentLimit = vi.fn().mockResolvedValue([{ id: 4, serverId: 7, tokenHash: "hash" }]);
    const backupLimit = vi.fn().mockResolvedValue([{ id: 8, serverId: 7, restoreState: "requested" }]);
    (db as any).select = vi.fn()
      .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: agentLimit }) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: backupLimit }) }) });
    mocks.getDb.mockResolvedValue(db);
    const res = response();
    await acknowledgeRestore({ headers: { authorization: "Bearer test-token" }, body: { backupId: 8, success: true, message: "Artifacts reconciled", reconciliation: { database: "verified", map: "verified" } } } as any, res);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(db.update).toHaveBeenCalled();
  });

  it("opens an authenticated server-sent console stream and closes it cleanly", async () => {
    const req = new EventEmitter() as any;
    req.params = { serverId: "7" };
    req.query = {};
    const res = response();
    const eventLimit = vi.fn().mockResolvedValue([]);
    const db = { select: vi.fn(() => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: eventLimit }) }) }) })) };
    mocks.authenticateRequest.mockResolvedValue({ id: 1 });
    mocks.getServerAccess.mockResolvedValue({ db, allowed: true });
    await streamConsoleEvents(req, res);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/event-stream");
    expect(res.flushHeaders).toHaveBeenCalled();
    req.emit("close");
  });
});
