import { AnimatePresence, motion } from "motion/react";
import { Button as ButtonPrimitive } from "@celestial/ui/button-primitive";
import type { CSSProperties } from "react";

import { AdminNotificationsPanel } from "@/components/layout/admin-notifications-panel";
import { useSidebar } from "@celestial/ui/sidebar";

const NOTIFICATIONS_SHELL_TRANSITION_CLASSNAME =
  "transition-[left] duration-400 ease-[cubic-bezier(0.75,0,0.25,1)]";

export type AdminNotificationsShellProps = {
  open: boolean;
  pinned: boolean;
  sidebarExpandedWidthPx: number;
  sidebarCollapsedWidthPx: number;
  onPinnedChange: (nextPinned: boolean) => void;
  onClose: () => void;
  closeAriaLabel: string;
};

function resolveSidebarOffsetPx(args: {
  isMobile: boolean;
  sidebarState: "expanded" | "collapsed";
  expandedWidthPx: number;
  collapsedWidthPx: number;
}): number {
  if (args.isMobile) return 0;
  return args.sidebarState === "collapsed" ? args.collapsedWidthPx : args.expandedWidthPx;
}

export function AdminNotificationsShell(props: AdminNotificationsShellProps) {
  const { state, isMobile } = useSidebar();
  const sidebarOffsetPx = resolveSidebarOffsetPx({
    isMobile,
    sidebarState: state,
    expandedWidthPx: props.sidebarExpandedWidthPx,
    collapsedWidthPx: props.sidebarCollapsedWidthPx,
  });

  if (props.open && props.pinned) {
    return (
      <AdminNotificationsPanel
        className="h-screen shrink-0 border-r"
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
              initial={{ backdropFilter: "blur(0px)" }}
              animate={{ backdropFilter: "blur(4px)" }}
              exit={{ backdropFilter: "blur(0px)" }}
              className={[
                "fixed inset-y-0 right-0 z-10 pointer-events-none",
                NOTIFICATIONS_SHELL_TRANSITION_CLASSNAME,
              ].join(" ")}
              style={{ left: sidebarOffsetPx } as CSSProperties}
            />,
            <ButtonPrimitive
              key="admin-notifications-backdrop"
              type="button"
              aria-label={props.closeAriaLabel}
              tapScale={1}
              className={[
                "fixed inset-y-0 right-0 z-20 bg-transparent",
                NOTIFICATIONS_SHELL_TRANSITION_CLASSNAME,
              ].join(" ")}
              style={{ left: sidebarOffsetPx } as CSSProperties}
              onClick={props.onClose}
            />,
            <AdminNotificationsPanel
              key="admin-notifications-panel"
              className={[
                "fixed top-0 h-screen z-30",
                NOTIFICATIONS_SHELL_TRANSITION_CLASSNAME,
              ].join(" ")}
              style={{ left: sidebarOffsetPx } as CSSProperties}
              isPinned={false}
              onPinChange={props.onPinnedChange}
              onClose={props.onClose}
            />,
          ]
        : null}
    </AnimatePresence>
  );
}
