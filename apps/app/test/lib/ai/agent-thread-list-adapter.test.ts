import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({
  createAgentThread: vi.fn(),
  deleteAgentThread: vi.fn(),
  getAgentThread: vi.fn(),
  listAgentThreads: vi.fn(),
  updateAgentThread: vi.fn(),
}));

vi.mock("@/lib/ai/agent-thread-api", () => apiMock);

import { createAgentThreadListAdapter } from "@/lib/ai/agent-thread-list-adapter";

const thread = {
  protocolVersion: 1 as const,
  threadId: "thread-1",
  workspaceId: "workspace-1",
  projectId: "project-1",
  leadAgentId: "agent-lead",
  title: "Homepage collaboration",
  pinned: false,
  archivedAt: null,
  createdAt: "2026-07-19T12:00:00.000Z",
  updatedAt: "2026-07-19T12:01:00.000Z",
  messages: [],
};

describe("Agent backend RemoteThreadListAdapter", () => {
  beforeEach(() => {
    for (const mock of Object.values(apiMock)) mock.mockReset();
    apiMock.listAgentThreads.mockResolvedValue({ items: [thread], nextCursor: "thread-1" });
    apiMock.createAgentThread.mockResolvedValue(thread);
    apiMock.getAgentThread.mockResolvedValue(thread);
    apiMock.updateAgentThread.mockResolvedValue(thread);
    apiMock.deleteAgentThread.mockResolvedValue({
      threadId: thread.threadId,
      deletedAt: "2026-07-19T12:02:00.000Z",
    });
  });

  it("projects backend metadata and delegates every durable Thread mutation", async () => {
    const adapter = createAgentThreadListAdapter({
      workspaceId: "workspace-1",
      projectId: "project-1",
      leadAgentId: "agent-lead",
      initialTitle: "New collaboration",
    });

    const listed = await adapter.list({ after: "cursor-0" });
    expect(listed).toEqual({
      threads: [
        expect.objectContaining({
          remoteId: "thread-1",
          externalId: "thread-1",
          status: "regular",
          title: "Homepage collaboration",
          lastMessageAt: new Date("2026-07-19T12:01:00.000Z"),
          custom: expect.objectContaining({ leadAgentId: "agent-lead", pinned: false }),
        }),
      ],
      nextCursor: "thread-1",
    });
    expect(apiMock.listAgentThreads).toHaveBeenCalledWith("workspace-1", {
      projectId: "project-1",
      cursor: "cursor-0",
      limit: 50,
    });

    await expect(adapter.initialize("thread-new")).resolves.toEqual({
      remoteId: "thread-1",
      externalId: "thread-1",
    });
    expect(apiMock.createAgentThread).toHaveBeenCalledWith("workspace-1", {
      idempotencyKey: "thread-new",
      projectId: "project-1",
      leadAgentId: "agent-lead",
      title: "New collaboration",
    });

    await adapter.fetch("thread-1");
    await adapter.rename("thread-1", "Renamed");
    await adapter.updateCustom?.("thread-1", { pinned: true });
    await adapter.archive("thread-1");
    await adapter.unarchive("thread-1");
    await adapter.delete("thread-1");

    expect(apiMock.getAgentThread).toHaveBeenCalledWith("workspace-1", "thread-1");
    expect(apiMock.updateAgentThread).toHaveBeenNthCalledWith(1, "workspace-1", "thread-1", {
      title: "Renamed",
    });
    expect(apiMock.updateAgentThread).toHaveBeenNthCalledWith(2, "workspace-1", "thread-1", {
      pinned: true,
    });
    expect(apiMock.updateAgentThread).toHaveBeenNthCalledWith(3, "workspace-1", "thread-1", {
      archived: true,
    });
    expect(apiMock.updateAgentThread).toHaveBeenNthCalledWith(4, "workspace-1", "thread-1", {
      archived: false,
    });
    expect(apiMock.deleteAgentThread).toHaveBeenCalledWith("workspace-1", "thread-1");
    await expect(adapter.generateTitle("thread-1", [])).rejects.toMatchObject({
      code: "AGENT_THREAD_TITLE_GENERATION_UNAVAILABLE",
    });
  });
});
