import {
  AssistantRuntimeProvider,
  type AppendMessage,
  createMessageQueue,
  Tools,
  useAui,
  useAuiState,
  useExternalStoreRuntime,
  useRemoteThreadListRuntime,
} from "@assistant-ui/react";
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
import { getAgentThread } from "@/lib/ai/agent-thread-api";
import { createAgentThreadListAdapter } from "@/lib/ai/agent-thread-list-adapter";
import {
  ARCLAYER_AGENT_TOOL_NAMES,
  arclayerAgentToolkit,
} from "@/components/ai/arclayer-agent-toolkit";
import {
  agentIdsForComposerScope,
  consumeAIComposerDirectives,
  materializeAIComposerDirectiveCommands,
  skillInstallationIdsForComposerScope,
  useAIComposerDirectiveStore,
} from "@/components/ai/ai-composer-directives";

interface ArclayerThreadRuntimeOptions {
  readonly workspaceId: string;
  readonly projectId: string | null;
  readonly leadAgentId: string;
  readonly executionMode: AgentExecutionModeV1;
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

function isRunActive(projection: AgentRunProjectionV1): boolean {
  return ["created", "queued", "running", "cancellation_requested"].includes(projection.runStatus);
}

function isRunBlockingQueue(projection: AgentRunProjectionV1): boolean {
  return isRunActive(projection) || projection.runStatus === "interrupted";
}

function toUserFacingRuntimeError(
  error: unknown,
  localize: ArclayerThreadRuntimeOptions["localize"],
): Error {
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
      if (part.approval === undefined) return [];
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

function useArclayerThreadRuntime(options: ArclayerThreadRuntimeOptions) {
  const aui = useAui();
  const remoteThreadId = useAuiState((state) => state.threadListItem.remoteId);
  const [projection, setProjection] = useState<AgentRunProjectionV1>(() =>
    createAgentRunProjection({ runId: "thread-history", threadId: "new" }),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [runtimeError, setRuntimeError] = useState<unknown>(null);
  const projectionRef = useRef(projection);
  const activeRunIdRef = useRef<string | null>(null);
  const streamControllerRef = useRef<AbortController | null>(null);
  const skipNextThreadHydrationRef = useRef(false);

  const publishProjection = useCallback((next: AgentRunProjectionV1) => {
    projectionRef.current = next;
    activeRunIdRef.current = next.runStatus === "idle" ? null : next.runId;
    setProjection(next);
  }, []);

  const continueRun = useCallback(
    async (runId: string, initial: AgentRunProjectionV1, controller: AbortController) => {
      try {
        await consumeAgentRunStream({
          workspaceId: options.workspaceId,
          runId,
          initialProjection: initial,
          signal: controller.signal,
          onProjection: publishProjection,
        });
      } catch (error) {
        if (!controller.signal.aborted) throw error;
      }
    },
    [options.workspaceId, publishProjection],
  );

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

    void (async () => {
      const thread = await getAgentThread(options.workspaceId, remoteThreadId, {
        signal: controller.signal,
      });
      let next = replaceAgentThreadMessages(
        createAgentRunProjection({
          runId: thread.activeRunId ?? `thread-history:${remoteThreadId}`,
          threadId: remoteThreadId,
        }),
        thread.messages,
      );
      if (thread.activeRunId !== null) {
        const snapshot = await getAgentRunSnapshot(options.workspaceId, thread.activeRunId, {
          signal: controller.signal,
        });
        next = replaceAgentRunProjectionFromSnapshot(next, snapshot);
      }
      publishProjection(next);
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

  const resumeRecordedResponse = async (
    response: AgentToolResponseV1,
    controller: AbortController,
  ) => {
    const runId = activeRunIdRef.current;
    if (runId === null) throw new AgentRuntimeProtocolError("AGENT_RUN_NOT_ACTIVE");
    await resumeAgentRun(
      options.workspaceId,
      runId,
      {
        responseId: response.responseId,
        checkpointId: response.checkpointId,
        expectedSequence: response.expectedSequence,
        idempotencyKey: commandKey(),
      },
      { signal: controller.signal },
    );
    const snapshot = await getAgentRunSnapshot(options.workspaceId, runId, {
      signal: controller.signal,
    });
    const next = replaceAgentRunProjectionFromSnapshot(projectionRef.current, snapshot);
    publishProjection(next);
    await continueRun(runId, next, controller);
  };

  const respondWithHumanResult = async (toolCallId: string, result: unknown) => {
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
        idempotencyKey: commandKey(),
        result: result as never,
      },
      { signal: controller.signal },
    );
    await resumeRecordedResponse(response, controller);
  };

  const messages = projectAgentRunToAssistantMessages(projection, {
    registeredToolNames: ARCLAYER_AGENT_TOOL_NAMES,
    localize: options.localize,
  });

  const runAgentMessage = useCallback(
    async (message: AppendMessage) => {
      setIsSubmitting(true);
      try {
        let threadId = remoteThreadId;
        if (!threadId) {
          skipNextThreadHydrationRef.current = true;
          try {
            threadId = (await aui.threadListItem().initialize()).remoteId;
            await aui.threads().reload();
          } catch (error) {
            skipNextThreadHydrationRef.current = false;
            throw error;
          }
        }
        if (!threadId) throw new AgentRuntimeProtocolError("AGENT_THREAD_NOT_INITIALIZED");
        const mentionedAgentIds = readMentionedAgentIds(message);
        const selectedSkillInstallationIds = readSelectedSkillInstallationIds(message);
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
            executionMode: options.executionMode,
            siteRevisionId: null,
            message: readComposerText(message),
            idempotencyKey: commandKey(),
          },
          { signal: controller.signal },
        );
        consumeAIComposerDirectives("thread", mentionedAgentIds, selectedSkillInstallationIds);
        activeRunIdRef.current = created.runId;
        const snapshot = await getAgentRunSnapshot(options.workspaceId, created.runId, {
          signal: controller.signal,
        });
        const initial = replaceAgentRunProjectionFromSnapshot(
          createAgentRunProjection({ runId: created.runId, threadId }),
          snapshot,
        );
        publishProjection(initial);
        await continueRun(created.runId, initial, controller);
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
      publishProjection(replaceAgentRunProjectionFromSnapshot(projectionRef.current, snapshot));
    },
    onAddToolResult: async ({ toolCallId, result }) => {
      await respondWithHumanResult(toolCallId, result);
    },
    onResumeToolCall: ({ toolCallId, payload }) => {
      void respondWithHumanResult(toolCallId, payload).catch((error: unknown) => {
        setRuntimeError(toUserFacingRuntimeError(error, options.localize));
      });
    },
    onRespondToToolApproval: async ({ approvalId, approved, optionId, reason }) => {
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
  });

  if (runtimeError !== null) throw runtimeError;
  return runtime;
}

export function ArclayerAssistantProvider({
  children,
  initialTitle,
  ...runtimeOptions
}: ArclayerAssistantProviderProps) {
  const aui = useAui({ tools: Tools({ toolkit: arclayerAgentToolkit }) });
  const adapter = useMemo(
    () =>
      createAgentThreadListAdapter({
        workspaceId: runtimeOptions.workspaceId,
        projectId: runtimeOptions.projectId,
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
    return useArclayerThreadRuntime(runtimeOptions);
  }

  const runtime = useRemoteThreadListRuntime({ adapter, runtimeHook: useThreadRuntime });
  return (
    <AssistantRuntimeProvider aui={aui} runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
