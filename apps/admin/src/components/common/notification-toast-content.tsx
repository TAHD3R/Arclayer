import { Archive, Check, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import type { NotificationOut as NotificationItem } from "@arclayer/openapi";
import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";

type NotificationToastContentProps = {
  item: NotificationItem;
  onOpenTarget?: () => Promise<void>;
  onMarkRead?: () => Promise<void>;
  onArchive?: () => Promise<void>;
  onDelete?: () => Promise<void>;
  showTitle?: boolean;
  title?: string;
  body?: string | null;
  actionLabel?: string;
};

export function NotificationToastContent({
  item,
  onOpenTarget,
  onMarkRead,
  onArchive,
  onDelete,
  showTitle = true,
  title = item.title,
  body = item.body,
  actionLabel,
}: NotificationToastContentProps) {
  const { t } = useTranslation("notifications");
  const dateTime = useAdminDateTimeFormatter({ workspaceId: null });
  const timeText = useMemo(
    () => dateTime.formatDateTime(item.createdAt),
    [dateTime, item.createdAt],
  );

  return (
    <div className="grid gap-2">
      {showTitle ? (
        onOpenTarget ? (
          <button
            type="button"
            className="min-w-0 text-left text-headline font-semibold text-label-primary transition-colors hover:text-primary"
            onClick={() => {
              void onOpenTarget();
            }}
          >
            <span
              className={cn(
                "block truncate",
                item.readAt ? "text-label-secondary line-through" : undefined,
              )}
            >
              {title}
            </span>
          </button>
        ) : (
          <div className="min-w-0 truncate text-headline font-semibold text-label-primary">
            {title}
          </div>
        )
      ) : null}
      {body ? <p className="text-callout text-label-secondary">{body}</p> : null}
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-footnote text-label-secondary">{timeText}</span>
        <div className="flex shrink-0 items-center gap-1">
          {actionLabel && onOpenTarget ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                void onOpenTarget();
              }}
            >
              {actionLabel}
            </Button>
          ) : null}
          {!item.readAt && onMarkRead ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("NOTIFICATIONS_MARK_AS_READ")}
              onClick={() => {
                void onMarkRead();
              }}
            >
              <Check className="size-4" aria-hidden="true" />
            </Button>
          ) : null}
          {!item.archivedAt && onArchive ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("NOTIFICATIONS_ARCHIVE")}
              onClick={() => {
                void onArchive();
              }}
            >
              <Archive className="size-4" aria-hidden="true" />
            </Button>
          ) : null}
          {onDelete ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("NOTIFICATIONS_DELETE")}
              onClick={() => {
                void onDelete();
              }}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
