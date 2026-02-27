import { AnimatePresence, motion } from "motion/react";

import type { NotificationItem } from "@/types/api";
import { NotificationCard } from "@/components/common/notification-card";
import { ItemSeparator } from "@/components/ui/item";

type NotificationListProps = {
  items: NotificationItem[];
  nowMs: number;
  locale: string;
  isRead: boolean;
  onNavigate: (n: NotificationItem) => void;
  onMarkRead?: (n: NotificationItem) => void;
  onDelete: (n: NotificationItem) => void;
};

export function NotificationList({
  items,
  nowMs,
  locale,
  isRead,
  onNavigate,
  onMarkRead,
  onDelete,
}: NotificationListProps) {
  return (
    <AnimatePresence initial={false}>
      {items.map((n, idx) => {
        const showSep = idx < items.length - 1;
        return (
          <motion.div
            key={n.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8, height: 0, marginTop: 0, marginBottom: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
          >
            <motion.div whileTap={{ scale: 0.99 }}>
              <NotificationCard
                item={n}
                nowMs={nowMs}
                locale={locale}
                isRead={isRead}
                onNavigate={() => onNavigate(n)}
                onMarkRead={!isRead && onMarkRead ? () => onMarkRead(n) : undefined}
                onDelete={() => onDelete(n)}
              />
            </motion.div>
            {showSep ? <ItemSeparator /> : null}
          </motion.div>
        );
      })}
    </AnimatePresence>
  );
}
