"use client";

import { RotateCcw, ArrowUpRight, X } from "lucide-react";
import { motion, type Transition } from "motion/react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

export type NotificationListItem = {
  id: string | number;
  title: string;
  subtitle?: string;
  time?: string;
  count?: number;
  to?: string;
};

const transition: Transition = {
  type: "spring",
  stiffness: 300,
  damping: 26,
};

const getCardVariants = (i: number) => ({
  collapsed: {
    marginTop: i === 0 ? 0 : -44,
    scaleX: 1 - i * 0.05,
  },
  expanded: {
    marginTop: i === 0 ? 0 : 4,
    scaleX: 1,
  },
});

const textSwitchTransition: Transition = {
  duration: 0.22,
  ease: "easeInOut",
};

const notificationTextVariants = {
  collapsed: { opacity: 1, y: 0, pointerEvents: "auto" },
  expanded: { opacity: 0, y: -16, pointerEvents: "none" },
};

const viewAllTextVariants = {
  collapsed: { opacity: 0, y: 16, pointerEvents: "none" },
  expanded: { opacity: 1, y: 0, pointerEvents: "auto" },
};

function NotificationList(props: {
  items: NotificationListItem[];
  maxItems?: number;
  className?: string;
  onViewAll?: () => void;
  totalCount?: number;
  onItemClick?: (item: NotificationListItem) => void;
  onDismiss?: (id: NotificationListItem["id"]) => void;
}) {
  const { t } = useTranslation("notifications");

  const items = useMemo(() => {
    const maxItems = props.maxItems ?? props.items.length;
    return props.items.slice(0, Math.max(0, maxItems));
  }, [props.items, props.maxItems]);

  if (!items.length) return null;

  const totalCount = props.totalCount ?? props.items.length;

  return (
    <motion.div
      className={[
        "rounded-xl w-full space-y-3 shadow-sm",
        "text-sidebar-foreground backdrop-blur-sm",
        props.className ?? "",
      ].join(" ")}
      initial="collapsed"
      whileHover="expanded"
    >
      <div>
        {items.map((notification, i) => (
          <motion.div
            key={notification.id}
            className={[
              "rounded-lg px-4 py-2 relative",
              "border border-sidebar-border/60 bg-background",
              "shadow-sm hover:shadow-md transition-shadow duration-200",
              "hover:bg-primary/70",
              "hover:cursor-pointer",
            ].join(" ")}
            variants={getCardVariants(i)}
            transition={transition}
            style={{
              zIndex: items.length - i,
            }}
            onClick={() => props.onItemClick?.(notification)}
          >
            <div className="flex items-center gap-2">
              <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{notification.title}</h1>
              {notification.count && (
                <div className="flex shrink-0 items-center text-xs gap-0.5 font-medium text-sidebar-foreground/70">
                  <RotateCcw className="size-3" />
                  <span>{notification.count}</span>
                </div>
              )}
              {props.onDismiss ? (
                <button
                  type="button"
                  aria-label={t("NOTIFICATIONS_MARK_AS_READ")}
                  className="ml-1 inline-flex size-6 items-center justify-center rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/20"
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onDismiss?.(notification.id);
                  }}
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            {notification.time || notification.subtitle ? (
              <div className="mt-0.5 flex min-w-0 items-start gap-1 text-xs font-medium text-sidebar-foreground/60">
                {notification.time ? (
                  <span className="shrink-0">
                    {notification.time}
                    {notification.subtitle ? <span aria-hidden="true">&nbsp;•</span> : null}
                  </span>
                ) : null}
                {notification.subtitle ? (
                  <span className="min-w-0 block line-clamp-2">{notification.subtitle}</span>
                ) : null}
              </div>
            ) : null}
          </motion.div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <div className="size-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
          {totalCount}
        </div>
        <span className="grid">
          <motion.span
            className="text-sm font-medium text-sidebar-foreground/70 row-start-1 col-start-1"
            variants={notificationTextVariants}
            transition={textSwitchTransition}
          >
            {t("NOTIFICATIONS_TITLE")}
          </motion.span>
          {props.onViewAll ? (
            <motion.button
              type="button"
              className="text-sm font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground flex items-center gap-1 cursor-pointer select-none row-start-1 col-start-1"
              variants={viewAllTextVariants}
              transition={textSwitchTransition}
              onClick={props.onViewAll}
            >
              {t("NOTIFICATIONS_VIEW_ALL")} <ArrowUpRight className="size-4" />
            </motion.button>
          ) : null}
        </span>
      </div>
    </motion.div>
  );
}

export { NotificationList };
