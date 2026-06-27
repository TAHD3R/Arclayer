import {
  AssistantRuntimeProvider,
  WebSpeechDictationAdapter,
  createMessageQueue,
  useExternalStoreRuntime,
  type AppendMessage,
  type MessageQueueController,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  chatStream,
  cancelAIAgentRun,
  ensureAIConversationPersistedForRuntime,
  executeAIWorkspaceAction,
  formatAIChatError,
  getAIChatErrorDetails,
  sendAIAgentMessage,
  shouldUseAIWorkspaceAction,
  toAIWorkspaceActionArtifact,
  type AIChatMessage,
} from "@/api/ai";
import {
  DEFAULT_AI_AGENT_ID,
  DEFAULT_AI_COMPOSER_MODE,
  useAiChatStore,
  type AIAgentArtifactStep,
  type AIAgentExecutionSummary,
  type AIAgentInterrupt,
  type AIAgentMessageArtifact,
  type AIChatMessage as StoreAIChatMessage,
  type AIComposerMode,
  type AIConversation,
  type AIWorkspaceActionArtifact,
  type AIWorkspaceActionProject,
} from "@/stores/use-ai-chat-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

function messageContentToText(
  content: AppendMessage["content"] | ThreadMessageLike["content"],
): string {
  return typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.map((part) => (part.type === "text" ? part.text : "")).join("")
      : "";
}

function messageContentToReasoning(content: ThreadMessageLike["content"]): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (part.type === "reasoning" ? part.text : ""))
    .filter(Boolean)
    .join("\n\n");
}

function toRuntimeMessageContent(message: StoreAIChatMessage): ThreadMessageLike["content"] {
  if (message.role !== "assistant") return message.content;

  const parts: Array<{ type: "reasoning"; text: string } | { type: "text"; text: string }> = [];
  const reasoning = message.reasoning?.trim();
  if (reasoning) parts.push({ type: "reasoning", text: reasoning });
  if (message.content) parts.push({ type: "text", text: message.content });
  return parts.length > 0 ? parts : "";
}

