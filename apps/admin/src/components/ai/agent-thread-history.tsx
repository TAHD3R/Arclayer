"use client";

import { ThreadListPrimitive } from "@assistant-ui/react";
import { HistoryIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { AgentThreadList } from "@/components/ai/agent-thread-list";
import { Button } from "@arclayer/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@arclayer/ui/popover";
import { Separator } from "@arclayer/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@arclayer/ui/tooltip";

export function AgentThreadHistory() {
  const { t } = useTranslation(["ai"]);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("ai:AI_CHAT_THREAD_HISTORY")}
              className="text-label-secondary hover:text-label-primary"
            >
              <HistoryIcon className="size-4" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("ai:AI_CHAT_THREAD_HISTORY")}</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="flex max-h-[min(34rem,calc(100vh-7rem))] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl p-0"
      >
        <ThreadListPrimitive.Root className="flex min-h-0 flex-col">
          <div className="flex shrink-0 items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-callout font-semibold text-label-primary">
                {t("ai:AI_CHAT_THREAD_HISTORY")}
              </h2>
              <p className="text-caption text-label-secondary">
                {t("ai:AI_CHAT_THREAD_HISTORY_DESCRIPTION")}
              </p>
            </div>
            <ThreadListPrimitive.New asChild>
              <Button type="button" size="sm" onClick={close}>
                <PlusIcon data-icon="inline-start" aria-hidden="true" />
                {t("ai:AI_CHAT_THREAD_NEW")}
              </Button>
            </ThreadListPrimitive.New>
          </div>
          <Separator />
          <AgentThreadList onThreadSelect={close} />
        </ThreadListPrimitive.Root>
      </PopoverContent>
    </Popover>
  );
}
