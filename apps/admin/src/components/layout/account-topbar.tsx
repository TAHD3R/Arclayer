import { Bell, Menu } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AdminAccountMenu } from "@/components/layout/admin-account-menu";
import { AdminFullLogo } from "@/components/layout/admin-logo";
import { cn } from "@arclayer/lib/utils";
import { Button as ButtonPrimitive } from "@arclayer/ui/button-primitive";
import { useSidebar } from "@arclayer/ui/sidebar";

const TOPBAR_ICON_BUTTON_CLASSNAME = cn(
  "relative inline-flex size-11 items-center justify-center rounded-xl border border-transparent",
  "bg-transparent text-label-secondary transition-[background-color,color,border-color] duration-200",
  "hover:bg-background/60 hover:text-foreground",
  "data-[state=open]:border-border/60 data-[state=open]:bg-background/70 data-[state=open]:text-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

export function AccountTopbar(props: {
  notificationOpen: boolean;
  showNotificationsBadge: boolean;
  unreadCount: number;
  onNotificationToggle: () => void;
  className?: string;
}) {
  const { t } = useTranslation(["account", "notifications", "common"]);
  const { toggleSidebar } = useSidebar();

  return (
    <header
      className={cn(
        "relative z-30 border-b border-sidebar-border inset-y-auto",
        "bg-header supports-backdrop-filter:bg-header/95 backdrop-blur-xl",
        props.className,
      )}
    >
      <div className="flex h-(--admin-topbar-height) items-center justify-between gap-4 px-4">
        <div className="min-w-0 flex items-center gap-3">
          <ButtonPrimitive
            type="button"
            tapScale={1}
            aria-label={t("common:SIDEBAR_TOGGLE")}
            onClick={toggleSidebar}
            className={cn(TOPBAR_ICON_BUTTON_CLASSNAME, "md:hidden")}
          >
            <Menu className="size-5" aria-hidden="true" />
          </ButtonPrimitive>

          <div className="min-w-0 flex h-8 items-center">
            <AdminFullLogo ariaLabel="Arclayer" width={100} className="flex h-8 items-center" />
          </div>

          <div className="min-w-0">
            <div className="text-callout font-semibold text-foreground">
              {t("account:ACCOUNT_SETTINGS_TITLE")}
            </div>
            <div className="text-caption text-label-secondary">
              {t("account:ACCOUNT_SETTINGS_DESC")}
            </div>
          </div>
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