function completeAttachmentContentToText(attachments: AppendMessage["attachments"]): string {
  return (attachments ?? [])
    .flatMap((attachment) => attachment.content ?? [])
    .map((part) => {
      if (part.type === "text") return part.text;
      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}

export function appendMessageToText(
  message: Pick<AppendMessage, "content" | "attachments">,
): string {
  return [
    messageContentToText(message.content),
    completeAttachmentContentToText(message.attachments),
  ]
    .filter((part) => part.trim())
    .join("\n\n");
}

/**
 * 将 assistant-ui 的 ThreadMessageLike[] 转为后端 /chat 接受的 AIChatMessage[]。
 */
function toChatMessages(messages: readonly ThreadMessageLike[]): AIChatMessage[] {
  return messages.map((m) => {
    const role: AIChatMessage["role"] = m.role === "assistant" ? "assistant" : "user";
    const content = messageContentToText(m.content);
    return { role, content };
  });
}

function toStoreMessages(messages: readonly ThreadMessageLike[]): StoreAIChatMessage[] {
  return messages
    .map((m): StoreAIChatMessage => {
      const role: AIChatMessage["role"] = m.role === "assistant" ? "assistant" : "user";
      const content = messageContentToText(m.content).trim();
      const reasoning = messageContentToReasoning(m.content).trim();
      if (role === "user") return { role, content };

      const custom = isRecord(m.metadata?.custom) ? m.metadata.custom : {};
      const status =
        m.status?.type === "incomplete" && m.status.reason === "error" ? m.status : null;
      const agentRunId = readCustomString(custom.agentRunId);
      const agentStatus = readAgentStatus(custom.agentStatus);
      const agentThreadId = readCustomString(custom.agentThreadId);
      const agentCheckpointId = readCustomString(custom.agentCheckpointId);
      const errorDetails = readCustomString(custom.errorDetails);
      const agentExecutionSummary = isAIAgentExecutionSummary(custom.agentExecutionSummary)
        ? custom.agentExecutionSummary
        : undefined;
      const workspaceAction = isAIWorkspaceActionArtifact(custom.workspaceAction)
        ? custom.workspaceAction
        : undefined;

      return {
        role,
        content,
        ...(reasoning ? { reasoning } : {}),
        ...(agentRunId ? { agentRunId } : {}),
        ...(agentStatus ? { agentStatus } : {}),
        ...(agentThreadId ? { agentThreadId } : {}),
        ...(agentCheckpointId ? { agentCheckpointId } : {}),
        ...(isAIAgentInterrupt(custom.agentInterrupt)
          ? { agentInterrupt: custom.agentInterrupt }
          : {}),
        ...(isAIAgentMessageArtifact(custom.agentArtifact)
          ? { agentArtifact: custom.agentArtifact }
          : {}),
        ...(workspaceAction ? { workspaceAction } : {}),
        ...(agentExecutionSummary ? { agentExecutionSummary } : {}),
        ...(status ? { error: true, errorMessage: String(status.error || "") } : {}),
        ...(errorDetails ? { errorDetails } : {}),
      };
    })
    .filter((message) => message.content || shouldKeepAssistantMetadata(message));
}

function readCustomString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readAgentStatus(value: unknown): StoreAIChatMessage["agentStatus"] | undefined {
  if (
    value === "running" ||
    value === "interrupted" ||
    value === "completed" ||
    value === "cancelled" ||
    value === "failed"
  ) {
    return value;
  }
  return undefined;
}

function shouldKeepAssistantMetadata(message: StoreAIChatMessage): boolean {
  return (
    message.role === "assistant" &&
    Boolean(
      message.agentRunId ||
      message.agentStatus ||
      message.agentThreadId ||
      message.agentCheckpointId ||
      message.agentInterrupt ||
      message.agentArtifact ||
      message.workspaceAction ||
      message.agentExecutionSummary ||
      message.error ||
      message.errorDetails ||
      message.reasoning,
    )
  );
}

function isAIAgentInterrupt(value: unknown): value is AIAgentInterrupt {
  return (
    isRecord(value) &&
    typeof value.kind === "string" &&
    typeof value.runId === "string" &&
    typeof value.agentId === "string" &&
    (value.mode === "build" || value.mode === "plan" || value.mode === "agent") &&
    typeof value.prompt === "string" &&
    isRecord(value.toolOutputs) &&
    typeof value.requiredDecision === "string" &&
    (value.interruptId === undefined || typeof value.interruptId === "string") &&
    (value.threadId === undefined || typeof value.threadId === "string") &&
    (value.checkpointId === undefined || typeof value.checkpointId === "string")
  );
}

function isAIAgentExecutionSummary(value: unknown): value is AIAgentExecutionSummary {
  return (
    isRecord(value) &&
    Array.isArray(value.toolNames) &&
    value.toolNames.every((toolName) => typeof toolName === "string") &&
    (value.promptTokens === undefined || typeof value.promptTokens === "number") &&
    (value.completionTokens === undefined || typeof value.completionTokens === "number") &&
    (value.totalTokens === undefined || typeof value.totalTokens === "number")
  );
}

function isAIAgentMessageArtifact(value: unknown): value is AIAgentMessageArtifact {
  if (!isRecord(value)) return false;

  if (value.type === "agent_execution_plan") {
    return (
      typeof value.goal === "string" &&
      typeof value.status === "string" &&
      Array.isArray(value.steps) &&
      value.steps.every(isAIAgentArtifactStep)
    );
  }

  if (value.type === "agent_build_blueprint") {
    return (
      typeof value.goal === "string" &&
      typeof value.status === "string" &&
      Array.isArray(value.operations) &&
      value.operations.every(isAIAgentArtifactStep) &&
      typeof value.appliesChanges === "boolean" &&
      typeof value.requiresApprovalBeforeApply === "boolean"
    );
  }

  return false;
}

function isAIWorkspaceActionArtifact(value: unknown): value is AIWorkspaceActionArtifact {
  if (!isRecord(value) || value.status !== "completed") return false;
  if (value.type === "workspace_project_created") {
    return isWorkspaceActionProject(value.project) && isWorkspaceActionNavigation(value.navigation);
  }
  if (value.type === "workspace_project_list") {
    return (
      Array.isArray(value.projects) &&
      value.projects.every(isWorkspaceActionProject) &&
      typeof value.total === "number" &&
      isWorkspaceActionNavigation(value.navigation)
    );
  }
  if (value.type === "workspace_content_model_created") {
    return (
      isWorkspaceActionContentModel(value.contentModel) &&
      isWorkspaceActionNavigation(value.navigation)
    );
  }
  if (value.type === "workspace_navigation") {
    return isWorkspaceActionNavigation(value.navigation);
  }
  return false;
}

function isWorkspaceActionProject(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.slug === "string" &&
    (value.description === undefined ||
      value.description === null ||
      typeof value.description === "string")
  );
}

function isWorkspaceActionContentModel(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.singularKey === "string" &&
    typeof value.pluralKey === "string" &&
    typeof value.modelKind === "string" &&
    (value.description === undefined ||
      value.description === null ||
      typeof value.description === "string")
  );
}

