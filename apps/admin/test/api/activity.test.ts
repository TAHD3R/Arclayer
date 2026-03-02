import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http", () => ({
  api: {
    get: vi.fn(),
  },
}));

import { api } from "@/lib/http";
import { listSystemActivity, listWorkspaceActivity } from "@/api/activity";

describe("api/activity query params", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
  });

  it("listSystemActivity uses camelCase query params", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      size: 20,
      pages: 0,
      next: null,
      prev: null,
    });

    await listSystemActivity({
      page: 2,
      size: 10,
      occurredFrom: "2026-02-01T00:00:00.000Z",
      occurredTo: "2026-02-02T00:00:00.000Z",
      eventName: "auth.login.succeeded",
      workspaceId: "w1",
      actorUserId: "u1",
      subjectUserId: "u2",
    });

    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith(
      "/system/activity?page=2&size=10&occurredFrom=2026-02-01T00%3A00%3A00.000Z&occurredTo=2026-02-02T00%3A00%3A00.000Z&eventName=auth.login.succeeded&workspaceId=w1&actorUserId=u1&subjectUserId=u2",
    );
  });

  it("listWorkspaceActivity uses camelCase query params", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      size: 20,
      pages: 0,
      next: null,
      prev: null,
    });

    await listWorkspaceActivity("ws-1", {
      page: 1,
      size: 20,
      occurredFrom: "2026-02-01T00:00:00.000Z",
      eventName: "rbac.role.created",
      actorUserId: "u1",
    });

    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith(
      "/workspaces/ws-1/activity?page=1&size=20&occurredFrom=2026-02-01T00%3A00%3A00.000Z&eventName=rbac.role.created&actorUserId=u1",
    );
  });
});
