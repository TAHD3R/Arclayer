import { describe, expect, it } from "vitest";

import {
  AgentRuntimeProtocolError,
  applyAgentRunEvent,
  createAgentRunProjection,
  reduceAgentRunEvents,
  replaceAgentRunProjectionFromExpiredCursor,
} from "@/lib/ai/agent-run-reducer";
import type { AgentRunEventV1 } from "@/lib/ai/agent-runtime-protocol";
import {
  CURSOR_EXPIRED_SNAPSHOT,
  EVENT_AFTER_SNAPSHOT,
  NESTED_AGENT_EVENTS,
  OWNER_SCOPE,
  REPLAY_EVENTS,
  proofEvent,
} from "../../contracts/ai-agent-runtime-protocol/v1-proof-fixtures";

function initialProjection() {
  return createAgentRunProjection({
    runId: OWNER_SCOPE.runId,
    threadId: OWNER_SCOPE.threadId,
    composerDraft: "unsent local draft",
  });
}

function runtimeEvent(
  sequence: number,
  type: AgentRunEventV1["type"],
  data: Readonly<Record<string, unknown>>,
): AgentRunEventV1 {
  return {
    eventVersion: 1,
    eventId: `runtime-event-${sequence}`,
    cursor: `runtime-cursor-${sequence}`,
    type,
    runId: OWNER_SCOPE.runId,
    threadId: OWNER_SCOPE.threadId,
    sequence,
    occurredAt: "2026-07-18T12:00:00.000Z",
    correlationId: "runtime-correlation",
    spanId: null,
    parentSpanId: null,
    data,
  };
}

