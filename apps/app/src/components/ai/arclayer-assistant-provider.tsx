import {
  AssistantRuntimeProvider,
  type AppendMessage,
  type ThreadMessage,
  createMessageQueue,
  Tools,
  useAui,
  useAuiState,
  useExternalStoreRuntime,
  useRemoteThreadListRuntime,
} from "@assistant-ui/react";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { ApiError } from "@/lib/http";
import {
  cancelAgentRun,
  createAgentRun,
  getAgentRunSnapshot,
  respondToAgentToolCall,
  resumeAgentRun,
  type AgentToolResponseV1,
  type AgentExecutionModeV1,
} from "@/lib/ai/agent-run-api";
import {
  createAgentRunProjection,
  replaceAgentRunProjectionFromSnapshot,
  replaceAgentThreadMessages,
} from "@/lib/ai/agent-run-reducer";
import { consumeAgentRunStream } from "@/lib/ai/agent-run-stream-controller";
import type { AgentRunProjectionV1 } from "@/lib/ai/agent-runtime-protocol";
import { AgentRuntimeProtocolError } from "@/lib/ai/agent-runtime-protocol";
import { readObject, readString } from "@/lib/ai/agent-run-reducer-validation";
import { projectAgentRunToAssistantMessages } from "@/lib/ai/agent-assistant-ui-adapter";
import { getAgentThread, updateAgentThread } from "@/lib/ai/agent-thread-api";
import {
  createAgentThreadListAdapter,
  createAgentThreadTitle,
} from "@/lib/ai/agent-thread-list-adapter";
import {
  ARCLAYER_AGENT_TOOL_NAMES,
  arclayerAgentToolkit,
} from "@/components/ai/arclayer-agent-toolkit";
import { ProjectPlanConfirmationDialog } from "@/components/ai/project-plan-confirmation-dialog";
import {
  agentIdsForComposerScope,
  consumeAIComposerDirectives,
  materializeAIComposerDirectiveCommands,
  skillInstallationIdsForComposerScope,
  useAIComposerDirectiveStore,
} from "@/components/ai/ai-composer-directives";
import { useAiChatStore } from "@/stores/use-ai-chat-store";
import { useAIRunTransitionStore } from "@/stores/use-ai-run-transition-store";

interface ArclayerThreadRuntimeOptions {
  readonly workspaceId: string;
  readonly projectId: string | null;
  readonly leadAgentId: string;
  readonly executionMode: AgentExecutionModeV1;
  readonly initialTitle: string;
  readonly localize: (key: string, params?: Readonly<Record<string, unknown>>) => string;
}

export interface ArclayerAssistantProviderProps extends ArclayerThreadRuntimeOptions {
  readonly initialTitle: string;
  readonly children: ReactNode;
}

function commandKey(): string {
  return globalThis.crypto.randomUUID();
}

function readComposerText(message: AppendMessage): string {
  const text = message.content.map((part) => (part.type === "text" ? part.text : "")).join("");
  const registered = useAIComposerDirectiveStore.getState().directivesByScope.thread;
  const materializedText = materializeAIComposerDirectiveCommands(text, registered).trim();
  if (!materializedText) throw new AgentRuntimeProtocolError("AGENT_MESSAGE_EMPTY");
  return materializedText;
}

function readMentionedAgentIds(message: AppendMessage): readonly string[] {
  const custom = message.runConfig?.custom;
  if (custom === undefined) return agentIdsForComposerScope("thread");
  if (custom === null || typeof custom !== "object" || Array.isArray(custom)) {
    throw new AgentRuntimeProtocolError("AGENT_MENTIONS_INVALID");
  }
  const values = (custom as Record<string, unknown>).mentionedAgentIds;
  if (values === undefined) return agentIdsForComposerScope("thread");
  if (
    !Array.isArray(values) ||
    values.some((value) => typeof value !== "string" || !value.trim()) ||
    new Set(values).size !== values.length
  ) {
    throw new AgentRuntimeProtocolError("AGENT_MENTIONS_INVALID");
  }
  return values as string[];
}

