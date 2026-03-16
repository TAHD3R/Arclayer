import { Bell, Menu } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { AdminNavItem } from "@/types/admin-nav";
import { AdminAccountMenu } from "@/components/layout/admin-account-menu";
import { AdminCommandTrigger } from "@/components/layout/admin-command-trigger";
import { AdminFullLogo } from "@/components/layout/admin-logo";
import { AdminWorkspaceSwitcher } from "@/components/layout/admin-workspace-switcher";
import { useAdminCommandPalette } from "@/hooks/use-admin-command-palette";
import { cn } from "@celestial/lib/utils";
import { Button as ButtonPrimitive } from "@celestial/ui/button-primitive";
import { useSidebar } from "@celestial/ui/sidebar";
import type { CommandScope } from "@/lib/command/command-types";

const TOPBAR_ICON_BUTTON_CLASSNAME = cn(
  "relative inline-flex size-11 items-center justify-center rounded-xl border border-transparent",
  "bg-transparent text-label-secondary transition-[background-color,color,border-color] duration-200",
  "hover:bg-background/60 hover:text-foreground",
  "data-[state=open]:border-border/60 data-[state=open]:bg-background/70 data-[state=open]:text-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

export function AdminTopbar(props: {
  navItems: readonly AdminNavItem[];
  commandScope: CommandScope;
  notificationOpen: boolean;
  showNotificationsBadge: boolean;
  unreadCount: number;
  onNotificationToggle: () => void;
  className?: string;
}) {
  const { toggleSidebar } = useSidebar();
  const { t } = useTranslation(["common", "notifications"]);
  const commandPalette = useAdminCommandPalette({
    navItems: props.navItems,
    scope: props.commandScope,
  });

  return (
    <header
      className={cn(
        "relative z-30 border-b border-sidebar-border inset-y-auto",
        "bg-header supports-backdrop-filter:bg-header/95 backdrop-blur-xl",
        props.className,
      )}
    >
      <div
        className={cn(
          "grid h-(--admin-topbar-height) items-center pl-2 pr-4 gap-3",
          "grid-cols-[minmax(0,1fr)_minmax(11rem,24rem)_minmax(0,1fr)]",
          "lg:grid-cols-[minmax(0,1fr)_minmax(14rem,28rem)_minmax(0,1fr)]",
        )}
      >
        <div className="min-w-0 flex items-center gap-2.5">
          <ButtonPrimitive
            type="button"
            tapScale={1}
            aria-label={t("common:SIDEBAR_TOGGLE")}
            onClick={toggleSidebar}
            className={TOPBAR_ICON_BUTTON_CLASSNAME}
          >
            <Menu className="size-5" aria-hidden="true" />
          </ButtonPrimitive>

          <div className="min-w-0 flex h-8 items-center">
            <AdminFullLogo ariaLabel="CelestialCMS" width={100} className="flex h-8 items-center" />
          </div>

          <div className="min-w-0 flex-1 max-w-[14rem] xl:max-w-[18rem] 2xl:max-w-[20rem]">
            <AdminWorkspaceSwitcher
              variant="header"
              showSidebarToggle={false}
              className="min-w-0"
            />
          </div>
        </div>

        <div className="min-w-0 justify-self-center w-full max-w-[32rem]">
          <AdminCommandTrigger
            sections={commandPalette.sections}
            query={commandPalette.query}
            onQueryChange={commandPalette.setQuery}
            emptyText={commandPalette.emptyText}
            onSelectEntry={commandPalette.onSelectEntry}
          />
        </div>

        <div className="min-w-0 flex items-center justify-end gap-2">
          <ButtonPrimitive
            type="button"
            tapScale={1}
            aria-label={t("notifications:NOTIFICATIONS_OPEN_CENTER")}
            data-state={props.notificationOpen ? "open" : "closed"}
            onClick={props.onNotificationToggle}
            className={TOPBAR_ICON_BUTTON_CLASSNAME}
          >
            <Bell className="size-4" aria-hidden="true" />
            {props.showNotificationsBadge && props.unreadCount > 0 ? (
              <span className="absolute right-1.5 top-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-caption font-semibold leading-none text-primary-foreground">
                {props.unreadCount > 99 ? "99+" : props.unreadCount}
              </span>
            ) : null}
          </ButtonPrimitive>

          <AdminAccountMenu variant="header" />
        </div>
      </div>
    </header>
  );
}
