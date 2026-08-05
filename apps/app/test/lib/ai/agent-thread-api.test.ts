import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/lib/http", () => ({ api: apiMock }));

import {
  createAgentThread,
  deleteAgentThread,
  getAgentThread,
  listAgentThreads,
  updateAgentThread,
} from "@/lib/ai/agent-thread-api";

describe("Agent Thread v1 canonical Admin API", () => {
  beforeEach(() => {
    for (const mock of Object.values(apiMock)) {
      mock.mockReset();
      mock.mockResolvedValue({});
    }
  });

  it("uses workspace-scoped Thread CRUD resources and server cursor filters", async () => {
    const signal = new AbortController().signal;
    await listAgentThreads("workspace 1", {
      projectId: "project/1",
      archived: true,
      query: "homepage",
      cursor: "cursor 1",
      limit: 25,
      signal,
    });
    await createAgentThread("workspace 1", {
      idempotencyKey: "thread-command-1",
      projectId: "project/1",
      leadAgentId: "agent-lead",
      title: "Homepage collaboration",
    });
    await getAgentThread("workspace 1", "thread/1");
    await updateAgentThread("workspace 1", "thread/1", { archived: true });
    await deleteAgentThread("workspace 1", "thread/1");

    expect(apiMock.get).toHaveBeenNthCalledWith(
      1,
      "/workspaces/workspace%201/ai/threads?projectId=project%2F1&archived=true&q=homepage&cursor=cursor+1&limit=25",
      { signal },
    );
    expect(apiMock.post).toHaveBeenCalledWith(
      "/workspaces/workspace%201/ai/threads",
      {
        projectId: "project/1",
        leadAgentId: "agent-lead",
        title: "Homepage collaboration",
      },
      { headers: { "Idempotency-Key": "thread-command-1" } },
    );
    expect(apiMock.get).toHaveBeenNthCalledWith(
      2,
      "/workspaces/workspace%201/ai/threads/thread%2F1",
      undefined,
    );
    expect(apiMock.patch).toHaveBeenCalledWith(
      "/workspaces/workspace%201/ai/threads/thread%2F1",
      { archived: true },
      undefined,
    );
    expect(apiMock.delete).toHaveBeenCalledWith(
      "/workspaces/workspace%201/ai/threads/thread%2F1",
      undefined,
    );
  });
});
