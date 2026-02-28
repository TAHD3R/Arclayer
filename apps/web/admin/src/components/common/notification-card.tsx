import { Archive, Check, ShieldCheck, Trash2, Users, Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { NotificationCategory, NotificationItem } from "@/types/api";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemHeader,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { formatRelativeTimeAt } from "@/lib/time/relative-time";
import { cn } from "@/lib/utils";

interface NotificationCardProps {
  item: NotificationItem;
  nowMs: number;
  locale: string;
  isRead: boolean;
  onNavigate: () => void;
  onMarkRead?: () => void;
  onDelete?: () => void;
  onArchive?: () => void;
  /** Compact mode for popup panel — hides category icon column */
  compact?: boolean;
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
  locale,
  isRead,
  onNavigate,
  onMarkRead,
  onDelete,
  onArchive,
  compact = false,
}: NotificationCardProps) {
  const { t } = useTranslation("notifications");
  const Icon = pickCategoryIcon(item.category);
  const timeText = formatRelativeTimeAt(item.createdAt, locale, nowMs);

  return (
    <Item
      size="sm"
      variant={isRead ? "muted" : "default"}
      className={cn(
        "cursor-pointer rounded-md border-0 transition-[background-color,box-shadow,opacity] duration-150",
        "hover:bg-accent/40 hover:shadow-sm active:bg-accent/60",
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

      <ItemContent>
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
            className={cn(
              "text-label-secondary! text-callout!",
              isRead ? "text-label-secondary/80!" : undefined,
            )}
          >
            {item.body}
          </ItemDescription>
        ) : null}
      </ItemContent>

      <div className="ml-auto flex flex-col items-end gap-2">
        {timeText ? (
          <span className="shrink-0 text-footnote text-label-secondary">{timeText}</span>
        ) : null}
        <div className="flex items-center gap-1">
          {!isRead && onMarkRead ? (
            <Button
              type="button"
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
              type="button"
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
              type="button"
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
    </Item>
  );
}