function isWorkspaceActionNavigation(value: unknown): boolean {
  return isRecord(value) && typeof value.label === "string" && typeof value.path === "string";
}

function isAIAgentArtifactStep(value: unknown): value is AIAgentArtifactStep {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.status === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function createDictationAdapter() {
  if (typeof window === "undefined") return undefined;
  if (!WebSpeechDictationAdapter.isSupported()) return undefined;
  return new WebSpeechDictationAdapter({
    language: navigator.language,
    continuous: true,
    interimResults: true,
  });
}

export function agentIdForComposerMode(mode: AIComposerMode, selectedAgentId: string): string {
  if (mode === "build") return "content_builder";
  if (mode === "plan") return "content_advisor";
  return selectedAgentId || DEFAULT_AI_AGENT_ID;
}

function runtimeMessageId(index: number): string {
  return `ai-message-${index}`;
}

function runtimeMessageIndex(messageId: string | null): number | null {
  if (!messageId?.startsWith("ai-message-")) return null;
  const index = Number.parseInt(messageId.slice("ai-message-".length), 10);
  return Number.isInteger(index) && index >= 0 ? index : null;
}

export async function sendAIChatMessage(
  conversationId: string,
  text: string,
  options?: { signal?: AbortSignal },
): Promise<void> {
  return sendAIChatMessageWithSignal(conversationId, text, options);
}

export async function sendAIWorkspaceActionMessage(
  conversationId: string,
  text: string,
  options?: { signal?: AbortSignal },
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;

  const state = useAiChatStore.getState();
  const conversation = state.conversations.find((c) => c.id === conversationId);
  if (!conversation) {
    throw new Error(`AI conversation not found: ${conversationId}`);
  }

  state.appendMessage(conversationId, { role: "user", content: trimmed });
  state.setStreaming(true);
  try {
    await ensureAIConversationPersistedForRuntime(conversationId, { applyResponse: false });
    const result = await executeAIWorkspaceAction(trimmed, {
      signal: options?.signal,
      projectId: resolveWorkspaceActionProjectId(conversation, trimmed),
    });
    useAiChatStore.getState().appendMessage(conversationId, {
      role: "assistant",
      content: result.content,
      workspaceAction: toAIWorkspaceActionArtifact(result),
      agentExecutionSummary: { toolNames: [`workspace.${result.action}`] },
    });
    await ensureAIConversationPersistedForRuntime(conversationId);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      await ensureAIConversationPersistedForRuntime(conversationId);
      return;
    }
    useAiChatStore.getState().appendMessage(conversationId, {
      role: "assistant",
      content: "",
      error: true,
      errorMessage: formatAIChatError(err),
      errorDetails: getAIChatErrorDetails(err),
    });
    await ensureAIConversationPersistedForRuntime(conversationId);
  } finally {
    useAiChatStore.getState().setStreaming(false);
  }
}

async function persistConversationAfterManualMessageChange(conversationId: string): Promise<void> {
  try {
    await ensureAIConversationPersistedForRuntime(conversationId);
  } catch (error) {
    useAiChatStore.getState().appendMessage(conversationId, {
      role: "assistant",
      content: "",
      error: true,
      errorMessage: formatAIChatError(error),
      errorDetails: getAIChatErrorDetails(error),
    });
    throw error;
  }
}

