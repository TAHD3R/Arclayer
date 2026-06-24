import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { Thread } from "@/components/assistant-ui/thread";
import { AIChatRuntimeProvider } from "@/components/ai/ai-chat-runtime";
import { useAiChatStore } from "@/stores/use-ai-chat-store";

/**
 * 根 `/` 全屏对话页（Claude 式居中对话框）。
 * 会话管理由左侧 AI Tab 承载，主页只保留当前会话的居中对话体验。
 * Phase 1.9 前端 AI Tab（spec §4.1 任务 1.9）。
 */
export function HomePage() {
  const { t } = useTranslation(["common"]);
  const activeId = useAiChatStore((s) => s.activeId);
  const conversations = useAiChatStore((s) => s.conversations);
  const createConversation = useAiChatStore((s) => s.createConversation);

  // 首次进入且无会话时自动新建一个
  useEffect(() => {
    if (!activeId && conversations.length === 0) {
      createConversation();
    }
  }, [activeId, conversations.length, createConversation]);

  if (!activeId) {
    return (
      <div className="flex h-full items-center justify-center text-label-secondary">
        {t("common:AI_CHAT_EMPTY_HINT")}
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col" data-page="ai-home">
      <div className="min-h-0 flex-1">
        <AIChatRuntimeProvider conversationId={activeId}>
          <Thread />
        </AIChatRuntimeProvider>
      </div>
    </div>
  );
}
