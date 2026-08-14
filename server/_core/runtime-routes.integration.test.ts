import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const handlers = vi.hoisted(() => ({
  telemetry: vi.fn((_req: any, res: any) => res.status(202).json({ accepted: "telemetry" })),
  restore: vi.fn((_req: any, res: any) => res.status(202).json({ accepted: "restore" })),
  stream: vi.fn((_req: any, res: any) => res.status(200).end()),
  backup: vi.fn((_req: any, res: any) => res.status(202).json({ accepted: "backup" })),
}));

vi.mock("../agent", () => ({ ingestTelemetry: handlers.telemetry, acknowledgeRestore: handlers.restore, streamConsoleEvents: handlers.stream }));
vi.mock("../backupSchedule", () => ({ runAutomaticBackup: handlers.backup }));

import { createControlPlaneApp } from "./index";

describe("control-plane runtime routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("mounts host-agent telemetry and restore endpoints", async () => {
    const app = createControlPlaneApp();
    await request(app).post("/api/agent/telemetry").send({ status: "online" }).expect(202, { accepted: "telemetry" });
    await request(app).post("/api/agent/restore").send({ backupId: 1 }).expect(202, { accepted: "restore" });
    expect(handlers.telemetry).toHaveBeenCalledOnce();
    expect(handlers.restore).toHaveBeenCalledOnce();
  });

  it("mounts the authenticated console stream and automatic backup callback routes", async () => {
    const app = createControlPlaneApp();
    await request(app).get("/api/servers/7/events").expect(200);
    await request(app).post("/api/scheduled/automatic-backup").expect(202, { accepted: "backup" });
    expect(handlers.stream).toHaveBeenCalledOnce();
    expect(handlers.backup).toHaveBeenCalledOnce();
  });
});