async function sendAIChatMessageWithSignal(
  conversationId: string,
  text: string,
  options?: { signal?: AbortSignal },
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;

  const state = useAiChatStore.getState();
  const conversation = state.conversations.find((c) => c.id === conversationId);
  if (!conversation) {
    throw new Error(`AI conversation not found: ${conversationId}`);
  }

  state.appendMessage(conversationId, { role: "user", content: trimmed });
  const history = toChatMessages([
    ...conversation.messages
      .filter((message) => !(message.role === "assistant" && message.error))
      .map(
        (message): ThreadMessageLike => ({
          role: message.role,
          content: message.content,
        }),
      ),
    { role: "user", content: trimmed },
  ]);

  state.appendDelta(conversationId, "");
  state.setStreaming(true);

  try {
    await ensureAIConversationPersistedForRuntime(conversationId, { applyResponse: false });
    for await (const delta of chatStream(history, {
      model: state.selectedModel,
      reasoningEffort: state.selectedReasoningEffort,
      signal: options?.signal,
    })) {
      if (typeof delta === "string") {
        useAiChatStore.getState().appendDelta(conversationId, delta);
      } else if (delta.type === "reasoning") {
        useAiChatStore.getState().appendReasoningDelta(conversationId, delta.text);
      } else {
        useAiChatStore.getState().appendDelta(conversationId, delta.text);
      }
    }
    useAiChatStore.getState().finalizeLastAssistant(conversationId);
    await ensureAIConversationPersistedForRuntime(conversationId);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      useAiChatStore.getState().finalizeLastAssistant(conversationId);
      await ensureAIConversationPersistedForRuntime(conversationId);
      return;
    }
    const message = formatAIChatError(err);
    const details = getAIChatErrorDetails(err);
    useAiChatStore.getState().finalizeLastAssistant(conversationId, {
      error: true,
      errorMessage: message,
      errorDetails: details,
    });
    await ensureAIConversationPersistedForRuntime(conversationId);
  } finally {
    useAiChatStore.getState().setStreaming(false);
  }
}

export async function retryLatestAIChatMessage(conversationId: string): Promise<void> {
  const state = useAiChatStore.getState();
  const conversation = state.conversations.find((c) => c.id === conversationId);
  if (!conversation) {
    throw new Error(`AI conversation not found: ${conversationId}`);
  }

  let lastUserIndex = -1;
  for (let index = conversation.messages.length - 1; index >= 0; index -= 1) {
    if (conversation.messages[index]?.role === "user") {
      lastUserIndex = index;
      break;
    }
  }
  const lastUserMessage = lastUserIndex >= 0 ? conversation.messages[lastUserIndex] : null;
  if (!lastUserMessage) {
    throw new Error(`AI conversation has no user message to retry: ${conversationId}`);
  }

  state.replaceMessages(conversationId, conversation.messages.slice(0, lastUserIndex));
  if (shouldExecuteAIWorkspaceAction(state.composerMode, lastUserMessage.content)) {
    await sendAIWorkspaceActionMessage(conversationId, lastUserMessage.content);
    return;
  }
  await sendAIChatMessage(conversationId, lastUserMessage.content);
}

/**
 * AI 对话 runtime provider：用 useExternalStoreRuntime 对接 zustand store
 * （会话持久化在 store），onNew 调用 SSE chatStream 流式回填 assistant 消息。
 *
 * 单会话作用域：按 conversationId remount 以隔离不同会话状态。
 */