describe("Agent Run v1 production reducer", () => {
  it("projects the successful Run lifecycle and makes completion terminal", () => {
    const events = [
      runtimeEvent(1, "run.created", {
        run: {
          status: "created",
          executionMode: "build",
          leadAgentId: "agent-lead",
          createdAt: "2026-07-18T12:00:00.000Z",
        },
      }),
      runtimeEvent(2, "run.queued", {
        queuedAt: "2026-07-18T12:00:01.000Z",
        queueClass: "interactive",
      }),
      runtimeEvent(3, "run.started", {
        startedAt: "2026-07-18T12:00:02.000Z",
        attemptNumber: 1,
        agentVersionId: "agent-version-lead",
      }),
      runtimeEvent(4, "run.interrupted", {
        interruptId: "interrupt-1",
        checkpointId: "checkpoint-1",
        reason: "approval_required",
        approvalId: "approval-1",
        toolCallId: "tool-human-input",
      }),
      runtimeEvent(5, "run.resumed", {
        interruptId: "interrupt-1",
        checkpointId: "checkpoint-1",
        resumedAt: "2026-07-18T12:00:04.000Z",
        resumeKind: "approval",
      }),
      runtimeEvent(6, "run.completed", {
        completedAt: "2026-07-18T12:00:05.000Z",
        assistantMessageId: "message-lead",
        usage: {
          provider: "openai",
          model: "gpt-5",
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          providerCost: "0.01",
          currency: "USD",
          credits: "10",
          settlement: "committed",
        },
        finishReason: "stop",
      }),
    ] as const;

    const reduced = reduceAgentRunEvents(initialProjection(), events);

    expect(reduced.runStatus).toBe("completed");
    expect(reduced.terminalType).toBe("run.completed");
    expect(reduced.run).toMatchObject({
      status: "completed",
      attemptNumber: 1,
      interruptId: "interrupt-1",
      resumedAt: "2026-07-18T12:00:04.000Z",
      finishReason: "stop",
    });
    expect(() =>
      applyAgentRunEvent(
        reduced,
        runtimeEvent(7, "usage.updated", {
          usage: { settlement: "provisional" },
          providerOccurredAt: "2026-07-18T12:00:06.000Z",
        }),
      ),
    ).toThrowError(
      expect.objectContaining<Partial<AgentRuntimeProtocolError>>({
        code: "AGENT_EVENT_AFTER_TERMINAL",
      }),
    );
  });

  it("projects and clears a human Tool interrupt from live Run events", () => {
    const beforeInterrupt = reduceAgentRunEvents(initialProjection(), [
      runtimeEvent(1, "run.created", {
        run: {
          status: "created",
          executionMode: "build",
          leadAgentId: "agent-lead",
          createdAt: "2026-07-18T12:00:00.000Z",
        },
      }),
      runtimeEvent(2, "run.queued", {
        queuedAt: "2026-07-18T12:00:01.000Z",
        queueClass: "agent-io",
      }),
      runtimeEvent(3, "run.started", {
        startedAt: "2026-07-18T12:00:02.000Z",
        attemptNumber: 1,
        agentVersionId: "agent-version-lead",
      }),
      runtimeEvent(4, "message.part.started", {
        message: {
          messageId: "message-human-tool",
          role: "assistant",
          agentId: "agent-lead",
          createdAt: "2026-07-18T12:00:03.000Z",
          placement: { kind: "thread" },
        },
        part: {
          partId: "part-human-tool",
          partIndex: 0,
          type: "tool-call",
          status: "running",
          toolCallId: "tool-call-human",
          toolName: "content.choose_variant",
          args: { variants: ["a", "b"] },
          argsText: '{"variants":["a","b"]}',
        },
      }),
    ]);
    const interrupted = applyAgentRunEvent(
      beforeInterrupt,
      runtimeEvent(5, "run.interrupted", {
        interruptId: "interrupt-human",
        checkpointId: "checkpoint-human",
        reason: "human_tool_input",
        toolCallId: "tool-call-human",
      }),
    );

    expect(interrupted.messages["message-human-tool"]?.parts[0]).toMatchObject({
      status: "requires_action",
      interrupt: {
        type: "human",
        payload: {
          interruptId: "interrupt-human",
          checkpointId: "checkpoint-human",
          toolCallId: "tool-call-human",
        },
      },
    });

    const resumed = applyAgentRunEvent(
      interrupted,
      runtimeEvent(6, "run.resumed", {
        interruptId: "interrupt-human",
        checkpointId: "checkpoint-human",
        resumedAt: "2026-07-18T12:00:04.000Z",
        resumeKind: "human_result",
      }),
    );
    expect(resumed.messages["message-human-tool"]?.parts[0]).toMatchObject({
      status: "running",
    });
    expect(resumed.messages["message-human-tool"]?.parts[0]?.interrupt).toBeUndefined();
  });

  it("keeps cancellation requested non-terminal until a settled cancellation event", () => {
    const reduced = reduceAgentRunEvents(initialProjection(), [
      runtimeEvent(1, "run.created", {
        run: {
          status: "created",
          executionMode: "plan",
          leadAgentId: "agent-lead",
          createdAt: "2026-07-18T12:00:00.000Z",
        },
      }),
      runtimeEvent(2, "run.queued", { queuedAt: "2026-07-18T12:00:01.000Z" }),
      runtimeEvent(3, "run.cancel.requested", {
        requestedAt: "2026-07-18T12:00:02.000Z",
        requestedByActorId: OWNER_SCOPE.actorId,
      }),
    ]);

    expect(reduced.runStatus).toBe("cancellation_requested");
    expect(reduced.terminalType).toBeNull();
    expect(reduced.run).toMatchObject({
      status: "cancellation_requested",
      cancellationRequestedAt: "2026-07-18T12:00:02.000Z",
    });

    const cancelled = applyAgentRunEvent(
      reduced,
      runtimeEvent(4, "run.cancelled", {
        cancelledAt: "2026-07-18T12:00:03.000Z",
        reasonCode: "user_requested",
        incompletePartIds: ["part-streaming"],
        settlement: {
          outcome: "released",
          usage: null,
          creditsCommitted: "0",
          creditsReleased: "10",
        },
      }),
    );

    expect(cancelled.runStatus).toBe("cancelled");
    expect(cancelled.terminalType).toBe("run.cancelled");
    expect(cancelled.run).toMatchObject({ status: "cancelled", reasonCode: "user_requested" });
  });

  it("projects a settled failure as terminal with its public error", () => {
    const failed = reduceAgentRunEvents(initialProjection(), [
      runtimeEvent(1, "run.created", {
        run: {
          status: "created",
          executionMode: "build",
          leadAgentId: "agent-lead",
          createdAt: "2026-07-18T12:00:00.000Z",
        },
      }),
      runtimeEvent(2, "run.started", {
        startedAt: "2026-07-18T12:00:01.000Z",
        attemptNumber: 1,
        agentVersionId: "agent-version-lead",
      }),
      runtimeEvent(3, "run.failed", {
        failedAt: "2026-07-18T12:00:02.000Z",
        error: {
          code: "provider_unavailable",
          message: "The model provider is temporarily unavailable.",
          retryable: true,
        },
        incompletePartIds: ["part-streaming"],
        settlement: {
          outcome: "reconciled",
          usage: null,
          creditsCommitted: "2",
          creditsReleased: "8",
        },
      }),
    ]);

    expect(failed.runStatus).toBe("failed");
    expect(failed.terminalType).toBe("run.failed");
    expect(failed.run).toMatchObject({
      status: "failed",
      error: { code: "provider_unavailable", retryable: true },
    });
  });

  it("projects Tool execution onto an existing tool-call part until its canonical completion", () => {
    const beforePartCompletion = reduceAgentRunEvents(initialProjection(), [
      runtimeEvent(1, "run.created", {
        run: {
          status: "created",
          executionMode: "build",
          leadAgentId: "agent-lead",
          createdAt: "2026-07-18T12:00:00.000Z",
        },
      }),
      runtimeEvent(2, "run.started", {
        startedAt: "2026-07-18T12:00:01.000Z",
        attemptNumber: 1,
        agentVersionId: "agent-version-lead",
      }),
      runtimeEvent(3, "message.part.started", {
        message: {
          messageId: "message-lead",
          role: "assistant",
          agentId: "agent-lead",
          createdAt: "2026-07-18T12:00:02.000Z",
          placement: { kind: "thread" },
        },
        part: {
          partId: "part-tool",
          partIndex: 0,
          type: "tool-call",
          status: "running",
          toolCallId: "tool-call-1",
          toolName: "content.query",
          args: { query: "pricing" },
          argsText: '{"query":"pricing"}',
        },
      }),
      runtimeEvent(4, "tool.started", {
        messageId: "message-lead",
        partId: "part-tool",
        toolCallId: "tool-call-1",
        toolId: "tool-content-query",
        toolVersion: "v1",
        toolName: "content.query",
        args: { query: "pricing" },
        argsText: '{"query":"pricing"}',
        startedAt: "2026-07-18T12:00:03.000Z",
      }),
      runtimeEvent(5, "tool.progress", {
        toolCallId: "tool-call-1",
        progress: {
          messageKey: "agents.tools.contentQuery.searching",
          messageParams: { collection: "pages" },
          current: 1,
          total: 2,
          unit: "collections",
        },
      }),
      runtimeEvent(6, "tool.completed", {
        toolCallId: "tool-call-1",
        completedAt: "2026-07-18T12:00:04.000Z",
        result: { matchCount: 2 },
        artifactRefs: [{ artifactId: "artifact-query-results" }],
      }),
    ]);

    expect(beforePartCompletion.messages["message-lead"]?.parts[0]).toMatchObject({
      partId: "part-tool",
      status: "running",
      toolId: "tool-content-query",
      progress: { current: 1, total: 2 },
      result: { matchCount: 2 },
    });

    const completed = applyAgentRunEvent(
      beforePartCompletion,
      runtimeEvent(7, "message.part.completed", {
        messageId: "message-lead",
        part: {
          partId: "part-tool",
          partIndex: 0,
          type: "tool-call",
          status: "complete",
          toolCallId: "tool-call-1",
          toolName: "content.query",
          args: { query: "pricing" },
          argsText: '{"query":"pricing"}',
          result: { matchCount: 2 },
          artifactRefs: [{ artifactId: "artifact-query-results" }],
        },
      }),
    );

    expect(completed.messages["message-lead"]?.parts[0]?.status).toBe("complete");
  });

  it("appends ordered parts to one message without duplicating its thread placement", () => {
    const projected = reduceAgentRunEvents(initialProjection(), [
      runtimeEvent(1, "run.created", {
        run: {
          status: "created",
          executionMode: "build",
          leadAgentId: "agent-lead",
          createdAt: "2026-07-18T12:00:00.000Z",
        },
      }),
      runtimeEvent(2, "run.started", {
        startedAt: "2026-07-18T12:00:01.000Z",
        attemptNumber: 1,
        agentVersionId: "agent-version-lead",
      }),
      runtimeEvent(3, "message.part.started", {
        message: {
          messageId: "message-multipart",
          role: "assistant",
          agentId: "agent-lead",
          createdAt: "2026-07-18T12:00:02.000Z",
          placement: { kind: "thread" },
        },
        part: {
          partId: "part-text",
          partIndex: 0,
          type: "text",
          status: "running",
          text: "",
        },
      }),
      runtimeEvent(4, "message.part.completed", {
        messageId: "message-multipart",
        part: {
          partId: "part-text",
          partIndex: 0,
          type: "text",
          status: "complete",
          text: "I found the relevant page.",
        },
      }),
      runtimeEvent(5, "message.part.started", {
        message: {
          messageId: "message-multipart",
          role: "assistant",
          agentId: "agent-lead",
          createdAt: "2026-07-18T12:00:02.000Z",
          placement: { kind: "thread" },
        },
        part: {
          partId: "part-tool",
          partIndex: 1,
          type: "tool-call",
          status: "running",
          toolCallId: "tool-call-multipart",
          toolName: "content.query",
          args: { query: "homepage" },
          argsText: '{"query":"homepage"}',
        },
      }),
    ]);

    expect(projected.topLevelMessageIds).toEqual(["message-multipart"]);
    expect(projected.messages["message-multipart"]?.parts.map((part) => part.partId)).toEqual([
      "part-text",
      "part-tool",
    ]);
  });

  it("rejects text deltas on Tool parts and completion snapshots that change part identity", () => {
    const toolPart = reduceAgentRunEvents(initialProjection(), [
      runtimeEvent(1, "run.created", {
        run: {
          status: "created",
          executionMode: "build",
          leadAgentId: "agent-lead",
          createdAt: "2026-07-18T12:00:00.000Z",
        },
      }),
      runtimeEvent(2, "run.started", {
        startedAt: "2026-07-18T12:00:01.000Z",
        attemptNumber: 1,
        agentVersionId: "agent-version-lead",
      }),
      runtimeEvent(3, "message.part.started", {
        message: {
          messageId: "message-integrity",
          role: "assistant",
          agentId: "agent-lead",
          createdAt: "2026-07-18T12:00:02.000Z",
          placement: { kind: "thread" },
        },
        part: {
          partId: "part-tool",
          partIndex: 0,
          type: "tool-call",
          status: "running",
          toolCallId: "tool-call-integrity",
          toolName: "content.query",
          args: {},
          argsText: "{}",
        },
      }),
    ]);

    expect(() =>
      applyAgentRunEvent(
        toolPart,
        runtimeEvent(4, "message.part.delta", {
          messageId: "message-integrity",
          partId: "part-tool",
          delta: { kind: "text.append", text: "not valid for a Tool" },
        }),
      ),
    ).toThrowError(
      expect.objectContaining<Partial<AgentRuntimeProtocolError>>({
        code: "AGENT_EVENT_PAYLOAD_INVALID",
      }),
    );
    expect(() =>
      applyAgentRunEvent(
        toolPart,
        runtimeEvent(4, "message.part.completed", {
          messageId: "message-integrity",
          part: {
            partId: "part-tool",
            partIndex: 0,
            type: "text",
            status: "complete",
            text: "identity drift",
          },
        }),
      ),
    ).toThrowError(
      expect.objectContaining<Partial<AgentRuntimeProtocolError>>({
        code: "AGENT_EVENT_PAYLOAD_INVALID",
      }),
    );
  });

  it("projects a Tool failure without making the parent Run terminal", () => {
    const failedTool = reduceAgentRunEvents(initialProjection(), [
      runtimeEvent(1, "run.created", {
        run: {
          status: "created",
          executionMode: "build",
          leadAgentId: "agent-lead",
          createdAt: "2026-07-18T12:00:00.000Z",
        },
      }),
      runtimeEvent(2, "run.started", {
        startedAt: "2026-07-18T12:00:01.000Z",
        attemptNumber: 1,
        agentVersionId: "agent-version-lead",
      }),
      runtimeEvent(3, "message.part.started", {
        message: {
          messageId: "message-lead",
          role: "assistant",
          agentId: "agent-lead",
          createdAt: "2026-07-18T12:00:02.000Z",
          placement: { kind: "thread" },
        },
        part: {
          partId: "part-tool",
          type: "tool-call",
          status: "running",
          toolCallId: "tool-call-1",
          toolName: "connector.publish",
          args: { target: "production" },
          argsText: '{"target":"production"}',
        },
      }),
      runtimeEvent(4, "tool.started", {
        messageId: "message-lead",
        partId: "part-tool",
        toolCallId: "tool-call-1",
        toolId: "tool-connector-publish",
        toolVersion: "v1",
        toolName: "connector.publish",
        args: { target: "production" },
        argsText: '{"target":"production"}',
        startedAt: "2026-07-18T12:00:03.000Z",
      }),
      runtimeEvent(5, "tool.failed", {
        toolCallId: "tool-call-1",
        failedAt: "2026-07-18T12:00:04.000Z",
        error: {
          code: "connector_unavailable",
          message: "The publishing connector is unavailable.",
          retryable: true,
        },
      }),
    ]);

    expect(failedTool.runStatus).toBe("running");
    expect(failedTool.terminalType).toBeNull();
    expect(failedTool.messages["message-lead"]?.parts[0]).toMatchObject({
      status: "running",
      failedAt: "2026-07-18T12:00:04.000Z",
      error: { code: "connector_unavailable", retryable: true },
    });
  });

  it("attaches approval metadata to a Tool part across interrupt and resume", () => {
    const resumed = reduceAgentRunEvents(initialProjection(), [
      runtimeEvent(1, "run.created", {
        run: {
          status: "created",
          executionMode: "build",
          leadAgentId: "agent-lead",
          createdAt: "2026-07-18T12:00:00.000Z",
        },
      }),
      runtimeEvent(2, "run.started", {
        startedAt: "2026-07-18T12:00:01.000Z",
        attemptNumber: 1,
        agentVersionId: "agent-version-lead",
      }),
      runtimeEvent(3, "message.part.started", {
        message: {
          messageId: "message-lead",
          role: "assistant",
          agentId: "agent-lead",
          createdAt: "2026-07-18T12:00:02.000Z",
          placement: { kind: "thread" },
        },
        part: {
          partId: "part-tool",
          type: "tool-call",
          status: "running",
          toolCallId: "tool-call-approval",
          toolName: "content.apply_change_set",
          args: { changeSetId: "changeset-1" },
          argsText: '{"changeSetId":"changeset-1"}',
        },
      }),
      runtimeEvent(4, "tool.started", {
        messageId: "message-lead",
        partId: "part-tool",
        toolCallId: "tool-call-approval",
        toolId: "tool-apply-change-set",
        toolVersion: "v1",
        toolName: "content.apply_change_set",
        args: { changeSetId: "changeset-1" },
        argsText: '{"changeSetId":"changeset-1"}',
        startedAt: "2026-07-18T12:00:03.000Z",
      }),
      runtimeEvent(5, "approval.required", {
        messageId: "message-lead",
        partId: "part-tool",
        approval: {
          approvalId: "approval-1",
          approvalVersion: 1,
          toolCallId: "tool-call-approval",
          checkpointId: "checkpoint-1",
          status: "pending",
          requestedAt: "2026-07-18T12:00:04.000Z",
          expiresAt: "2026-07-18T13:00:04.000Z",
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
              grants: [],
              confirm: false,
            },
          ],
        },
      }),
      runtimeEvent(6, "run.interrupted", {
        interruptId: "interrupt-approval-1",
        checkpointId: "checkpoint-1",
        reason: "approval_required",
        approvalId: "approval-1",
        toolCallId: "tool-call-approval",
      }),
      runtimeEvent(7, "approval.resolved", {
        approval: {
          approvalId: "approval-1",
          approvalVersion: 1,
          toolCallId: "tool-call-approval",
          checkpointId: "checkpoint-1",
          status: "approved",
          requestedAt: "2026-07-18T12:00:04.000Z",
          expiresAt: "2026-07-18T13:00:04.000Z",
          policyVersion: "policy-1",
          risk: {
            sideEffectClass: "external_write",
            summaryKey: "agents.approval.externalWrite.summary",
            summaryParams: { target: "homepage" },
            previewRef: "preview-1",
          },
          options: [],
        },
        resolvedAt: "2026-07-18T12:01:00.000Z",
        resolvedByActorId: OWNER_SCOPE.actorId,
      }),
      runtimeEvent(8, "run.resumed", {
        interruptId: "interrupt-approval-1",
        checkpointId: "checkpoint-1",
        resumedAt: "2026-07-18T12:01:01.000Z",
        resumeKind: "approval",
      }),
    ]);

    const parts = resumed.messages["message-lead"]?.parts;
    expect(parts).toHaveLength(1);
    expect(parts?.[0]).toMatchObject({
      type: "tool-call",
      status: "running",
      approval: { approvalId: "approval-1", status: "approved" },
    });
    expect(resumed.runStatus).toBe("running");
    expect(resumed.pendingInterruptRequirement).toBeNull();
  });

  it("projects a failed specialist delegation without terminating the lead Run", () => {
    const delegated = reduceAgentRunEvents(initialProjection(), [
      runtimeEvent(1, "run.created", {
        run: {
          status: "created",
          executionMode: "build",
          leadAgentId: "agent-lead",
          createdAt: "2026-07-18T12:00:00.000Z",
        },
      }),
      runtimeEvent(2, "run.started", {
        startedAt: "2026-07-18T12:00:01.000Z",
        attemptNumber: 1,
        agentVersionId: "agent-version-lead",
      }),
      runtimeEvent(3, "message.part.started", {
        message: {
          messageId: "message-lead",
          role: "assistant",
          agentId: "agent-lead",
          createdAt: "2026-07-18T12:00:02.000Z",
          placement: { kind: "thread" },
        },
        part: {
          partId: "part-delegation",
          type: "tool-call",
          status: "running",
          toolCallId: "tool-delegation",
          toolName: "agent.delegate",
          args: { objective: "Analyze conversion data" },
          argsText: '{"objective":"Analyze conversion data"}',
        },
      }),
      runtimeEvent(4, "delegation.delegated", {
        delegationId: "delegation-analytics",
        parentToolCallId: "tool-delegation",
        childRunId: "run-child-analytics",
        sourceAgentVersionId: "agent-version-lead",
        targetAgentVersionId: "agent-version-analyst",
        delegatedAt: "2026-07-18T12:00:03.000Z",
        objectiveSummary: "Analyze conversion data",
      }),
      runtimeEvent(5, "delegation.failed", {
        delegationId: "delegation-analytics",
        childRunId: "run-child-analytics",
        failedAt: "2026-07-18T12:00:04.000Z",
        error: {
          code: "dataset_unavailable",
          message: "The requested analytics dataset is unavailable.",
          retryable: false,
        },
      }),
    ]);

    expect(delegated.runStatus).toBe("running");
    expect(delegated.terminalType).toBeNull();
    expect(delegated.delegations["delegation-analytics"]).toMatchObject({
      status: "failed",
      childRunId: "run-child-analytics",
      error: { code: "dataset_unavailable" },
    });
  });

  it("projects provisional usage and a reviewable ChangeSet without claiming completion", () => {
    const projected = reduceAgentRunEvents(initialProjection(), [
      runtimeEvent(1, "run.created", {
        run: {
          status: "created",
          executionMode: "build",
          leadAgentId: "agent-lead",
          createdAt: "2026-07-18T12:00:00.000Z",
        },
      }),
      runtimeEvent(2, "run.started", {
        startedAt: "2026-07-18T12:00:01.000Z",
        attemptNumber: 1,
        agentVersionId: "agent-version-lead",
      }),
      runtimeEvent(3, "usage.updated", {
        usage: {
          provider: "openai",
          model: "gpt-5",
          inputTokens: 120,
          outputTokens: 48,
          totalTokens: 168,
          providerCost: "0.0042",
          currency: "USD",
          credits: "4.2",
          settlement: "provisional",
        },
        providerOccurredAt: "2026-07-18T12:00:02.000Z",
      }),
      runtimeEvent(4, "changeset.proposed", {
        changeSetId: "changeset-hero",
        baseRevisionId: "revision-4",
        previewRef: "preview-changeset-hero",
        summaryKey: "agents.changesets.heroRewrite.summary",
        summaryParams: { page: "home" },
        warnings: [{ code: "copy_length_changed" }],
        requiredApprovalIds: ["approval-publish"],
      }),
    ]);

    expect(projected.usage).toMatchObject({ settlement: "provisional", totalTokens: 168 });
    expect(projected.changeSets["changeset-hero"]).toMatchObject({
      status: "proposed",
      baseRevisionId: "revision-4",
      requiredApprovalIds: ["approval-publish"],
    });
    expect(projected.runStatus).toBe("running");
    expect(projected.terminalType).toBeNull();
  });

  it("rejects invalid envelopes, event identity reuse, and illegal initial transitions", () => {
    const created = runtimeEvent(1, "run.created", {
      run: {
        status: "created",
        executionMode: "build",
        leadAgentId: "agent-lead",
        createdAt: "2026-07-18T12:00:00.000Z",
      },
    });

    expect(() =>
      applyAgentRunEvent(initialProjection(), { ...created, eventVersion: 2 }),
    ).toThrowError(
      expect.objectContaining<Partial<AgentRuntimeProtocolError>>({
        code: "AGENT_EVENT_VERSION_UNSUPPORTED",
      }),
    );
    expect(() =>
      applyAgentRunEvent(initialProjection(), {
        ...created,
        type: "run.future" as AgentRunEventV1["type"],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<AgentRuntimeProtocolError>>({
        code: "AGENT_EVENT_TYPE_UNSUPPORTED",
      }),
    );
    expect(() => applyAgentRunEvent(initialProjection(), { ...created, eventId: "" })).toThrowError(
      expect.objectContaining<Partial<AgentRuntimeProtocolError>>({
        code: "AGENT_EVENT_ENVELOPE_INVALID",
      }),
    );
    expect(() =>
      applyAgentRunEvent(
        initialProjection(),
        runtimeEvent(1, "usage.updated", {
          usage: { settlement: "provisional" },
          providerOccurredAt: "2026-07-18T12:00:01.000Z",
        }),
      ),
    ).toThrowError(
      expect.objectContaining<Partial<AgentRuntimeProtocolError>>({
        code: "AGENT_EVENT_TRANSITION_INVALID",
      }),
    );

    const afterCreated = applyAgentRunEvent(initialProjection(), created);
    expect(() =>
      applyAgentRunEvent(afterCreated, {
        ...runtimeEvent(2, "run.started", {
          startedAt: "2026-07-18T12:00:01.000Z",
          attemptNumber: 1,
          agentVersionId: "agent-version-lead",
        }),
        eventId: created.eventId,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<AgentRuntimeProtocolError>>({
        code: "AGENT_EVENT_ID_REUSED",
      }),
    );
    expect(() => applyAgentRunEvent(afterCreated, runtimeEvent(2, "run.queued", {}))).toThrowError(
      expect.objectContaining<Partial<AgentRuntimeProtocolError>>({
        code: "AGENT_EVENT_PAYLOAD_INVALID",
      }),
    );
  });

  it("reduces ordered events, ignores an exact duplicate, and rejects sequence drift", () => {
    const reduced = reduceAgentRunEvents(initialProjection(), NESTED_AGENT_EVENTS);

    expect(reduced.lastSequence).toBe(8);
    expect(reduced.lastCursor).toBe("cursor-8");
    expect(reduced.topLevelMessageIds).toEqual(["message-lead"]);
    expect(reduced.nestedMessageIds).toEqual(["message-child"]);
    expect(applyAgentRunEvent(reduced, NESTED_AGENT_EVENTS[2])).toBe(reduced);

    const conflicting = proofEvent(8, "run.failed", { error: { code: "DIFFERENT" } });
    expect(() => applyAgentRunEvent(reduced, conflicting)).toThrowError(
      expect.objectContaining<Partial<AgentRuntimeProtocolError>>({
        code: "AGENT_EVENT_SEQUENCE_INVALID",
      }),
    );
    expect(() => applyAgentRunEvent(reduced, proofEvent(10, "run.failed", {}))).toThrowError(
      expect.objectContaining<Partial<AgentRuntimeProtocolError>>({
        code: "AGENT_EVENT_SEQUENCE_INVALID",
      }),
    );
  });

  it("replaces backend-owned state on cursor expiry while retaining the unsent draft", () => {
    const stale = reduceAgentRunEvents(initialProjection(), REPLAY_EVENTS);
    const replaced = replaceAgentRunProjectionFromExpiredCursor(stale, {
      error: "EVENT_CURSOR_EXPIRED",
      snapshot: CURSOR_EXPIRED_SNAPSHOT,
    });
    const resumed = applyAgentRunEvent(replaced, EVENT_AFTER_SNAPSHOT);

    expect(replaced.composerDraft).toBe("unsent local draft");
    expect(replaced.lastSequence).toBe(7);
    expect(replaced.lastCursor).toBe("cursor-7");
    expect(Object.keys(replaced.messages)).toEqual(["message-restored"]);
    expect(resumed.lastSequence).toBe(8);
    expect(resumed.messages["message-restored"]?.parts[0]?.text).toBe("Restored + resumed");
  });

  it("restores the exact failed terminal state from an expired-cursor snapshot", () => {
    const stale = reduceAgentRunEvents(initialProjection(), REPLAY_EVENTS);
    const replaced = replaceAgentRunProjectionFromExpiredCursor(stale, {
      error: "EVENT_CURSOR_EXPIRED",
      snapshot: {
        ...CURSOR_EXPIRED_SNAPSHOT,
        terminal: true,
        lastSequence: 12,
        lastCursor: "cursor-12",
        run: {
          status: "failed",
          failedAt: "2026-07-18T12:05:00.000Z",
        },
        usage: {
          provider: "openai",
          model: "gpt-5",
          inputTokens: 20,
          outputTokens: 5,
          totalTokens: 25,
          settlement: "provisional",
        },
        error: {
          code: "provider_unavailable",
          message: "The model provider is unavailable.",
          retryable: true,
        },
        delegations: [
          {
            delegationId: "delegation-restored",
            childRunId: "child-run-restored",
            status: "failed",
          },
        ],
      },
    });

    expect(replaced.runStatus).toBe("failed");
    expect(replaced.terminalType).toBe("run.failed");
    expect(replaced.usage).toMatchObject({ totalTokens: 25, settlement: "provisional" });
    expect(replaced.delegations["delegation-restored"]).toMatchObject({
      status: "failed",
    });
    expect(() =>
      applyAgentRunEvent(
        replaced,
        runtimeEvent(13, "usage.updated", {
          usage: { settlement: "provisional" },
          providerOccurredAt: "2026-07-18T12:06:00.000Z",
        }),
      ),
    ).toThrowError(
      expect.objectContaining<Partial<AgentRuntimeProtocolError>>({
        code: "AGENT_EVENT_AFTER_TERMINAL",
      }),
    );
  });

  it("restores user identity, pending approval, and change sets from a snapshot", () => {
    const stale = reduceAgentRunEvents(initialProjection(), REPLAY_EVENTS);
    const replaced = replaceAgentRunProjectionFromExpiredCursor(stale, {
      error: "EVENT_CURSOR_EXPIRED",
      snapshot: {
        ...CURSOR_EXPIRED_SNAPSHOT,
        messages: [
          {
            messageId: "message-user-restored",
            role: "user",
            agentId: null,
            actorUserId: OWNER_SCOPE.actorId,
            createdAt: "2026-07-18T12:00:00.000Z",
            placement: { kind: "thread" },
            parts: [
              {
                partId: "part-user-restored",
                partIndex: 0,
                type: "text",
                text: "Restore my draft.",
                status: "complete",
              },
            ],
          },
          {
            messageId: "message-assistant-restored",
            role: "assistant",
            agentId: "agent-lead",
            actorUserId: null,
            createdAt: "2026-07-18T12:00:01.000Z",
            placement: { kind: "thread" },
            parts: [
              {
                partId: "part-assistant-restored",
                partIndex: 0,
                type: "text",
                text: "I restored the draft.",
                status: "complete",
              },
            ],
          },
        ],
        pendingApprovals: [
          {
            approvalId: "approval-restored",
            toolCallId: "tool-restored",
            checkpointId: "checkpoint-restored",
            status: "pending",
          },
        ],
        changeSets: [
          {
            changeSetId: "changeset-restored",
            baseRevisionId: "revision-1",
            previewRef: "artifact://changeset-restored",
          },
        ],
      },
    });

    expect(replaced.messages["message-user-restored"]).toMatchObject({
      role: "user",
      actorUserId: OWNER_SCOPE.actorId,
    });
    expect(replaced.messages["message-assistant-restored"]).toMatchObject({
      role: "assistant",
      agentId: "agent-lead",
    });
    expect(replaced.pendingInterruptRequirement).toEqual({
      approvalId: "approval-restored",
      toolCallId: "tool-restored",
      checkpointId: "checkpoint-restored",
    });
    expect(replaced.changeSets["changeset-restored"]).toMatchObject({
      baseRevisionId: "revision-1",
    });
  });
});
