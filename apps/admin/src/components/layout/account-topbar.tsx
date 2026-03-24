import { useTranslation } from "react-i18next";

import { AdminTopbar } from "@/components/layout/admin-topbar";
import type { CommandScope } from "@/lib/command/command-types";
import type { AdminNavItem } from "@/types/admin-nav";

const ACCOUNT_COMMAND_SCOPE = {
  kind: "none",
  pathname: "/account",
  workspaceId: null,
  organizationId: null,
} as const;

export function AccountTopbar(props: {
  mode?: "account" | "me";
  navItems?: readonly AdminNavItem[];
  commandScope?: CommandScope;
  showCommandTrigger?: boolean;
  backLabel?: string;
  onBack?: () => void;
  notificationOpen: boolean;
  showNotificationsBadge: boolean;
  unreadCount: number;
  onNotificationToggle: () => void;
  className?: string;
}) {
  const { t } = useTranslation(["notifications", "common"]);
  const mode = props.mode ?? "account";

  return (
    <AdminTopbar
      navItems={props.navItems ?? []}
      commandScope={props.commandScope ?? ACCOUNT_COMMAND_SCOPE}
      notificationOpen={props.notificationOpen}
      showNotificationsBadge={props.showNotificationsBadge}
      unreadCount={props.unreadCount}
      onNotificationToggle={props.onNotificationToggle}
      showCommandTrigger={props.showCommandTrigger ?? false}
      leadingMode={mode === "account" ? "back" : "logo"}
      sidebarToggleMode="mobile-only"
      backLabel={props.backLabel ?? t("common:BACK")}
      onBack={props.onBack ?? (() => undefined)}
      className={props.className}
    />
  );
}