export function AIChatRuntimeProvider({
  conversationId,
  children,
}: {
  conversationId: string;
  children: React.ReactNode;
}) {
  const conversation = useAiChatStore(
    (s) => s.conversations.find((c) => c.id === conversationId) ?? null,
  );
  const streaming = useAiChatStore((s) => s.streaming);
  const activeRequestRef = useRef<AbortController | null>(null);
  const activeAgentRunIdRef = useRef<string | null>(null);
  const queuedMessageRunnerRef = useRef<(message: AppendMessage) => Promise<void>>(async () => {
    throw new Error("AI message queue runner is not initialized");
  });
  const [, forceQueueRender] = useState(0);
  const dictationAdapter = useMemo(() => createDictationAdapter(), []);

  const queueController = useMemo<MessageQueueController>(() => {
    const controller = createMessageQueue({
      run: (message) => {
        void queuedMessageRunnerRef.current(message).finally(() => {
          controller.notifyIdle();
        });
      },
    });
    return controller;
  }, [conversationId]);

  useEffect(() => {
    const unsubscribe = queueController.subscribe(() => {
      forceQueueRender((version) => version + 1);
    });
    return () => {
      unsubscribe();
      queueController.adapter.clear("cancel-run");
    };
  }, [queueController]);

  const sendRuntimeText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (!useAiChatStore.getState().conversations.some((item) => item.id === conversationId)) {
        return;
      }

      const controller = new AbortController();
      activeRequestRef.current = controller;
      activeAgentRunIdRef.current = null;
      try {
        const state = useAiChatStore.getState();
        const mode = state.composerMode || DEFAULT_AI_COMPOSER_MODE;
        if (mode === "agent") {
          await sendAIAgentMessage(conversationId, trimmed, {
            agentId: agentIdForComposerMode(mode, state.selectedAgentId),
            model: state.selectedModel,
            reasoningEffort: state.selectedReasoningEffort,
            signal: controller.signal,
            onRunCreated: (runId) => {
              activeAgentRunIdRef.current = runId;
            },
          });
        } else if (shouldExecuteAIWorkspaceAction(mode, trimmed)) {
          await sendAIWorkspaceActionMessage(conversationId, trimmed, {
            signal: controller.signal,
          });
        } else {
          await sendAIChatMessage(conversationId, trimmed, { signal: controller.signal });
        }
      } finally {
        if (activeRequestRef.current === controller) {
          activeRequestRef.current = null;
        }
        activeAgentRunIdRef.current = null;
      }
    },
    [conversationId],
  );

  const sendRuntimeMessage = useCallback(
    async (message: AppendMessage) => {
      await sendRuntimeText(appendMessageToText(message));
    },
    [sendRuntimeText],
  );
  queuedMessageRunnerRef.current = sendRuntimeMessage;

  const runRuntimeTextOutsideQueue = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      queueController.notifyBusy();
      try {
        await sendRuntimeText(text);
      } finally {
        queueController.notifyIdle();
      }
    },
    [queueController, sendRuntimeText],
  );

  const messages: ThreadMessageLike[] = (conversation?.messages ?? []).map((m, index) => ({
    id: runtimeMessageId(index),
    role: m.role,
    content: m.error ? "" : toRuntimeMessageContent(m),
    status:
      m.role === "assistant" && m.error
        ? {
            type: "incomplete",
            reason: "error",
            error: formatAIChatError(m.errorMessage ?? m.content),
          }
        : undefined,
    metadata:
      m.role === "assistant" &&
      (m.agentRunId ||
        m.agentStatus ||
        m.agentThreadId ||
        m.agentCheckpointId ||
        m.agentInterrupt ||
        m.agentArtifact ||
        m.workspaceAction ||
        m.agentExecutionSummary ||
        (m.error && m.errorDetails))
        ? {
            custom: {
              conversationId,
              ...(m.agentRunId ? { agentRunId: m.agentRunId } : {}),
              ...(m.agentStatus ? { agentStatus: m.agentStatus } : {}),
              ...(m.agentThreadId ? { agentThreadId: m.agentThreadId } : {}),
              ...(m.agentCheckpointId ? { agentCheckpointId: m.agentCheckpointId } : {}),
              ...(m.agentInterrupt ? { agentInterrupt: m.agentInterrupt } : {}),
              ...(m.agentArtifact ? { agentArtifact: m.agentArtifact } : {}),
              ...(m.workspaceAction ? { workspaceAction: m.workspaceAction } : {}),
              ...(m.agentExecutionSummary
                ? { agentExecutionSummary: m.agentExecutionSummary }
                : {}),
              ...(m.error && m.errorDetails ? { errorDetails: m.errorDetails } : {}),
            },
          }
        : undefined,
  }));

  const runtime = useExternalStoreRuntime({
    messages,
    isRunning: streaming,
    isSendDisabled: !conversation,
    adapters: {
      dictation: dictationAdapter,
    },
    queue: queueController.adapter,
    convertMessage: (m: ThreadMessageLike) => m,
    setMessages: (nextMessages: readonly ThreadMessageLike[]) => {
      useAiChatStore.getState().replaceMessages(conversationId, toStoreMessages(nextMessages));
      void persistConversationAfterManualMessageChange(conversationId).catch(() => undefined);
    },
    onReload: async (parentId) => {
      const parentIndex = runtimeMessageIndex(parentId);
      if (parentIndex === null) {
        throw new Error("Cannot regenerate AI response without a parent user message");
      }

      const currentConversation = useAiChatStore
        .getState()
        .conversations.find((item) => item.id === conversationId);
      if (!currentConversation) {
        throw new Error(`AI conversation not found: ${conversationId}`);
      }

      const parentMessage = currentConversation.messages[parentIndex];
      if (!parentMessage || parentMessage.role !== "user") {
        throw new Error(`Cannot regenerate AI response from message ${parentId}`);
      }

      queueController.adapter.clear("reload");
      useAiChatStore
        .getState()
        .replaceMessages(conversationId, currentConversation.messages.slice(0, parentIndex));
      await persistConversationAfterManualMessageChange(conversationId);
      await runRuntimeTextOutsideQueue(parentMessage.content);
    },
    onEdit: async (message) => {
      const sourceIndex = runtimeMessageIndex(message.sourceId);
      if (sourceIndex === null) {
        throw new Error("Cannot edit AI message without a source message id");
      }

      const text = appendMessageToText(message).trim();
      if (!text) {
        throw new Error("Cannot edit AI message to empty content");
      }
      const currentConversation = useAiChatStore
        .getState()
        .conversations.find((item) => item.id === conversationId);
      if (!currentConversation) {
        throw new Error(`AI conversation not found: ${conversationId}`);
      }

      const sourceMessage = currentConversation.messages[sourceIndex];
      if (!sourceMessage || sourceMessage.role !== "user") {
        throw new Error(`Cannot edit non-user AI message ${message.sourceId}`);
      }

      queueController.adapter.clear("edit");
      useAiChatStore
        .getState()
        .replaceMessages(conversationId, currentConversation.messages.slice(0, sourceIndex));
      await persistConversationAfterManualMessageChange(conversationId);
      await runRuntimeTextOutsideQueue(text);
    },
    onCancel: async () => {
      queueController.adapter.clear("cancel-run");
      const controller = activeRequestRef.current;
      const runId = activeAgentRunIdRef.current;
      const projectId = useWorkspaceStore.getState().currentProjectId;
      try {
        if (runId && projectId) {
          await cancelAIAgentRun(projectId, runId);
          useAiChatStore
            .getState()
            .setLastAssistantAgentRun(conversationId, { runId, status: "cancelled" });
          await persistConversationAfterManualMessageChange(conversationId);
        }
      } finally {
        controller?.abort();
        if (activeRequestRef.current === controller) {
          activeRequestRef.current = null;
        }
        activeAgentRunIdRef.current = null;
      }
    },
    onNew: async (message) => {
      const text = appendMessageToText(message);
      await runRuntimeTextOutsideQueue(text);
    },
  });

  return (
    <AssistantRuntimeProvider key={conversationId} runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}

