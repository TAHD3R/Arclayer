import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ThreadMessageLike,
} from "@assistant-ui/react";

import { chatStream, type AIChatMessage } from "@/api/ai";
import { useAiChatStore } from "@/stores/use-ai-chat-store";

/**
 * 将 assistant-ui 的 ThreadMessageLike[] 转为后端 /chat 接受的 AIChatMessage[]。
 */
function toChatMessages(messages: readonly ThreadMessageLike[]): AIChatMessage[] {
  return messages.map((m) => {
    const role: AIChatMessage["role"] = m.role === "assistant" ? "assistant" : "user";
    const content =
      typeof m.content === "string"
        ? m.content
        : Array.isArray(m.content)
          ? m.content.map((part) => (part.type === "text" ? part.text : "")).join("")
          : "";
    return { role, content };
  });
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
  const appendMessage = useAiChatStore((s) => s.appendMessage);
  const appendDelta = useAiChatStore((s) => s.appendDelta);
  const finalizeLastAssistant = useAiChatStore((s) => s.finalizeLastAssistant);
  const setStreaming = useAiChatStore((s) => s.setStreaming);

  const messages: ThreadMessageLike[] = (conversation?.messages ?? []).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const runtime = useExternalStoreRuntime({
    messages,
    isRunning: false,
    convertMessage: (m: ThreadMessageLike) => m,
    setMessages: () => {
      // store 是真源，runtime 回写由 onNew 内部 appendDelta 处理
    },
    onNew: async (message) => {
      const text =
        typeof message.content === "string"
          ? message.content
          : Array.isArray(message.content)
            ? message.content.map((p) => (p.type === "text" ? p.text : "")).join("")
            : "";

      appendMessage(conversationId, { role: "user", content: text });
      const history = toChatMessages([
        ...(conversation?.messages ?? []),
        { role: "user", content: text },
      ]);

      appendDelta(conversationId, "");
      setStreaming(true);

      try {
        for await (const delta of chatStream(history)) {
          appendDelta(conversationId, delta);
        }
        finalizeLastAssistant(conversationId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "AI 请求失败";
        appendDelta(conversationId, msg);
        finalizeLastAssistant(conversationId, { error: true });
      } finally {
        setStreaming(false);
      }
    },
  });

  return (
    <AssistantRuntimeProvider key={conversationId} runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
