import { ProofContractError } from "./v1-contract-oracle";
import type { OwnerScopeFixture, ToolResponseFixture } from "./v1-proof-fixtures";

export function authorizeFixture(
  resource: OwnerScopeFixture,
  request: OwnerScopeFixture,
): { readonly status: 200 | 403 | 404 | 410; readonly code?: string } {
  const ownerKeys = ["actorId", "workspaceId", "projectId", "threadId", "runId"] as const;
  if (ownerKeys.some((key) => resource[key] !== request[key])) {
    return { status: 404, code: "AGENT_RUN_NOT_FOUND" };
  }
  if (!request.hasPermission) return { status: 403, code: "PERMISSION_DENIED" };
  if (request.cursorExpired) return { status: 410, code: "EVENT_CURSOR_EXPIRED" };
  return { status: 200 };
}

export function resumeAfterToolResponse(
  response: ToolResponseFixture | null,
  command: {
    readonly responseId: string;
    readonly checkpointId: string;
    readonly expectedSequence: number;
    readonly currentSequence: number;
    readonly idempotencyKey: string;
  },
): { readonly status: "resumed"; readonly responseKind: ToolResponseFixture["kind"] } {
  if (!response) throw new ProofContractError("AGENT_TOOL_RESPONSE_REQUIRED");
  if (
    response.responseId !== command.responseId ||
    response.checkpointId !== command.checkpointId
  ) {
    throw new ProofContractError("AGENT_APPROVAL_CONTRACT_MISMATCH");
  }
  if (response.idempotencyKey === command.idempotencyKey) {
    throw new ProofContractError("AGENT_IDEMPOTENCY_SCOPE_CONFLICT");
  }
  if (command.expectedSequence !== command.currentSequence) {
    throw new ProofContractError("AGENT_EVENT_SEQUENCE_INVALID");
  }
  return { status: "resumed", responseKind: response.kind };
}

export function validateTerminalTrace(
  trace: readonly string[],
  outcome: "completed" | "credits-failed",
): void {
  const expected =
    outcome === "completed"
      ? [
          "provider.terminal-usage.received",
          "usage.finalized",
          "credits.committed",
          "message.persisted.complete",
          "run.persisted.completed",
          "event.appended.run.completed",
          "event.published.run.completed",
        ]
      : [
          "provider.terminal-usage.received",
          "usage.finalized",
          "credits.commit.failed",
          "credits.reconciled",
          "message.persisted.incomplete",
          "run.persisted.failed",
          "event.appended.run.failed",
          "event.published.run.failed",
        ];
  if (JSON.stringify(trace) !== JSON.stringify(expected)) {
    throw new ProofContractError("AGENT_TERMINAL_ORDER_INVALID");
  }
}
