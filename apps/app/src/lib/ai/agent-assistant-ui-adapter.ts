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
  const failed = parts.find((part) => part.status === "failed");
  if (failed !== undefined) {
    const error = readObject(failed.error, "AGENT_MESSAGE_PROJECTION_INVALID");
    return {
      type: "incomplete",
      reason: "error",
      error: readString(error.message, "AGENT_MESSAGE_PROJECTION_INVALID"),
    };
  }
  if (parts.some((part) => part.status === "incomplete")) {
    if (projection.terminalType === "run.cancelled") {
      return { type: "incomplete", reason: "cancelled" };
    }
    if (projection.terminalType === "run.failed") {
      const error = readObject(projection.run?.error, "AGENT_MESSAGE_PROJECTION_INVALID");
      return {
        type: "incomplete",
        reason: "error",
        error: readString(error.message, "AGENT_MESSAGE_PROJECTION_INVALID"),
      };
    }
    return { type: "incomplete", reason: "other" };
  }
  if (projection.terminalType === "run.failed" && parts.some((part) => part.status === "running")) {
    const error = readObject(projection.run?.error, "AGENT_MESSAGE_PROJECTION_INVALID");
    return {
      type: "incomplete",
      reason: "error",
      error: readString(error.message, "AGENT_MESSAGE_PROJECTION_INVALID"),
    };
  }
  if (parts.some((part) => part.status === "running")) return { type: "running" };
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
    ...(part.approval == null ? {} : { approval: projectApproval(part.approval, options) }),
    ...(part.interrupt == null ? {} : { interrupt: projectInterrupt(part.interrupt) }),
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
    const sourceType =
      part.sourceType == null
        ? typeof part.url === "string"
          ? "url"
          : "document"
        : readString(part.sourceType, invalid);
    const id = typeof part.sourceId === "string" ? part.sourceId : part.partId;
    if (sourceType === "url") {
      return {
        type: "source",
        sourceType,
        id,
        url: readString(part.url, invalid),
        ...(part.title == null ? {} : { title: readString(part.title, invalid) }),
      };
    }
    if (sourceType === "document") {
      return {
        type: "source",
        sourceType,
        id,
        title: readString(part.title, invalid),
        mediaType: readString(part.mimeType, invalid),
        ...(part.name == null ? {} : { filename: readString(part.name, invalid) }),
      };
    }
    throw new AgentRuntimeProtocolError(invalid);
  }
  if (part.type === "file") {
    return {
      type: "file",
      data: readString(part.url, invalid),
      mimeType: readString(part.mimeType, invalid),
      ...(part.name == null ? {} : { filename: readString(part.name, invalid) }),
    };
  }
  if (part.type === "image") {
    return {
      type: "image",
      image: readString(part.url, invalid),
      ...(part.name == null ? {} : { filename: readString(part.name, invalid) }),
      ...(part.alt == null ? {} : { alt: readString(part.alt, invalid) }),
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
        createdAt: readDate(message.createdAt).getTime(),
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
  const messages = projection.topLevelMessageIds.map((messageId) => {
    const message = projection.messages[messageId];
    if (message === undefined || message.placement.kind !== "thread") {
      throw new AgentRuntimeProtocolError("AGENT_MESSAGE_PROJECTION_INVALID");
    }
    return projectMessage(projection, message, options);
  });
  if (
    projection.terminalType !== "run.failed" ||
    messages.some(
      (message) =>
        message.role === "assistant" &&
        message.status?.type === "incomplete" &&
        message.status.reason === "error",
    )
  ) {
    return messages;
  }
  const error = readObject(projection.run?.error, "AGENT_MESSAGE_PROJECTION_INVALID");
  const failedAt = readString(
    projection.run?.failedAt ?? projection.run?.terminalAt ?? projection.run?.updatedAt,
    "AGENT_MESSAGE_PROJECTION_INVALID",
  );
  const errorMessage = readString(error.message, "AGENT_MESSAGE_PROJECTION_INVALID");
  const agentId = projection.run?.leadAgentId;
  const failedDate = readDate(failedAt);
  return [
    ...messages,
    {
      id: `run-error:${projection.runId}`,
      createdAt: failedDate,
      role: "assistant",
      content: [],
      status: { type: "incomplete", reason: "error", error: errorMessage },
      metadata: {
        unstable_state: null,
        unstable_annotations: [],
        unstable_data: [],
        steps: [],
        custom: {
          placement: { kind: "thread" },
          createdAt: failedDate.getTime(),
          ...(typeof agentId === "string" ? { agentId } : {}),
        },
      },
    },
  ];
}