function shouldExecuteAIWorkspaceAction(mode: AIComposerMode, text: string): boolean {
  if (mode === "plan") return false;
  return shouldUseAIWorkspaceAction(text);
}

function resolveWorkspaceActionProjectId(
  conversation: AIConversation,
  text: string,
): string | null {
  const directiveProjectId = projectIdFromComposerDirective(text);
  if (directiveProjectId) return directiveProjectId;
  for (let index = conversation.messages.length - 1; index >= 0; index -= 1) {
    const message = conversation.messages[index];
    if (message?.role !== "assistant") continue;
    const project = projectFromWorkspaceAction(message.workspaceAction);
    if (project) return project.id;
  }
  return (
    useWorkspaceStore.getState().currentProjectId ??
    useWorkspaceStore.getState().lastProjectId ??
    null
  );
}

function projectIdFromComposerDirective(text: string): string | null {
  const match = /:project\[[^\]\n]{1,1024}\]\{name=([^}\n]{1,1024})\}/u.exec(text);
  return match?.[1]?.trim() || null;
}

function projectFromWorkspaceAction(
  artifact: StoreAIChatMessage["workspaceAction"],
): AIWorkspaceActionProject | null {
  if (!artifact) return null;
  if (artifact.type === "workspace_project_created") return artifact.project;
  if (artifact.type === "workspace_project_list" && artifact.projects.length > 0) {
    return artifact.projects[0];
  }
  return null;
}
