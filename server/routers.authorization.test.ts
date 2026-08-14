import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getServerAccess: vi.fn(),
}));

vi.mock("./db", () => ({
  getDb: mocks.getDb,
  getServerAccess: mocks.getServerAccess,
  getServerDetail: vi.fn(),
  listAccessibleServers: vi.fn(),
}));

import { appRouter } from "./routers";

function context(userId = 1) {
  return {
    user: {
      id: userId,
      openId: `user-${userId}`,
      name: "Test user",
      email: null,
      loginMethod: "test",
      role: "user" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { headers: {} },
    res: { clearCookie: vi.fn() },
  } as any;
}

function serverAccess(overrides: Record<string, unknown> = {}) {
  return {
    db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
    server: { id: 7, ownerId: 1, observedStatus: "online", uuid: "server-seven", engineVersion: "0.1.0" },
    membership: null,
    allowed: true,
    ...overrides,
  } as any;
}

describe("authorization-sensitive server procedures", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses lifecycle requests without the console permission", async () => {
    mocks.getServerAccess.mockResolvedValue(serverAccess({ allowed: false }));
    const caller = appRouter.createCaller(context());
    await expect(caller.servers.lifecycle({ serverId: 7, action: "start" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses backup restoration when the requested backup is absent", async () => {
    const db = serverAccess().db;
    const chain = { from: () => chain, where: () => chain, limit: vi.fn().mockResolvedValue([]) };
    db.select.mockReturnValue(chain);
    mocks.getServerAccess.mockResolvedValue(serverAccess({ db }));
    const caller = appRouter.createCaller(context());
    await expect(caller.backups.restore({ serverId: 7, backupId: 99 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses restoration when a backup lacks required artifact categories", async () => {
    const db = serverAccess().db;
    const chain = { from: () => chain, where: () => chain, limit: vi.fn().mockResolvedValue([{ id: 99, restoreState: "ready", manifest: "database,map,config" }]) };
    db.select.mockReturnValue(chain);
    mocks.getServerAccess.mockResolvedValue(serverAccess({ db }));
    const caller = appRouter.createCaller(context());
    await expect(caller.backups.restore({ serverId: 7, backupId: 99 })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("persists an explicit permission toggle for the server owner", async () => {
    const db = serverAccess().db;
    const onDuplicateKeyUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn(() => ({ onDuplicateKeyUpdate }));
    db.insert.mockReturnValue({ values });
    mocks.getServerAccess.mockResolvedValue(serverAccess({ db }));
    const caller = appRouter.createCaller(context());
    await expect(caller.collaboration.setPermission({ serverId: 7, membershipId: 12, permission: "database", enabled: true })).resolves.toEqual({ updated: true });
    expect(onDuplicateKeyUpdate).toHaveBeenCalledWith({ set: { enabled: true } });
  });

  it("prevents a non-owner from assigning team members even when settings access was delegated", async () => {
    mocks.getServerAccess.mockResolvedValue(serverAccess({ server: { id: 7, ownerId: 2 } }));
    const caller = appRouter.createCaller(context(1));
    await expect(caller.collaboration.addMember({ serverId: 7, userId: 3, role: "developer" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("prevents cloning a profile owned by a different server owner", async () => {
    const limit = vi.fn().mockResolvedValueOnce([{ id: 8, serverId: 7, name: "External profile" }]).mockResolvedValueOnce([{ id: 7, ownerId: 2 }]);
    const chain = { from: () => chain, where: () => chain, limit };
    mocks.getDb.mockResolvedValue({ select: vi.fn(() => chain) });
    const caller = appRouter.createCaller(context(1));
    await expect(caller.profiles.clone({ profileId: 8, name: "Unauthorized clone" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