function readSelectedSkillInstallationIds(message: AppendMessage): readonly string[] {
  const custom = message.runConfig?.custom;
  if (custom === undefined) return skillInstallationIdsForComposerScope("thread");
  if (custom === null || typeof custom !== "object" || Array.isArray(custom)) {
    throw new AgentRuntimeProtocolError("AGENT_SKILL_SELECTION_INVALID");
  }
  const values = (custom as Record<string, unknown>).selectedSkillInstallationIds;
  if (values === undefined) return skillInstallationIdsForComposerScope("thread");
  if (
    !Array.isArray(values) ||
    values.some((value) => typeof value !== "string" || !value.trim()) ||
    new Set(values).size !== values.length
  ) {
    throw new AgentRuntimeProtocolError("AGENT_SKILL_SELECTION_INVALID");
  }
  return values as string[];
}

function isPlanConfirmationMessage(value: string): boolean {
  return /^(确认(?:计划)?|开始(?:构建|创建)|confirm(?:\s+plan)?|build\s+it)[。.!！]?$/i.test(
    value.trim(),
  );
}

export function resolveProjectlessRunExecution(input: {
  readonly projectId: string | null;
  readonly executionMode: AgentExecutionModeV1;
  readonly latestCompletedPlanRunId: string | null;
  readonly message: string;
}): Readonly<{
  executionMode: AgentExecutionModeV1;
  confirmedPlanRunId: string | null;
}> {
  const isProjectless = input.projectId === null;
  const hasCompletedPlan = input.latestCompletedPlanRunId !== null;
  const confirmsPlan =
    isProjectless && hasCompletedPlan && isPlanConfirmationMessage(input.message);

  if (confirmsPlan) {
    return {
      executionMode: "build",
      confirmedPlanRunId: input.latestCompletedPlanRunId,
    };
  }

  if (isProjectless && input.executionMode === "build") {
    return { executionMode: "plan", confirmedPlanRunId: null };
  }

  return { executionMode: input.executionMode, confirmedPlanRunId: null };
}

function isRunActive(projection: AgentRunProjectionV1): boolean {
  return ["created", "queued", "running", "cancellation_requested"].includes(projection.runStatus);
}

function isHumanInputInterrupted(projection: AgentRunProjectionV1): boolean {
  return (
    projection.runStatus === "interrupted" &&
    projection.run?.status === "interrupted" &&
    projection.run.reason === "human_tool_input"
  );
}

function isRunBlockingQueue(projection: AgentRunProjectionV1): boolean {
  return (
    isRunActive(projection) ||
    (projection.runStatus === "interrupted" && !isHumanInputInterrupted(projection))
  );
}

const USER_FACING_RUNTIME_ERROR = Symbol("arclayer.userFacingRuntimeError");
type UserFacingRuntimeError = Error & {
  readonly [USER_FACING_RUNTIME_ERROR]: true;
};

function isUserFacingRuntimeError(error: unknown): error is UserFacingRuntimeError {
  return (
    error instanceof Error &&
    (error as Partial<UserFacingRuntimeError>)[USER_FACING_RUNTIME_ERROR] === true
  );
}

function toUserFacingRuntimeError(
  error: unknown,
  localize: ArclayerThreadRuntimeOptions["localize"],
): Error {
  if (isUserFacingRuntimeError(error)) return error;
  const code =
    error instanceof ApiError && error.error
      ? error.error
      : error instanceof AgentRuntimeProtocolError
        ? error.code
        : "AGENT_RUN_FAILED";
  const key = `errors:${code}`;
  const message = localize(key);
  const fallback = localize("errors:AGENT_RUN_FAILED");
  const userError = new Error(message === key ? fallback : message);
  Object.defineProperty(userError, USER_FACING_RUNTIME_ERROR, { value: true });
  userError.cause = error;
  return userError;
}

function humanInterrupt(projection: AgentRunProjectionV1, toolCallId: string) {
  const run = readObject(projection.run, "AGENT_HUMAN_INTERRUPT_INVALID");
  if (run.status !== "interrupted" || run.reason !== "human_tool_input") {
    throw new AgentRuntimeProtocolError("AGENT_HUMAN_INTERRUPT_INVALID");
  }
  const interruptedToolCallId = readString(run.toolCallId, "AGENT_HUMAN_INTERRUPT_INVALID");
  if (interruptedToolCallId !== toolCallId) {
    throw new AgentRuntimeProtocolError("AGENT_HUMAN_INTERRUPT_INVALID");
  }
  return { checkpointId: readString(run.checkpointId, "AGENT_HUMAN_INTERRUPT_INVALID") };
}

