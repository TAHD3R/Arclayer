import { Archive, Check, ShieldCheck, Trash2, Users, Wrench } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import type { NotificationCategory, NotificationOut as NotificationItem } from "@arclayer/openapi";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemHeader,
  ItemMedia,
  ItemTitle,
} from "@arclayer/ui/item";
import { Button } from "@arclayer/ui/button";
import { cn } from "@arclayer/lib/utils";

interface NotificationCardProps {
  item: NotificationItem;
  nowMs: number;
  isRead: boolean;
  onNavigate: () => void;
  onMarkRead?: () => void;
  onDelete?: () => void;
  onArchive?: () => void;
  /** Compact mode for popup panel — hides category icon column */
  compact?: boolean;
  layoutMode?: "default" | "sidebar-inbox";
}

function pickCategoryIcon(category: NotificationCategory) {
  const normalized = String(category || "").toLowerCase();
  if (normalized === "team") return Users;
  if (normalized === "security") return ShieldCheck;
  return Wrench;
}

export function NotificationCard({
  item,
  nowMs,
  isRead,
  onNavigate,
  onMarkRead,
  onDelete,
  onArchive,
  compact = false,
  layoutMode = "default",
}: NotificationCardProps) {
  const { t } = useTranslation("notifications");
  const dateTime = useAdminDateTimeFormatter({ workspaceId: null });
  const Icon = pickCategoryIcon(item.category);
  const timeText = useMemo(
    () => dateTime.formatDateTime(item.createdAt),
    [dateTime, item.createdAt, nowMs],
  );

  return (
    <Item
      size="sm"
      variant={isRead ? "muted" : "default"}
      className={cn(
        "w-full min-w-0 cursor-pointer rounded-md border-0 transition-[background-color,box-shadow,opacity] duration-150",
        "hover:bg-accent/40 active:bg-accent/60",
      )}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        onNavigate();
      }}
      onClick={onNavigate}
    >
      {!compact ? (
        <ItemMedia variant="icon" className="size-12 rounded-md">
          <Icon
            className={cn("size-4", isRead ? "text-label-secondary/60" : "text-label-secondary")}
            aria-hidden="true"
          />
        </ItemMedia>
      ) : null}

      <ItemContent className="min-w-0">
        <ItemHeader>
          <ItemTitle className="min-w-0 flex-1">
            <span
              className={cn(
                "min-w-0 truncate text-headline",
                isRead ? "line-through text-headline! text-label-secondary" : undefined,
              )}
            >
              {item.title}
            </span>
          </ItemTitle>
        </ItemHeader>
        {item.body ? (
          <ItemDescription
            className={cn("min-w-0", isRead ? "text-label-secondary/80!" : "text-label-secondary!")}
          >
            {item.body}
          </ItemDescription>
        ) : null}
        <div
          className={cn(
            "mt-2 flex min-w-0 items-center justify-between gap-2",
            layoutMode === "sidebar-inbox" ? "pt-0.5" : undefined,
          )}
        >
          {timeText ? (
            <span className="min-w-0 truncate text-footnote text-label-secondary">{timeText}</span>
          ) : (
            <span />
          )}
          <div className="flex shrink-0 items-center gap-1">
            {!isRead && onMarkRead ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("NOTIFICATIONS_MARK_AS_READ")}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onMarkRead();
                }}
              >
                <Check className="size-4" aria-hidden="true" />
              </Button>
            ) : null}
            {!item.archivedAt && onArchive ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("NOTIFICATIONS_ARCHIVE")}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onArchive();
                }}
              >
                <Archive className="size-4" aria-hidden="true" />
              </Button>
            ) : null}
            {onDelete ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("NOTIFICATIONS_DELETE")}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDelete();
                }}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        </div>
      </ItemContent>
    </Item>
  );
}
