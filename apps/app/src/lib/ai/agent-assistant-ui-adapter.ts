import type {
  MessageStatus,
  ThreadAssistantMessagePart,
  ThreadMessage,
  ThreadUserMessagePart,
  ToolApprovalOption,
  ToolCallMessagePart,
} from "@assistant-ui/react";

import type {
  AgentMessagePartV1,
  AgentProjectedMessageV1,
  AgentRunProjectionV1,
} from "./agent-runtime-protocol";
import { AgentRuntimeProtocolError } from "./agent-runtime-protocol";
import { readObject, readString } from "./agent-run-reducer-validation";

export interface AgentAssistantUiAdapterOptions {
  readonly registeredToolNames: ReadonlySet<string>;
  readonly localize: (key: string, params?: Readonly<Record<string, unknown>>) => string;
  readonly onDiagnostic?: (diagnostic: {
    readonly code: string;
    readonly toolName?: string;
  }) => void;
}

function readDate(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AgentRuntimeProtocolError("AGENT_MESSAGE_PROJECTION_INVALID");
  }
  return date;
}

function projectMessageStatus(
  projection: AgentRunProjectionV1,
  parts: readonly AgentMessagePartV1[],
): MessageStatus {
  if (parts.some((part) => part.status === "requires_action")) {
    return { type: "requires-action", reason: "interrupt" };
  }
  if (parts.some((part) => part.status === "running")) return { type: "running" };
  const failed = parts.find((part) => part.status === "failed");
  if (failed !== undefined) {
    return { type: "incomplete", reason: "error", error: failed.error as never };
  }
  if (parts.some((part) => part.status === "incomplete")) {
    if (projection.terminalType === "run.cancelled") {
      return { type: "incomplete", reason: "cancelled" };
    }
    if (projection.terminalType === "run.failed") {
      return {
        type: "incomplete",
        reason: "error",
        ...(projection.run?.error === undefined ? {} : { error: projection.run.error as never }),
      };
    }
    return { type: "incomplete", reason: "other" };
  }
  return { type: "complete", reason: "stop" };
}

function projectApproval(
  value: unknown,
  options: AgentAssistantUiAdapterOptions,
): ToolCallMessagePart["approval"] {
  if (value === undefined) return undefined;
  const invalid = "AGENT_MESSAGE_PROJECTION_INVALID";
  const approval = readObject(value, invalid);
  const risk = readObject(approval.risk, invalid);
  const summaryParams = readObject(risk.summaryParams, invalid);
  if (!Array.isArray(approval.options)) throw new AgentRuntimeProtocolError(invalid);
  const projectedOptions: ToolApprovalOption[] = approval.options.map((value) => {
    const option = readObject(value, invalid);
    const grants = option.grants;
    if (!Array.isArray(grants) || grants.some((grant) => typeof grant !== "string")) {
      throw new AgentRuntimeProtocolError(invalid);
    }
    const confirm = option.confirm;
    if (typeof confirm !== "boolean" && (confirm === null || typeof confirm !== "object")) {
      throw new AgentRuntimeProtocolError(invalid);
    }
    return {
      id: readString(option.id, invalid),
      kind: readString(option.kind, invalid),
      label: options.localize(readString(option.labelKey, invalid), summaryParams),
      description: options.localize(readString(option.descriptionKey, invalid), summaryParams),
      grants,
      confirm: confirm as ToolApprovalOption["confirm"],
    };
  });
  const status = readString(approval.status, invalid);
  const resolution =
    status === "cancelled" ? "cancelled" : status === "expired" ? "expired" : undefined;
  return {
    id: readString(approval.approvalId, invalid),
    ...(status === "approved" ? { approved: true } : {}),
    ...(status === "rejected" ? { approved: false } : {}),
    ...(resolution === undefined ? {} : { resolution }),
    ...(approval.reason === undefined ? {} : { reason: readString(approval.reason, invalid) }),
    ...(approval.optionId === undefined
      ? {}
      : { optionId: readString(approval.optionId, invalid) }),
    ...(typeof approval.isAutomatic === "boolean" ? { isAutomatic: approval.isAutomatic } : {}),
    options: projectedOptions,
  };
}

function projectInterrupt(value: unknown): ToolCallMessagePart["interrupt"] {
  if (value === undefined) return undefined;
  const invalid = "AGENT_MESSAGE_PROJECTION_INVALID";
  const interrupt = readObject(value, invalid);
  if (interrupt.type !== "human" || interrupt.payload === undefined) {
    throw new AgentRuntimeProtocolError(invalid);
  }
  return { type: "human", payload: interrupt.payload };
}

