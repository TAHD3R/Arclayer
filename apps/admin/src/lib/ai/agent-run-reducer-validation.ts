import type { AgentRunProjectionV1 } from "./agent-runtime-protocol";
import { AgentRuntimeProtocolError } from "./agent-runtime-protocol";

export function readObject(value: unknown, code: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new AgentRuntimeProtocolError(code);
  }
  return value as Readonly<Record<string, unknown>>;
}

export function readString(value: unknown, code: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new AgentRuntimeProtocolError(code);
  }
  return value;
}

export function readPositiveInteger(value: unknown, code: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new AgentRuntimeProtocolError(code);
  }
  return value as number;
}

function readNonNegativeInteger(value: unknown, code: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new AgentRuntimeProtocolError(code);
  }
  return value as number;
}

export function readStringArray(value: unknown, code: string): readonly string[] {
  if (!Array.isArray(value)) throw new AgentRuntimeProtocolError(code);
  return value.map((item) => readString(item, code));
}

export function readSettlement(value: unknown, code: string): Readonly<Record<string, unknown>> {
  const settlement = readObject(value, code);
  if (!["committed", "released", "reconciled"].includes(String(settlement.outcome))) {
    throw new AgentRuntimeProtocolError(code);
  }
  if (settlement.usage !== null) readObject(settlement.usage, code);
  readString(settlement.creditsCommitted, code);
  readString(settlement.creditsReleased, code);
  return settlement;
}

export function readPublicError(value: unknown, code: string): Readonly<Record<string, unknown>> {
  const error = readObject(value, code);
  readString(error.code, code);
  readString(error.message, code);
  if (typeof error.retryable !== "boolean") throw new AgentRuntimeProtocolError(code);
  if (error.details !== undefined) readObject(error.details, code);
  return error;
}

export function readUsage(
  value: unknown,
  settlement: "provisional" | "committed",
  code: string,
): Readonly<Record<string, unknown>> {
  const usage = readObject(value, code);
  readString(usage.provider, code);
  readString(usage.model, code);
  readNonNegativeInteger(usage.inputTokens, code);
  readNonNegativeInteger(usage.outputTokens, code);
  readNonNegativeInteger(usage.totalTokens, code);
  for (const field of [usage.providerCost, usage.currency, usage.credits]) {
    if (field !== undefined) readString(field, code);
  }
  if (usage.settlement !== settlement) {
    throw new AgentRuntimeProtocolError(code);
  }
  return usage;
}

export function assertRunStatus(
  state: AgentRunProjectionV1,
  allowed: readonly AgentRunProjectionV1["runStatus"][],
): void {
  if (!allowed.includes(state.runStatus)) {
    throw new AgentRuntimeProtocolError("AGENT_EVENT_TRANSITION_INVALID");
  }
}
