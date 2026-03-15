import { AnimatePresence, motion } from "motion/react";

import { AdminNotificationsPanel } from "@/components/layout/admin-notifications-panel";
import { Button as ButtonPrimitive } from "@celestial/ui/button-primitive";

const PANEL_WIDTH_CLASSNAME = "w-fit max-w-full";

export type AdminNotificationsShellProps = {
  open: boolean;
  pinned: boolean;
  onPinnedChange: (nextPinned: boolean) => void;
  onClose: () => void;
  closeAriaLabel: string;
};

export function AdminNotificationsShell(props: AdminNotificationsShellProps) {
  if (props.open && props.pinned) {
    return (
      <AdminNotificationsPanel
        className={`${PANEL_WIDTH_CLASSNAME} h-full shrink-0 border-l border-r-0 border-border/70`}
        isPinned={true}
        onPinChange={props.onPinnedChange}
        onClose={props.onClose}
      />
    );
  }

  if (props.pinned) return null;

  return (
    <AnimatePresence initial={false}>
      {props.open
        ? [
            <motion.div
              key="admin-notifications-blur-mask"
              initial={{ backdropFilter: "blur(0px)", opacity: 0 }}
              animate={{ backdropFilter: "blur(4px)", opacity: 1 }}
              exit={{ backdropFilter: "blur(0px)", opacity: 0 }}
              className="absolute inset-0 z-10 pointer-events-none"
            />,
            <ButtonPrimitive
              key="admin-notifications-backdrop"
              type="button"
              aria-label={props.closeAriaLabel}
              tapScale={1}
              className="absolute inset-0 z-20 bg-transparent"
              onClick={props.onClose}
            />,
            <AdminNotificationsPanel
              key="admin-notifications-panel"
              className={`${PANEL_WIDTH_CLASSNAME} absolute inset-y-0 right-0 z-30 border-l border-r-0 border-border/70`}
              isPinned={false}
              onPinChange={props.onPinnedChange}
              onClose={props.onClose}
            />,
          ]
        : null}
    </AnimatePresence>
  );
}