function approvalCommand(projection: AgentRunProjectionV1, approvalId: string) {
  const matches = Object.values(projection.messages).flatMap((message) =>
    message.parts.flatMap((part) => {
      if (part.approval == null) return [];
      const approval = readObject(part.approval, "AGENT_APPROVAL_INVALID");
      return approval.approvalId === approvalId ? [{ part, approval }] : [];
    }),
  );
  const match = matches[0];
  if (matches.length !== 1 || match === undefined) {
    throw new AgentRuntimeProtocolError("AGENT_APPROVAL_INVALID");
  }
  return {
    toolCallId: readString(match.part.toolCallId, "AGENT_APPROVAL_INVALID"),
    checkpointId: readString(match.approval.checkpointId, "AGENT_APPROVAL_INVALID"),
    approvalVersion: Number(match.approval.approvalVersion),
  };
}

function projectRuntimeErrorMessage(
  error: Error,
  threadId: string,
  agentId: string,
): ThreadMessage {
  const detail =
    error.cause instanceof Error
      ? error.cause.message
      : typeof error.cause === "string"
        ? error.cause
        : "";
  return {
    id: `runtime-error:${threadId}`,
    createdAt: new Date(),
    role: "assistant",
    content: [],
    status: { type: "incomplete", reason: "error", error: error.message },
    metadata: {
      unstable_state: null,
      unstable_annotations: [],
      unstable_data: [],
      steps: [],
      custom: {
        agentId,
        placement: { kind: "thread" },
        createdAt: Date.now(),
        ...(detail && detail !== error.message ? { errorDetails: detail } : {}),
      },
    },
  };
}

function mergeThreadMessageRecords(
  current: readonly Readonly<Record<string, unknown>>[],
  incoming: readonly Readonly<Record<string, unknown>>[],
): readonly Readonly<Record<string, unknown>>[] {
  const byId = new Map<string, Readonly<Record<string, unknown>>>();
  for (const value of current) {
    const messageId = readString(value.messageId, "AGENT_MESSAGE_PROJECTION_INVALID");
    byId.set(messageId, value);
  }
  for (const value of incoming) {
    const messageId = readString(value.messageId, "AGENT_MESSAGE_PROJECTION_INVALID");
    const existing = byId.get(messageId);
    byId.set(messageId, existing === undefined ? value : mergeThreadMessageRecord(existing, value));
  }
  return [...byId.values()];
}

function mergeThreadMessageRecord(
  current: Readonly<Record<string, unknown>>,
  incoming: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const currentParts = Array.isArray(current.parts) ? current.parts : [];
  const incomingParts = Array.isArray(incoming.parts) ? incoming.parts : [];
  const partsById = new Map<string, Readonly<Record<string, unknown>>>();
  for (const value of currentParts) {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const part = value as Readonly<Record<string, unknown>>;
      const partId = readString(part.partId, "AGENT_MESSAGE_PROJECTION_INVALID");
      partsById.set(partId, part);
    }
  }
  for (const value of incomingParts) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) continue;
    const part = value as Readonly<Record<string, unknown>>;
    const partId = readString(part.partId, "AGENT_MESSAGE_PROJECTION_INVALID");
    const existing = partsById.get(partId);
    if (existing === undefined || partStatusRank(part.status) > partStatusRank(existing.status)) {
      partsById.set(partId, existing === undefined ? part : { ...existing, ...part });
    }
  }
  return {
    ...incoming,
    ...current,
    parts: [...partsById.values()],
  };
}

function partStatusRank(status: unknown): number {
  if (status === "complete" || status === "failed" || status === "incomplete") return 3;
  if (status === "requires_action") return 2;
  if (status === "running") return 1;
  return 0;
}

function readBootstrapProjectId(projection: AgentRunProjectionV1): string | null {
  if (projection.terminalType !== "run.completed") return null;
  const run = projection.run;
  if (run?.executionMode !== "build" && run?.execution_mode !== "build") return null;
  for (const message of Object.values(projection.messages).reverse()) {
    for (const part of [...message.parts].reverse()) {
      if (part.type !== "tool-call" || part.toolName !== "project.bootstrap") continue;
      const result = part.result;
      if (result === null || typeof result !== "object" || Array.isArray(result)) continue;
      const projectId = (result as Record<string, unknown>).projectId;
      if (typeof projectId === "string" && projectId.length > 0) return projectId;
    }
  }
  return null;
}

