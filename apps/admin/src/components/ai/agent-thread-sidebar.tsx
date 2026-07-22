"use client";

import { ThreadListPrimitive } from "@assistant-ui/react";
import { MessageCircleIcon, PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AgentThreadList } from "@/components/ai/agent-thread-list";
import { AgentLauncher } from "@/components/ai/agent-launcher";
import { useAiChatStore } from "@/stores/use-ai-chat-store";
import { Button } from "@arclayer/ui/button";
import { Separator } from "@arclayer/ui/separator";

export function AgentThreadSidebar() {
  const { t } = useTranslation(["ai"]);
  const openDrawer = useAiChatStore((state) => state.openDrawer);

  return (
    <ThreadListPrimitive.Root className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-start gap-3 px-2 pb-3 pt-2">
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-label-secondary">
          <MessageCircleIcon className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-callout font-semibold text-label-primary">
            {t("ai:AI_CHAT_CONVERSATIONS")}
          </h2>
          <p className="mt-0.5 text-caption text-label-secondary">
            {t("ai:AI_CHAT_THREAD_HISTORY_DESCRIPTION")}
          </p>
        </div>
      </div>
      <AgentLauncher />
      <div className="px-2 pb-3">
        <ThreadListPrimitive.New asChild>
          <Button type="button" className="w-full justify-center" onClick={openDrawer}>
            <PlusIcon data-icon="inline-start" aria-hidden="true" />
            {t("ai:AI_CHAT_THREAD_NEW")}
          </Button>
        </ThreadListPrimitive.New>
      </div>
      <Separator />
      <AgentThreadList className="flex-1" onThreadSelect={openDrawer} />
    </ThreadListPrimitive.Root>
  );
}
