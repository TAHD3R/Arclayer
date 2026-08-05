import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("@/lib/http", () => ({ api: apiMock }));

import {
  cancelAgentRun,
  createAgentRun,
  getAgentRunSnapshot,
  respondToAgentToolCall,
  resumeAgentRun,
} from "@/lib/ai/agent-run-api";

describe("Agent Run v1 canonical Admin API", () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.post.mockReset();
    apiMock.get.mockResolvedValue({});
    apiMock.post.mockResolvedValue({});
  });

  it("uses workspace-scoped Run, snapshot, resume, cancel, and Tool-response resources", async () => {
    const startRun = {
      threadId: "thread-1",
      leadAgentId: "agent-lead",
      mentionedAgentIds: ["agent-writer", "agent-analyst"],
      selectedSkillInstallationIds: ["installation-content", "installation-seo"],
      executionMode: "build" as const,
      workspaceId: "workspace-1",
      projectId: "project-1",
      siteRevisionId: "revision-4",
      message: "Rewrite the homepage with the specialist Agents.",
      idempotencyKey: "run-command-1",
    };

    await createAgentRun(startRun, { signal: new AbortController().signal });
    await getAgentRunSnapshot("workspace-1", "run-1");
    await respondToAgentToolCall("workspace-1", "tool-call-1", {
      kind: "approval",
      approvalId: "approval-1",
      approvalVersion: 2,
      checkpointId: "checkpoint-1",
      approved: true,
      optionId: "allow_once",
      idempotencyKey: "tool-response-1",
    });
    await resumeAgentRun("workspace-1", "run-1", {
      responseId: "response-1",
      checkpointId: "checkpoint-1",
      expectedSequence: 12,
      idempotencyKey: "resume-command-1",
    });
    await cancelAgentRun("workspace-1", "run-1");

    expect(apiMock.post).toHaveBeenNthCalledWith(
      1,
      "/workspaces/workspace-1/ai/threads/thread-1/runs",
      {
        leadAgentId: "agent-lead",
        mentionedAgentIds: ["agent-writer", "agent-analyst"],
        selectedSkillInstallationIds: ["installation-content", "installation-seo"],
        executionMode: "build",
        projectId: "project-1",
        siteRevisionId: "revision-4",
        message: "Rewrite the homepage with the specialist Agents.",
      },
      {
        signal: expect.any(AbortSignal),
        headers: { "Idempotency-Key": "run-command-1" },
      },
    );
    expect(apiMock.get).toHaveBeenCalledWith("/workspaces/workspace-1/ai/runs/run-1", undefined);
    expect(apiMock.post).toHaveBeenNthCalledWith(
      2,
      "/workspaces/workspace-1/ai/tool-calls/tool-call-1/responses",
      {
        kind: "approval",
        approvalId: "approval-1",
        approvalVersion: 2,
        checkpointId: "checkpoint-1",
        approved: true,
        optionId: "allow_once",
      },
      { headers: { "Idempotency-Key": "tool-response-1" } },
    );
    expect(apiMock.post).toHaveBeenNthCalledWith(
      3,
      "/workspaces/workspace-1/ai/runs/run-1/resume",
      {
        responseId: "response-1",
        checkpointId: "checkpoint-1",
        expectedSequence: 12,
        idempotencyKey: "resume-command-1",
      },
      undefined,
    );
    expect(apiMock.post).toHaveBeenNthCalledWith(
      4,
      "/workspaces/workspace-1/ai/runs/run-1/cancel",
      undefined,
      undefined,
    );
  });
});