function isCompletedProjectlessPlan(projection: AgentRunProjectionV1): boolean {
  const executionMode = projection.run?.executionMode ?? projection.run?.execution_mode;
  return (
    projection.terminalType === "run.completed" &&
    projection.runStatus === "completed" &&
    executionMode === "plan" &&
    projection.run?.projectId == null &&
    projection.run?.project_id == null
  );
}

function readPendingProjectBootstrapApprovalId(projection: AgentRunProjectionV1): string | null {
  for (const message of Object.values(projection.messages).reverse()) {
    for (const part of [...message.parts].reverse()) {
      if (part.type !== "tool-call" || part.toolName !== "project.bootstrap") continue;
      if (part.approval == null || typeof part.approval !== "object") continue;
      const approval = part.approval as Record<string, unknown>;
      if (approval.resolution !== undefined) continue;
      const approvalId = approval.approvalId;
      if (typeof approvalId === "string" && approvalId.length > 0) return approvalId;
    }
  }
  return null;
}

function useArclayerThreadRuntime(options: ArclayerThreadRuntimeOptions) {
  const aui = useAui();
  const navigate = useNavigate();
  const remoteThreadId = useAuiState((state) => state.threadListItem.remoteId);
  const pendingThreadContinuation = useAIRunTransitionStore(
    (state) => state.pendingThreadContinuation,
  );
  const consumePendingThreadContinuation = useAIRunTransitionStore(
    (state) => state.consumePendingThreadContinuation,
  );
  const approvedProjectBootstrap = useAIRunTransitionStore(
    (state) => state.approvedProjectBootstrap,
  );
  const consumeApprovedProjectBootstrap = useAIRunTransitionStore(
    (state) => state.consumeApprovedProjectBootstrap,
  );
  const [projection, setProjection] = useState<AgentRunProjectionV1>(() =>
    createAgentRunProjection({ runId: "thread-history", threadId: "new" }),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [runtimeError, setRuntimeError] = useState<unknown>(null);
  const projectionRef = useRef(projection);
  const activeRunIdRef = useRef<string | null>(null);
  const streamControllerRef = useRef<AbortController | null>(null);
  const humanResponseInFlightRef = useRef<string | null>(null);
  const skipNextThreadHydrationRef = useRef(false);
  const hydratedThreadIdRef = useRef<string | null>(null);
  const threadTitleRef = useRef<string | null>(null);
  const titleUpdateInFlightRef = useRef<string | null>(null);
  const latestCompletedPlanRunIdRef = useRef<string | null>(null);
  const navigatedBootstrapRunIdRef = useRef<string | null>(null);

  const publishProjection = useCallback((next: AgentRunProjectionV1) => {
    projectionRef.current = next;
    activeRunIdRef.current = next.runStatus === "idle" ? null : next.runId;
    setProjection(next);
  }, []);

  const continueRun = useCallback(
    async (runId: string, initial: AgentRunProjectionV1, controller: AbortController) => {
      try {
        const streamed = await consumeAgentRunStream({
          workspaceId: options.workspaceId,
          runId,
          initialProjection: initial,
          signal: controller.signal,
          preserveThreadMessages: true,
          onProjection: publishProjection,
        });
        if (!isRunActive(streamed)) return;
        const snapshot = await getAgentRunSnapshot(options.workspaceId, runId, {
          signal: controller.signal,
        });
        const recovered = replaceAgentRunProjectionFromSnapshot(projectionRef.current, snapshot, {
          preserveThreadMessages: true,
        });
        publishProjection(recovered);
        if (isRunActive(recovered)) {
          throw new AgentRuntimeProtocolError("AGENT_STREAM_ENDED_BEFORE_TERMINAL");
        }
      } catch (error) {
        if (!controller.signal.aborted) throw error;
      }
    },
    [options.workspaceId, publishProjection],
  );

  useEffect(() => {
    if (
      pendingThreadContinuation?.projectId !== options.projectId ||
      pendingThreadContinuation.remoteThreadId !== remoteThreadId ||
      options.projectId === null
    ) {
      return;
    }
    consumePendingThreadContinuation(options.projectId, remoteThreadId);
  }, [
    consumePendingThreadContinuation,
    options.projectId,
    pendingThreadContinuation,
    remoteThreadId,
  ]);

  useEffect(() => {
    if (!remoteThreadId) return;
    if (skipNextThreadHydrationRef.current) {
      skipNextThreadHydrationRef.current = false;
      return;
    }
    const controller = new AbortController();
    streamControllerRef.current?.abort();
    streamControllerRef.current = controller;
    setIsLoading(true);
    setRuntimeError(null);
    hydratedThreadIdRef.current = remoteThreadId;

    void (async () => {
      const thread = await getAgentThread(options.workspaceId, remoteThreadId, {
        signal: controller.signal,
      });
      threadTitleRef.current = thread.title;
      latestCompletedPlanRunIdRef.current = thread.latestCompletedPlanRunId ?? null;
      const currentMessages =
        projectionRef.current.threadId === remoteThreadId
          ? Object.values(projectionRef.current.messages).map(
              (message) => message as unknown as Readonly<Record<string, unknown>>,
            )
          : [];
      let next = replaceAgentThreadMessages(
        createAgentRunProjection({
          runId: thread.activeRunId ?? `thread-history:${remoteThreadId}`,
          threadId: remoteThreadId,
        }),
        mergeThreadMessageRecords(currentMessages, thread.messages),
      );
      let hydratedRun: Readonly<Record<string, unknown>> | null = null;
      if (thread.activeRunId !== null) {
        const snapshot = await getAgentRunSnapshot(options.workspaceId, thread.activeRunId, {
          signal: controller.signal,
        });
        hydratedRun = snapshot.run ?? null;
        next = replaceAgentRunProjectionFromSnapshot(next, snapshot, {
          preserveThreadMessages: true,
        });
      }
      publishProjection(next);
      const hydratedMode = hydratedRun?.executionMode ?? hydratedRun?.execution_mode;
      if (hydratedMode === "plan" && hydratedRun?.status === "completed") {
        latestCompletedPlanRunIdRef.current = thread.activeRunId;
      }
      setIsLoading(false);
      if (thread.activeRunId !== null && isRunActive(next)) {
        await continueRun(thread.activeRunId, next, controller);
      }
    })().catch((error: unknown) => {
      if (!controller.signal.aborted) {
        setRuntimeError(toUserFacingRuntimeError(error, options.localize));
      }
    });
    return () => controller.abort();
  }, [continueRun, options.workspaceId, publishProjection, remoteThreadId]);

  useEffect(() => {
    const projectId = readBootstrapProjectId(projection);
    if (projectId === null || navigatedBootstrapRunIdRef.current === projection.runId) return;
    navigatedBootstrapRunIdRef.current = projection.runId;
    if (remoteThreadId) {
      useAIRunTransitionStore.getState().setPendingThreadContinuation({
        projectId,
        remoteThreadId,
      });
    }
    useAiChatStore.getState().openDrawer();
    void navigate({
      to: "/projects/$projectId/editor",
      params: { projectId },
      search: { stage: "sitemap" },
    });
  }, [navigate, projection, remoteThreadId]);

  const resumeRecordedResponse = useCallback(
    async (response: AgentToolResponseV1, controller: AbortController) => {
      const runId = activeRunIdRef.current;
      if (runId === null) throw new AgentRuntimeProtocolError("AGENT_RUN_NOT_ACTIVE");
      const resumed = await resumeAgentRun(
        options.workspaceId,
        runId,
        {
          responseId: response.responseId,
          checkpointId: response.checkpointId,
          expectedSequence: response.expectedSequence,
          idempotencyKey: `resume:${response.responseId}`,
        },
        { signal: controller.signal },
      );
      const snapshot = await getAgentRunSnapshot(options.workspaceId, runId, {
        signal: controller.signal,
      });
      if (
        snapshot.lastSequence < resumed.lastSequence ||
        (snapshot.lastSequence === resumed.lastSequence &&
          snapshot.lastCursor !== resumed.lastCursor)
      ) {
        throw new AgentRuntimeProtocolError("AGENT_RUN_RESUME_SNAPSHOT_STALE");
      }
      const resumedProjection = replaceAgentRunProjectionFromSnapshot(
        projectionRef.current,
        snapshot,
        { preserveThreadMessages: true },
      );
      publishProjection(resumedProjection);
      await continueRun(runId, resumedProjection, controller);
    },
    [continueRun, options.workspaceId, publishProjection],
  );

  const respondWithHumanResult = async (toolCallId: string, result: unknown) => {
    if (humanResponseInFlightRef.current === toolCallId) return;
    humanResponseInFlightRef.current = toolCallId;
    try {
      const { checkpointId } = humanInterrupt(projectionRef.current, toolCallId);
      const controller = new AbortController();
      streamControllerRef.current?.abort();
      streamControllerRef.current = controller;
      const response = await respondToAgentToolCall(
        options.workspaceId,
        toolCallId,
        {
          kind: "human_result",
          checkpointId,
          idempotencyKey: `human:${toolCallId}:${checkpointId}`,
          result: result as never,
        },
        { signal: controller.signal },
      );
      const thread = await getAgentThread(options.workspaceId, projectionRef.current.threadId, {
        signal: controller.signal,
      });
      const currentMessages = Object.values(projectionRef.current.messages).map(
        (message) => message as unknown as Readonly<Record<string, unknown>>,
      );
      publishProjection(
        replaceAgentThreadMessages(
          projectionRef.current,
          mergeThreadMessageRecords(currentMessages, thread.messages),
        ),
      );
      await resumeRecordedResponse(response, controller);
      const resumedProjection = projectionRef.current;
      const resumedExecutionMode =
        resumedProjection.run?.executionMode ?? resumedProjection.run?.execution_mode;
      if (resumedExecutionMode === "plan" && isCompletedProjectlessPlan(resumedProjection)) {
        latestCompletedPlanRunIdRef.current = resumedProjection.runId;
        useAIRunTransitionStore.getState().setPendingPlanConfirmation({
          threadId: resumedProjection.threadId,
          planRunId: resumedProjection.runId,
        });
      }
    } finally {
      if (humanResponseInFlightRef.current === toolCallId) {
        humanResponseInFlightRef.current = null;
      }
    }
  };

  const projectedMessages = projectAgentRunToAssistantMessages(projection, {
    registeredToolNames: ARCLAYER_AGENT_TOOL_NAMES,
    localize: options.localize,
  });
  const runtimeErrorMessage = useMemo(
    () =>
      runtimeError instanceof Error
        ? projectRuntimeErrorMessage(runtimeError, projection.threadId, options.leadAgentId)
        : null,
    [options.leadAgentId, projection.threadId, runtimeError],
  );
  const messages =
    runtimeErrorMessage !== null ? [...projectedMessages, runtimeErrorMessage] : projectedMessages;

  const respondToToolApproval = useCallback(
    async ({
      approvalId,
      approved,
      optionId,
      reason,
    }: {
      readonly approvalId: string;
      readonly approved: boolean;
      readonly optionId?: string;
      readonly reason?: string;
    }) => {
      const command = approvalCommand(projectionRef.current, approvalId);
      if (!Number.isInteger(command.approvalVersion) || command.approvalVersion < 1) {
        throw new AgentRuntimeProtocolError("AGENT_APPROVAL_INVALID");
      }
      const controller = new AbortController();
      streamControllerRef.current?.abort();
      streamControllerRef.current = controller;
      const response = await respondToAgentToolCall(
        options.workspaceId,
        command.toolCallId,
        {
          kind: "approval",
          approvalId,
          approvalVersion: command.approvalVersion,
          approved,
          checkpointId: command.checkpointId,
          idempotencyKey: commandKey(),
          ...(optionId === undefined ? {} : { optionId }),
          ...(reason === undefined ? {} : { reason }),
        },
        { signal: controller.signal },
      );
      await resumeRecordedResponse(response, controller);
    },
    [options.workspaceId, resumeRecordedResponse],
  );

  useEffect(() => {
    if (approvedProjectBootstrap?.buildRunId !== projection.runId) return;
    const approvalId = readPendingProjectBootstrapApprovalId(projection);
    if (approvalId === null) return;
    consumeApprovedProjectBootstrap(projection.runId);
    void respondToToolApproval({ approvalId, approved: true }).catch((error: unknown) => {
      setRuntimeError(toUserFacingRuntimeError(error, options.localize));
    });
  }, [
    approvedProjectBootstrap,
    consumeApprovedProjectBootstrap,
    options.localize,
    projection,
    respondToToolApproval,
  ]);

  const runAgentMessage = useCallback(
    async (message: AppendMessage) => {
      setIsSubmitting(true);
      setRuntimeError(null);
      try {
        let threadId = remoteThreadId;
        if (!threadId) {
          skipNextThreadHydrationRef.current = true;
          try {
            threadId = (await aui.threadListItem().initialize()).remoteId;
            threadTitleRef.current = options.initialTitle;
            await aui.threads().reload();
          } catch (error) {
            skipNextThreadHydrationRef.current = false;
            throw error;
          }
        }
        if (!threadId) throw new AgentRuntimeProtocolError("AGENT_THREAD_NOT_INITIALIZED");
        const composerText = readComposerText(message);
        if (isHumanInputInterrupted(projectionRef.current)) {
          const toolCallId = readString(
            projectionRef.current.run?.toolCallId,
            "AGENT_HUMAN_INTERRUPT_INVALID",
          );
          await respondWithHumanResult(toolCallId, { answer: composerText });
          return;
        }
        const mentionedAgentIds = readMentionedAgentIds(message);
        const selectedSkillInstallationIds = readSelectedSkillInstallationIds(message);
        const resolvedExecution = resolveProjectlessRunExecution({
          projectId: options.projectId,
          executionMode: options.executionMode,
          latestCompletedPlanRunId: latestCompletedPlanRunIdRef.current,
          message: composerText,
        });
        const controller = new AbortController();
        streamControllerRef.current?.abort();
        streamControllerRef.current = controller;
        const created = await createAgentRun(
          {
            workspaceId: options.workspaceId,
            projectId: options.projectId,
            threadId,
            leadAgentId: options.leadAgentId,
            mentionedAgentIds,
            selectedSkillInstallationIds,
            executionMode: resolvedExecution.executionMode,
            confirmedPlanRunId: resolvedExecution.confirmedPlanRunId,
            siteRevisionId: null,
            message: composerText,
            idempotencyKey: commandKey(),
          },
          { signal: controller.signal },
        );
        if (resolvedExecution.confirmedPlanRunId !== null) {
          const approvedBootstrap = useAIRunTransitionStore.getState().approvedProjectBootstrap;
          if (
            approvedBootstrap?.threadId === threadId &&
            approvedBootstrap.planRunId === resolvedExecution.confirmedPlanRunId
          ) {
            useAIRunTransitionStore
              .getState()
              .bindApprovedProjectBootstrapRun(resolvedExecution.confirmedPlanRunId, created.runId);
          }
        }
        consumeAIComposerDirectives("thread", mentionedAgentIds, selectedSkillInstallationIds);
        activeRunIdRef.current = created.runId;
        const snapshot = await getAgentRunSnapshot(options.workspaceId, created.runId, {
          signal: controller.signal,
        });
        const seeded = replaceAgentThreadMessages(
          createAgentRunProjection({ runId: created.runId, threadId }),
          Object.values(projectionRef.current.messages).map(
            (message) => message as unknown as Readonly<Record<string, unknown>>,
          ),
        );
        const initial = replaceAgentRunProjectionFromSnapshot(seeded, snapshot, {
          preserveThreadMessages: true,
        });
        publishProjection(initial);
        try {
          await continueRun(created.runId, initial, controller);
          if (
            resolvedExecution.executionMode === "plan" &&
            isCompletedProjectlessPlan(projectionRef.current)
          ) {
            latestCompletedPlanRunIdRef.current = created.runId;
            useAIRunTransitionStore.getState().setPendingPlanConfirmation({
              threadId,
              planRunId: created.runId,
            });
          }
        } finally {
          if (
            threadTitleRef.current === options.initialTitle &&
            titleUpdateInFlightRef.current !== threadId
          ) {
            titleUpdateInFlightRef.current = threadId;
            const title = createAgentThreadTitle(composerText);
            try {
              await updateAgentThread(options.workspaceId, threadId, { title });
              threadTitleRef.current = title;
              await aui.threads().reload();
            } finally {
              titleUpdateInFlightRef.current = null;
            }
          }
        }
      } catch (error: unknown) {
        throw toUserFacingRuntimeError(error, options.localize);
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      continueRun,
      aui,
      options.executionMode,
      options.initialTitle,
      options.leadAgentId,
      options.projectId,
      options.workspaceId,
      publishProjection,
      remoteThreadId,
    ],
  );
  const runAgentMessageRef = useRef(runAgentMessage);
  useEffect(() => {
    runAgentMessageRef.current = runAgentMessage;
  }, [runAgentMessage]);
  const [messageQueue] = useState(() =>
    createMessageQueue({
      run: (message) => {
        void runAgentMessageRef.current(message).catch((error: unknown) => {
          setRuntimeError(toUserFacingRuntimeError(error, options.localize));
        });
      },
    }),
  );
  const queueBusy = isSubmitting || isRunBlockingQueue(projection);
  const wasQueueBusyRef = useRef(false);

  useEffect(() => {
    if (wasQueueBusyRef.current === queueBusy) return;
    wasQueueBusyRef.current = queueBusy;
    if (queueBusy) {
      messageQueue.notifyBusy();
    } else {
      messageQueue.notifyIdle();
    }
  }, [messageQueue, queueBusy]);

  const runtime = useExternalStoreRuntime({
    messages,
    isLoading,
    isRunning: isSubmitting || isRunActive(projection),
    onNew: runAgentMessage,
    queue: messageQueue.adapter,
    onCancel: async () => {
      const runId = activeRunIdRef.current;
      if (runId === null) return;
      const snapshot = await cancelAgentRun(options.workspaceId, runId);
      streamControllerRef.current?.abort();
      publishProjection(
        replaceAgentRunProjectionFromSnapshot(projectionRef.current, snapshot, {
          preserveThreadMessages: true,
        }),
      );
    },
    onAddToolResult: async ({ toolCallId, result }) => {
      await respondWithHumanResult(toolCallId, result);
    },
    onResumeToolCall: ({ toolCallId, payload }) => {
      void respondWithHumanResult(toolCallId, payload).catch((error: unknown) => {
        setRuntimeError(toUserFacingRuntimeError(error, options.localize));
      });
    },
    onRespondToToolApproval: respondToToolApproval,
  });

  return runtime;
}

export function ArclayerAssistantProvider({
  children,
  initialTitle,
  ...runtimeOptions
}: ArclayerAssistantProviderProps) {
  const aui = useAui({ tools: Tools({ toolkit: arclayerAgentToolkit }) });
  const pendingThreadContinuation = useAIRunTransitionStore(
    (state) => state.pendingThreadContinuation,
  );
  const adapter = useMemo(
    () =>
      createAgentThreadListAdapter({
        workspaceId: runtimeOptions.workspaceId,
        projectId: runtimeOptions.projectId,
        // The global history is workspace-scoped; only new Thread creation uses the current project.
        listProjectId: null,
        leadAgentId: runtimeOptions.leadAgentId,
        initialTitle,
      }),
    [
      initialTitle,
      runtimeOptions.leadAgentId,
      runtimeOptions.projectId,
      runtimeOptions.workspaceId,
    ],
  );

  function useThreadRuntime() {
    return useArclayerThreadRuntime({ ...runtimeOptions, initialTitle });
  }

  const initialThreadId =
    pendingThreadContinuation?.projectId === runtimeOptions.projectId
      ? pendingThreadContinuation.remoteThreadId
      : undefined;
  const runtime = useRemoteThreadListRuntime({
    adapter,
    runtimeHook: useThreadRuntime,
    initialThreadId,
  });
  return (
    <AssistantRuntimeProvider aui={aui} runtime={runtime}>
      {children}
      <ProjectPlanConfirmationBridge projectId={runtimeOptions.projectId} />
    </AssistantRuntimeProvider>
  );
}

function ProjectPlanConfirmationBridge(props: { readonly projectId: string | null }) {
  const aui = useAui();
  const remoteThreadId = useAuiState((state) => state.threadListItem.remoteId);
  const pendingPlanConfirmation = useAIRunTransitionStore((state) => state.pendingPlanConfirmation);
  const clearPendingPlanConfirmation = useAIRunTransitionStore(
    (state) => state.clearPendingPlanConfirmation,
  );
  const approveProjectBootstrap = useAIRunTransitionStore((state) => state.approveProjectBootstrap);

  const confirmation =
    props.projectId === null && pendingPlanConfirmation?.threadId === remoteThreadId
      ? pendingPlanConfirmation
      : null;

  return (
    <ProjectPlanConfirmationDialog
      open={confirmation !== null}
      onContinuePlanning={() => {
        if (confirmation) clearPendingPlanConfirmation(confirmation.planRunId);
      }}
      onExecute={async () => {
        if (confirmation === null) return;
        approveProjectBootstrap(confirmation);
        try {
          await aui.thread().append({
            role: "user",
            content: [{ type: "text", text: "确认计划" }],
          });
        } catch (error) {
          useAIRunTransitionStore.getState().clearApprovedProjectBootstrap(confirmation.planRunId);
          useAIRunTransitionStore.getState().setPendingPlanConfirmation(confirmation);
          throw error;
        }
      }}
    />
  );
}
