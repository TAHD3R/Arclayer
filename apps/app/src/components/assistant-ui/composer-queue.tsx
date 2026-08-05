"use client";

import { ComposerPrimitive, QueueItemPrimitive, useAuiState } from "@assistant-ui/react";
import { ArrowDownIcon, XIcon } from "lucide-react";
import type { FC } from "react";
import { useTranslation } from "react-i18next";

export const ComposerQueue: FC = () => {
  const { t } = useTranslation(["ai", "common"]);
  const queueLength = useAuiState((s) => s.composer.queue.length);

  if (queueLength === 0) return null;

  return (
    <div
      data-slot="aui_composer-queue"
      className="mb-2 flex max-h-28 w-full min-w-0 flex-col gap-1.5 overflow-y-auto rounded-xl border border-border/60 bg-background/95 p-1.5 shadow-sm"
    >
      <ComposerPrimitive.Queue>
        {({ queueItem }) => (
          <div
            className="flex min-h-8 min-w-0 items-center gap-2 rounded-lg bg-muted/50 px-2 py-1.5 text-footnote text-label-primary"
            data-queue-item-id={queueItem.id}
          >
            <span className="shrink-0 rounded-full bg-background px-1.5 py-0.5 text-caption font-medium text-muted-foreground">
              {t("ai:AI_CHAT_QUEUE_LABEL")}
            </span>
            <QueueItemPrimitive.Text className="min-w-0 flex-1 truncate" />
            <QueueItemPrimitive.Steer asChild>
              <button
                type="button"
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t("ai:AI_CHAT_QUEUE_RUN_NEXT")}
                title={t("ai:AI_CHAT_QUEUE_RUN_NEXT")}
              >
                <ArrowDownIcon className="size-3.5 rotate-180" aria-hidden="true" />
              </button>
            </QueueItemPrimitive.Steer>
            <QueueItemPrimitive.Remove asChild>
              <button
                type="button"
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t("ai:AI_CHAT_QUEUE_REMOVE")}
                title={t("ai:AI_CHAT_QUEUE_REMOVE")}
              >
                <XIcon className="size-3.5" aria-hidden="true" />
              </button>
            </QueueItemPrimitive.Remove>
          </div>
        )}
      </ComposerPrimitive.Queue>
    </div>
  );
};
