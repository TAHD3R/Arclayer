import { describe, expect, it } from "vitest";

import {
  authorizeFixture,
  resumeAfterToolResponse,
  validateTerminalTrace,
} from "./v1-command-oracle";
import {
  applyProofEvent,
  emptyProjection,
  ProofContractError,
  projectDelegationToolPart,
  reduceProofEvents,
  replaceFromExpiredCursor,
} from "./v1-contract-oracle";
import {
  ASSISTANT_UI_APPROVAL_RESPONSES,
  CREDITS_FAILURE_TRACE,
  CURSOR_EXPIRED_SNAPSHOT,
  EVENT_AFTER_SNAPSHOT,
  NESTED_AGENT_EVENTS,
  OWNER_SCOPE,
  OWNER_VALIDATION_CASES,
  proofEvent,
  REPLAY_EVENTS,
  SUCCESS_TERMINAL_TRACE,
  TOOL_RESPONSE_VARIANTS,
} from "./v1-proof-fixtures";

function initialProjection() {
  return emptyProjection(OWNER_SCOPE.runId, OWNER_SCOPE.threadId);
}

describe("Agent runtime protocol v1 contract oracle", () => {
  it("applies one exact duplicate once without mutating the accepted projection", () => {
    const reduced = reduceProofEvents(initialProjection(), REPLAY_EVENTS);
    const duplicate = applyProofEvent(reduced, REPLAY_EVENTS[2]);

    expect(duplicate).toBe(reduced);
    expect(reduced.lastSequence).toBe(4);
    expect(reduced.messages["message-lead"]?.parts[0]?.text).toBe("Hello");
  });

  it("surfaces sequence gaps and conflicting duplicates", () => {
    const afterFirst = applyProofEvent(initialProjection(), REPLAY_EVENTS[0]);
    const gap = proofEvent(3, "usage.updated", { usage: { settlement: "provisional" } });
    expect(() => applyProofEvent(afterFirst, gap)).toThrowError(
      new ProofContractError("AGENT_EVENT_SEQUENCE_INVALID"),
    );

    const conflicting = proofEvent(
      1,
      "run.created",
      { run: { status: "failed" } },
      {
        eventId: "event-conflict",
      },
    );
    expect(() => applyProofEvent(afterFirst, conflicting)).toThrowError(
      new ProofContractError("AGENT_EVENT_SEQUENCE_INVALID"),
    );
  });

  it("replaces backend state on cursor expiration and resumes after the snapshot cursor", () => {
    const stale = reduceProofEvents(initialProjection(), REPLAY_EVENTS);
    const replaced = replaceFromExpiredCursor(stale, {
      error: "EVENT_CURSOR_EXPIRED",
      snapshot: CURSOR_EXPIRED_SNAPSHOT,
    });
    const resumed = applyProofEvent(replaced, EVENT_AFTER_SNAPSHOT);

    expect(replaced.messages["message-lead"]).toBeUndefined();
    expect(replaced.composerDraft).toBe("unsent local draft");
    expect(resumed.lastSequence).toBe(8);
    expect(resumed.lastCursor).toBe("cursor-8");
    expect(resumed.messages["message-restored"]?.parts[0]?.text).toBe("Restored + resumed");
  });

  it.each(OWNER_VALIDATION_CASES)("validates owner fixture: $name", ({ request, status }) => {
    expect(authorizeFixture(OWNER_SCOPE, request).status).toBe(status);
  });

  it("does not disclose cursor expiration before owner validation", () => {
    const foreignExpired = {
      ...OWNER_SCOPE,
      actorId: "user-foreign",
      cursorExpired: true,
    };
    expect(authorizeFixture(OWNER_SCOPE, foreignExpired)).toEqual({
      status: 404,
      code: "AGENT_RUN_NOT_FOUND",
    });
    expect(authorizeFixture(OWNER_SCOPE, { ...OWNER_SCOPE, cursorExpired: true })).toEqual({
      status: 410,
      code: "EVENT_CURSOR_EXPIRED",
    });
  });

  it("requires a recorded discriminated Tool response before a separately idempotent resume", () => {
    const command = {
      responseId: "response-approve",
      checkpointId: "checkpoint-1",
      expectedSequence: 12,
      currentSequence: 12,
      idempotencyKey: "resume-key-approve",
    };
    expect(() => resumeAfterToolResponse(null, command)).toThrowError(
      new ProofContractError("AGENT_TOOL_RESPONSE_REQUIRED"),
    );

    const results = TOOL_RESPONSE_VARIANTS.map((response) =>
      resumeAfterToolResponse(response, {
        ...command,
        responseId: response.responseId,
        idempotencyKey: `resume-key-${response.kind}`,
      }),
    );
    expect(results.map((result) => result.responseKind)).toEqual([
      "approval",
      "rejection",
      "modified_input",
      "human_result",
    ]);
    expect(ASSISTANT_UI_APPROVAL_RESPONSES).toHaveLength(3);
  });

  it("projects delegated Agent messages into ToolCallMessagePart.messages only", () => {
    const reduced = reduceProofEvents(initialProjection(), NESTED_AGENT_EVENTS);
    const toolPart = projectDelegationToolPart(reduced, "tool-delegation");

    expect(reduced.topLevelMessageIds).toEqual(["message-lead"]);
    expect(reduced.nestedMessageIds).toEqual(["message-child"]);
    expect(toolPart.messages?.map((message) => message.id)).toEqual(["message-child"]);
    expect(toolPart.messages?.[0]?.content).toEqual([
      { type: "text", text: "Build with confidence." },
    ]);
  });

  it("accepts successful Credits ordering and makes the terminal publication final", () => {
    expect(() => validateTerminalTrace(SUCCESS_TERMINAL_TRACE, "completed")).not.toThrow();
    expect(SUCCESS_TERMINAL_TRACE.at(-1)).toBe("event.published.run.completed");
  });

  it("requires reconciliation and an incomplete message when Credits commit fails", () => {
    expect(() => validateTerminalTrace(CREDITS_FAILURE_TRACE, "credits-failed")).not.toThrow();
    expect(CREDITS_FAILURE_TRACE).not.toContain("event.appended.run.completed");
    expect(CREDITS_FAILURE_TRACE.at(-1)).toBe("event.published.run.failed");
  });

  it("rejects public events after a committed terminal event", () => {
    const terminal = reduceProofEvents(initialProjection(), [
      proofEvent(1, "run.created", { run: { status: "running" } }),
      proofEvent(2, "run.completed", {
        usage: { settlement: "committed", credits: "4.2" },
      }),
    ]);
    expect(() =>
      applyProofEvent(
        terminal,
        proofEvent(3, "usage.updated", { usage: { settlement: "provisional" } }),
      ),
    ).toThrowError(new ProofContractError("AGENT_EVENT_AFTER_TERMINAL"));
  });
});