function projectToolPart(
  projection: AgentRunProjectionV1,
  part: AgentMessagePartV1,
  options: AgentAssistantUiAdapterOptions,
): ToolCallMessagePart {
  const toolCallId = part.toolCallId as string;
  const toolName = part.toolName as string;
  const nestedMessages = projection.nestedMessageIds
    .map((messageId) => projection.messages[messageId])
    .filter(
      (message): message is AgentProjectedMessageV1 =>
        message?.placement.parentToolCallId === toolCallId,
    )
    .map((message) => projectMessage(projection, message, options));
  const common = {
    type: "tool-call" as const,
    toolCallId,
    toolName,
    args: part.args as ToolCallMessagePart["args"],
    argsText: part.argsText as string,
    ...(part.approval === undefined ? {} : { approval: projectApproval(part.approval, options) }),
    ...(part.interrupt === undefined ? {} : { interrupt: projectInterrupt(part.interrupt) }),
    ...(nestedMessages.length === 0 ? {} : { messages: nestedMessages }),
  };
  if (!options.registeredToolNames.has(toolName)) {
    options.onDiagnostic?.({ code: "AGENT_TOOL_UNSUPPORTED", toolName });
    return {
      ...common,
      isError: true,
      result: { code: "AGENT_TOOL_UNSUPPORTED", toolName },
    };
  }
  return {
    ...common,
    ...(part.result === undefined ? {} : { result: part.result }),
    ...(part.error === undefined ? {} : { result: part.error, isError: true }),
    ...(part.artifact !== undefined ||
    part.artifactRefs !== undefined ||
    part.progress !== undefined
      ? {
          artifact: {
            value: part.artifact,
            refs: part.artifactRefs,
            progress: part.progress,
          },
        }
      : {}),
  };
}

function projectAssistantPart(
  projection: AgentRunProjectionV1,
  part: AgentMessagePartV1,
  options: AgentAssistantUiAdapterOptions,
): ThreadAssistantMessagePart {
  const invalid = "AGENT_MESSAGE_PROJECTION_INVALID";
  if (part.type === "text") return { type: "text", text: part.text as string };
  if (part.type === "tool-call") return projectToolPart(projection, part, options);
  if (part.type === "source") {
    const sourceType = readString(part.sourceType, invalid);
    const id = readString(part.sourceId, invalid);
    const title = readString(part.title, invalid);
    if (sourceType === "url") {
      return {
        type: "source",
        sourceType,
        id,
        url: readString(part.url, invalid),
        title,
      };
    }
    if (sourceType === "document") {
      return {
        type: "source",
        sourceType,
        id,
        title,
        mediaType: readString(part.mimeType, invalid),
        ...(part.name === undefined ? {} : { filename: readString(part.name, invalid) }),
      };
    }
    throw new AgentRuntimeProtocolError(invalid);
  }
  if (part.type === "file") {
    return {
      type: "file",
      filename: readString(part.name, invalid),
      data: readString(part.url, invalid),
      mimeType: readString(part.mimeType, invalid),
    };
  }
  if (part.type === "image") {
    return {
      type: "image",
      image: readString(part.url, invalid),
      filename: readString(part.name, invalid),
      ...(part.alt === undefined ? {} : { alt: readString(part.alt, invalid) }),
    } as ThreadAssistantMessagePart;
  }
  if (part.type === "error") {
    return {
      type: "data",
      name: "agent-error",
      data: readObject(part.error, invalid),
    };
  }
  throw new AgentRuntimeProtocolError("AGENT_PART_PROJECTION_UNSUPPORTED");
}

function projectUserPart(part: AgentMessagePartV1): ThreadUserMessagePart {
  if (part.type === "text") return { type: "text", text: part.text as string };
  throw new AgentRuntimeProtocolError("AGENT_PART_PROJECTION_UNSUPPORTED");
}

function projectMessage(
  projection: AgentRunProjectionV1,
  message: AgentProjectedMessageV1,
  options: AgentAssistantUiAdapterOptions,
): ThreadMessage {
  const common = {
    id: message.messageId,
    createdAt: readDate(message.createdAt),
    metadata: {
      custom: {
        ...(message.agentId === undefined ? {} : { agentId: message.agentId }),
        ...(message.actorUserId === undefined ? {} : { actorUserId: message.actorUserId }),
        placement: message.placement,
      },
    },
  };
  if (message.role === "user") {
    return {
      ...common,
      role: "user",
      content: message.parts.map(projectUserPart),
      attachments: [],
    };
  }
  return {
    ...common,
    role: "assistant",
    content: message.parts.map((part) => projectAssistantPart(projection, part, options)),
    status: projectMessageStatus(projection, message.parts),
    metadata: {
      unstable_state: null,
      unstable_annotations: [],
      unstable_data: [],
      steps: [],
      custom: common.metadata.custom,
    },
  };
}

export function projectAgentRunToAssistantMessages(
  projection: AgentRunProjectionV1,
  options: AgentAssistantUiAdapterOptions,
): readonly ThreadMessage[] {
  return projection.topLevelMessageIds.map((messageId) => {
    const message = projection.messages[messageId];
    if (message === undefined || message.placement.kind !== "thread") {
      throw new AgentRuntimeProtocolError("AGENT_MESSAGE_PROJECTION_INVALID");
    }
    return projectMessage(projection, message, options);
  });
}
