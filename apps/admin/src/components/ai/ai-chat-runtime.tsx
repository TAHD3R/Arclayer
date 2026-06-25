import {
  AssistantRuntimeProvider,
  CompositeAttachmentAdapter,
  SimpleTextAttachmentAdapter,
  WebSpeechDictationAdapter,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { useMemo, useRef } from "react";

import {
  chatStream,
  cancelAIAgentRun,
  formatAIChatError,
  getAIChatErrorDetails,
  sendAIAgentMessage,
  type AIChatMessage,
} from "@/api/ai";
import { useAiChatStore } from "@/stores/use-ai-chat-store";
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

function toStoreMessages(messages: readonly ThreadMessageLike[]) {
  return messages
    .map((m) => {
      const role: AIChatMessage["role"] = m.role === "assistant" ? "assistant" : "user";
      const content = messageContentToText(m.content).trim();
      return { role, content };
    })
    .filter((message) => message.content);
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

export async function sendAIChatMessage(
  conversationId: string,
  text: string,
  options?: { signal?: AbortSignal },
): Promise<void> {
  return sendAIChatMessageWithSignal(conversationId, text, options);
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
    for await (const delta of chatStream(history, {
      model: state.selectedModel,
      reasoningEffort: state.selectedReasoningEffort,
      signal: options?.signal,
    })) {
      useAiChatStore.getState().appendDelta(conversationId, delta);
    }
    useAiChatStore.getState().finalizeLastAssistant(conversationId);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      useAiChatStore.getState().finalizeLastAssistant(conversationId);
      return;
    }
    const message = formatAIChatError(err);
    const details = getAIChatErrorDetails(err);
    useAiChatStore.getState().finalizeLastAssistant(conversationId, {
      error: true,
      errorMessage: message,
      errorDetails: details,
    });
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
  const dictationAdapter = useMemo(() => createDictationAdapter(), []);
  const attachmentAdapter = useMemo(
    () => new CompositeAttachmentAdapter([new SimpleTextAttachmentAdapter()]),
    [],
  );

  const messages: ThreadMessageLike[] = (conversation?.messages ?? []).map((m) => ({
    role: m.role,
    content: m.error ? "" : m.content,
    status:
      m.role === "assistant" && m.error
        ? {
            type: "incomplete",
            reason: "error",
            error: formatAIChatError(m.errorMessage ?? m.content),
          }
        : undefined,
    metadata:
      m.role === "assistant" && m.error && m.errorDetails
        ? { custom: { errorDetails: m.errorDetails } }
        : undefined,
  }));

  const runtime = useExternalStoreRuntime({
    messages,
    isRunning: streaming,
    adapters: {
      attachments: attachmentAdapter,
      dictation: dictationAdapter,
    },
    convertMessage: (m: ThreadMessageLike) => m,
    setMessages: (nextMessages: readonly ThreadMessageLike[]) => {
      useAiChatStore.getState().replaceMessages(conversationId, toStoreMessages(nextMessages));
    },
    onCancel: async () => {
      const runId = activeAgentRunIdRef.current;
      const projectId = useWorkspaceStore.getState().currentProjectId;
      if (runId && projectId) {
        await cancelAIAgentRun(projectId, runId);
        useAiChatStore
          .getState()
          .setLastAssistantAgentRun(conversationId, { runId, status: "cancelled" });
      }
      activeRequestRef.current?.abort();
      activeRequestRef.current = null;
      activeAgentRunIdRef.current = null;
    },
    onNew: async (message) => {
      const state = useAiChatStore.getState();
      const text = appendMessageToText(message);
      if (state.composerMode === "agent") {
        const controller = new AbortController();
        activeRequestRef.current = controller;
        activeAgentRunIdRef.current = null;
        try {
          await sendAIAgentMessage(conversationId, text, {
            signal: controller.signal,
            onRunCreated: (runId) => {
              activeAgentRunIdRef.current = runId;
            },
          });
        } finally {
          if (activeRequestRef.current === controller) {
            activeRequestRef.current = null;
          }
          activeAgentRunIdRef.current = null;
        }
        return;
      }
      const controller = new AbortController();
      activeRequestRef.current = controller;
      try {
        await sendAIChatMessageWithSignal(conversationId, text, { signal: controller.signal });
      } finally {
        if (activeRequestRef.current === controller) {
          activeRequestRef.current = null;
        }
      }
    },
  });

  return (
    <AssistantRuntimeProvider key={conversationId} runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
