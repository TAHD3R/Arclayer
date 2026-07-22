import type { ToolCallMessagePart } from "@assistant-ui/react";
import { describe, expect, it, vi } from "vitest";

import { projectAgentRunToAssistantMessages } from "@/lib/ai/agent-assistant-ui-adapter";
import {
  createAgentRunProjection,
  reduceAgentRunEvents,
  replaceAgentRunProjectionFromExpiredCursor,
} from "@/lib/ai/agent-run-reducer";
import {
  NESTED_AGENT_EVENTS,
  OWNER_SCOPE,
} from "../../contracts/ai-agent-runtime-protocol/v1-proof-fixtures";

describe("Agent Run v1 assistant-ui adapter", () => {
  it("keeps delegated Agent messages nested inside their parent Tool call", () => {
    const projection = reduceAgentRunEvents(
      createAgentRunProjection({
        runId: OWNER_SCOPE.runId,
        threadId: OWNER_SCOPE.threadId,
      }),
      NESTED_AGENT_EVENTS,
    );

    const messages = projectAgentRunToAssistantMessages(projection, {
      registeredToolNames: new Set(["agent.delegate"]),
      localize: (key) => key,
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      id: "message-lead",
      role: "assistant",
      status: { type: "running" },
      metadata: { custom: { agentId: "agent-lead", placement: { kind: "thread" } } },
    });
    const toolPart = messages[0]?.content.find(
      (part): part is ToolCallMessagePart => part.type === "tool-call",
    );
    expect(toolPart?.toolName).toBe("agent.delegate");
    expect(toolPart?.messages).toHaveLength(1);
    expect(toolPart?.messages?.[0]).toMatchObject({
      id: "message-child",
      role: "assistant",
      status: { type: "complete", reason: "stop" },
      content: [{ type: "text", text: "Build with confidence." }],
      metadata: {
        custom: {
          agentId: "agent-writer",
          placement: {
            kind: "delegation",
            delegationId: "delegation-1",
            parentToolCallId: "tool-delegation",
            sourceRunId: "run-child-1",
          },
        },
      },
    });
  });

  it("maps pending ApprovalV1 metadata and localized options onto its Tool call", () => {
    const projection = replaceAgentRunProjectionFromExpiredCursor(
      createAgentRunProjection({
        runId: OWNER_SCOPE.runId,
        threadId: OWNER_SCOPE.threadId,
      }),
      {
        error: "EVENT_CURSOR_EXPIRED",
        snapshot: {
          snapshotVersion: 1,
          runId: OWNER_SCOPE.runId,
          threadId: OWNER_SCOPE.threadId,
          terminal: false,
          lastSequence: 6,
          lastCursor: "cursor-6",
          run: {
            status: "interrupted",
            interrupt: {
              interruptId: "interrupt-approval",
              checkpointId: "checkpoint-1",
              reason: "approval_required",
              approvalId: "approval-1",
              toolCallId: "tool-call-approval",
            },
          },
          messages: [
            {
              messageId: "message-approval",
              role: "assistant",
              agentId: "agent-lead",
              createdAt: "2026-07-18T12:00:00.000Z",
              placement: { kind: "thread" },
              parts: [
                {
                  partId: "part-approval",
                  partIndex: 0,
                  type: "tool-call",
                  status: "requires_action",
                  toolCallId: "tool-call-approval",
                  toolName: "content.apply_change_set",
                  args: { changeSetId: "changeset-1" },
                  argsText: '{"changeSetId":"changeset-1"}',
                  approval: {
                    approvalId: "approval-1",
                    approvalVersion: 2,
                    toolCallId: "tool-call-approval",
                    checkpointId: "checkpoint-1",
                    status: "pending",
                    requestedAt: "2026-07-18T12:00:00.000Z",
                    expiresAt: "2026-07-18T13:00:00.000Z",
                    policyVersion: "policy-1",
                    risk: {
                      sideEffectClass: "external_write",
                      summaryKey: "agents.approval.externalWrite.summary",
                      summaryParams: { target: "homepage" },
                      previewRef: "preview-1",
                    },
                    options: [
                      {
                        id: "allow_once",
                        kind: "allow-once",
                        labelKey: "agents.approval.allowOnce",
                        descriptionKey: "agents.approval.allowOnceDescription",
                        grants: ["content:write"],
                        confirm: false,
                      },
                    ],
                  },
                },
              ],
            },
          ],
          pendingApprovals: [
            {
              approvalId: "approval-1",
              toolCallId: "tool-call-approval",
              checkpointId: "checkpoint-1",
              status: "pending",
            },
          ],
        },
      },
    );

    const [message] = projectAgentRunToAssistantMessages(projection, {
      registeredToolNames: new Set(["content.apply_change_set"]),
      localize: (key, params) => `${key}:${String(params?.target ?? "")}`,
    });
    const toolPart = message?.content[0] as ToolCallMessagePart;

    expect(message?.status).toEqual({ type: "requires-action", reason: "interrupt" });
    expect(toolPart.approval).toEqual({
      id: "approval-1",
      options: [
        {
          id: "allow_once",
          kind: "allow-once",
          label: "agents.approval.allowOnce:homepage",
          description: "agents.approval.allowOnceDescription:homepage",
          grants: ["content:write"],
          confirm: false,
        },
      ],
    });
  });

  it("maps sources, authorized files, images, and public errors without dropping state", () => {
    const projection = replaceAgentRunProjectionFromExpiredCursor(
      createAgentRunProjection({
        runId: OWNER_SCOPE.runId,
        threadId: OWNER_SCOPE.threadId,
      }),
      {
        error: "EVENT_CURSOR_EXPIRED",
        snapshot: {
          snapshotVersion: 1,
          runId: OWNER_SCOPE.runId,
          threadId: OWNER_SCOPE.threadId,
          terminal: true,
          lastSequence: 9,
          lastCursor: "cursor-9",
          run: { status: "failed" },
          messages: [
            {
              messageId: "message-evidence",
              role: "assistant",
              agentId: "agent-analyst",
              createdAt: "2026-07-18T12:00:00.000Z",
              placement: { kind: "thread" },
              parts: [
                {
                  partId: "part-source",
                  partIndex: 0,
                  type: "source",
                  status: "complete",
                  sourceId: "source-1",
                  sourceType: "url",
                  url: "https://docs.example.com/report",
                  title: "Conversion report",
                },
                {
                  partId: "part-file",
                  partIndex: 1,
                  type: "file",
                  status: "complete",
                  name: "report.csv",
                  mimeType: "text/csv",
                  url: "https://assets.example.com/report.csv",
                  size: 128,
                },
                {
                  partId: "part-image",
                  partIndex: 2,
                  type: "image",
                  status: "complete",
                  name: "funnel.png",
                  mimeType: "image/png",
                  url: "https://assets.example.com/funnel.png",
                  alt: "Conversion funnel",
                },
                {
                  partId: "part-error",
                  partIndex: 3,
                  type: "error",
                  status: "failed",
                  error: {
                    code: "dataset_incomplete",
                    message: "Some analytics rows are unavailable.",
                    retryable: false,
                  },
                },
              ],
            },
          ],
        },
      },
    );

    const [message] = projectAgentRunToAssistantMessages(projection, {
      registeredToolNames: new Set(),
      localize: (key) => key,
    });

    expect(message?.status).toMatchObject({ type: "incomplete", reason: "error" });
    expect(message?.content).toEqual([
      {
        type: "source",
        sourceType: "url",
        id: "source-1",
        url: "https://docs.example.com/report",
        title: "Conversion report",
      },
      {
        type: "file",
        filename: "report.csv",
        data: "https://assets.example.com/report.csv",
        mimeType: "text/csv",
      },
      {
        type: "image",
        image: "https://assets.example.com/funnel.png",
        filename: "funnel.png",
        alt: "Conversion funnel",
      },
      {
        type: "data",
        name: "agent-error",
        data: {
          code: "dataset_incomplete",
          message: "Some analytics rows are unavailable.",
          retryable: false,
        },
      },
    ]);
  });

  it("maps incomplete content from a cancelled Run to the cancelled message reason", () => {
    const projection = replaceAgentRunProjectionFromExpiredCursor(
      createAgentRunProjection({
        runId: OWNER_SCOPE.runId,
        threadId: OWNER_SCOPE.threadId,
      }),
      {
        error: "EVENT_CURSOR_EXPIRED",
        snapshot: {
          snapshotVersion: 1,
          runId: OWNER_SCOPE.runId,
          threadId: OWNER_SCOPE.threadId,
          terminal: true,
          lastSequence: 7,
          lastCursor: "cursor-7",
          run: { status: "cancelled" },
          messages: [
            {
              messageId: "message-cancelled",
              role: "assistant",
              agentId: "agent-lead",
              createdAt: "2026-07-18T12:00:00.000Z",
              placement: { kind: "thread" },
              parts: [
                {
                  partId: "part-cancelled",
                  partIndex: 0,
                  type: "text",
                  status: "incomplete",
                  text: "Partial response",
                },
              ],
            },
          ],
        },
      },
    );

    const [message] = projectAgentRunToAssistantMessages(projection, {
      registeredToolNames: new Set(),
      localize: (key) => key,
    });

    expect(message?.status).toEqual({ type: "incomplete", reason: "cancelled" });
  });

  it("keeps human Tool input as an interrupt instead of fabricating approval metadata", () => {
    const projection = replaceAgentRunProjectionFromExpiredCursor(
      createAgentRunProjection({
        runId: OWNER_SCOPE.runId,
        threadId: OWNER_SCOPE.threadId,
      }),
      {
        error: "EVENT_CURSOR_EXPIRED",
        snapshot: {
          snapshotVersion: 1,
          runId: OWNER_SCOPE.runId,
          threadId: OWNER_SCOPE.threadId,
          terminal: false,
          lastSequence: 5,
          lastCursor: "cursor-5",
          run: {
            status: "interrupted",
            interrupt: {
              interruptId: "interrupt-human",
              checkpointId: "checkpoint-human",
              reason: "human_tool_input",
              approvalId: null,
              toolCallId: "tool-call-human",
            },
          },
          messages: [
            {
              messageId: "message-human-tool",
              role: "assistant",
              agentId: "agent-lead",
              createdAt: "2026-07-18T12:00:00.000Z",
              placement: { kind: "thread" },
              parts: [
                {
                  partId: "part-human-tool",
                  partIndex: 0,
                  type: "tool-call",
                  status: "running",
                  toolCallId: "tool-call-human",
                  toolName: "content.choose_variant",
                  args: { variants: ["a", "b"] },
                  argsText: '{"variants":["a","b"]}',
                },
              ],
            },
          ],
        },
      },
    );

    const [message] = projectAgentRunToAssistantMessages(projection, {
      registeredToolNames: new Set(["content.choose_variant"]),
      localize: (key) => key,
    });
    const toolPart = message?.content[0] as ToolCallMessagePart;

    expect(message?.status).toEqual({ type: "requires-action", reason: "interrupt" });
    expect(toolPart.interrupt).toEqual({
      type: "human",
      payload: {
        interruptId: "interrupt-human",
        checkpointId: "checkpoint-human",
        toolCallId: "tool-call-human",
      },
    });
    expect(toolPart.approval).toBeUndefined();
  });

  it("surfaces an unregistered case-mismatched Tool as an explicit protocol error", () => {
    const projection = reduceAgentRunEvents(
      createAgentRunProjection({
        runId: OWNER_SCOPE.runId,
        threadId: OWNER_SCOPE.threadId,
      }),
      NESTED_AGENT_EVENTS,
    );
    const onDiagnostic = vi.fn();

    const [message] = projectAgentRunToAssistantMessages(projection, {
      registeredToolNames: new Set(["Agent.Delegate"]),
      localize: (key) => key,
      onDiagnostic,
    });
    const toolPart = message?.content[0] as ToolCallMessagePart;

    expect(toolPart).toMatchObject({
      type: "tool-call",
      toolName: "agent.delegate",
      isError: true,
      result: { code: "AGENT_TOOL_UNSUPPORTED", toolName: "agent.delegate" },
    });
    expect(onDiagnostic).toHaveBeenCalledWith({
      code: "AGENT_TOOL_UNSUPPORTED",
      toolName: "agent.delegate",
    });
  });
});
