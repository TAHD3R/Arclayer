import type { AdminNavItem } from "@/types/admin-nav";
import { AdminTopbar } from "@/components/layout/admin-topbar";

const GLOBAL_COMMAND_SCOPE = {
  kind: "none",
  pathname: "/",
  workspaceId: null,
  organizationId: null,
} as const;

type GlobalTopbarProps = {
  navItems: readonly AdminNavItem[];
  notificationOpen: boolean;
  showNotificationsBadge: boolean;
  unreadCount: number;
  onNotificationToggle: () => void;
  className?: string;
};

export function GlobalTopbar(props: GlobalTopbarProps) {
  return (
    <AdminTopbar
      navItems={props.navItems}
      commandScope={GLOBAL_COMMAND_SCOPE}
      notificationOpen={props.notificationOpen}
      showNotificationsBadge={props.showNotificationsBadge}
      unreadCount={props.unreadCount}
      onNotificationToggle={props.onNotificationToggle}
      leadingMode="logo"
      sidebarToggleMode="mobile-only"
      className={props.className}
    />
  );
}
