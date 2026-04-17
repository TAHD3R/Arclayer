import { ArrowLeft, Bell, ChevronLeft, CircleHelp, Menu } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRouterState } from "@tanstack/react-router";

import { matchesGlobalNavScene } from "@/constants/menu/global";
import type { AdminNavItem } from "@/types/admin-nav";
import { AdminAccountMenu } from "@/components/layout/admin-account-menu";
import { AdminCommandTrigger } from "@/components/layout/admin-command-trigger";
import { AdminFullLogo } from "@/components/layout/admin-logo";
import {
  AdminWorkspaceSwitcher,
  headerTriggerButtonClassName,
} from "@/components/layout/admin-workspace-switcher";
import { useAdminCommandPalette } from "@/hooks/use-admin-command-palette";
import { cn } from "@arclayer/lib/utils";
import { Button as ButtonPrimitive } from "@arclayer/ui/button-primitive";
import { useSidebar } from "@arclayer/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@arclayer/ui/tooltip";
import type { CommandScope } from "@/lib/command/command-types";

const TOPBAR_ICON_BUTTON_CLASSNAME = cn(
  "relative inline-flex size-10 items-center justify-center rounded-md border border-transparent",
  "bg-transparent text-label-secondary transition-[background-color,color,border-color] duration-200",
  "hover:bg-accent hover:text-label-primary",
  "data-[state=open]:border-border/60 data-[state=open]:bg-accent/70 data-[state=open]:text-label-primary",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);
const TOPBAR_CONTENT_PADDING_CLASSNAME = "pl-2 pr-4";
const DESKTOP_SCENE_NAV_ALIGNMENT_CLASSNAME = "md:pl-3";

type AdminTopbarLeadingMode = "workspace-switcher" | "logo" | "back";
type SidebarToggleMode = "always" | "mobile-only" | "hidden";

function SidebarToggleButton(props: {
  mode: SidebarToggleMode;
  label: string;
  onToggle: () => void;
}) {
  if (props.mode === "hidden") return null;

  return (
    <ButtonPrimitive
      type="button"
      tapScale={1}
      aria-label={props.label}
      onClick={props.onToggle}
      className={cn(
        TOPBAR_ICON_BUTTON_CLASSNAME,
        props.mode === "mobile-only" ? "md:hidden" : null,
      )}
    >
      <Menu className="size-5" aria-hidden="true" />
    </ButtonPrimitive>
  );
}

function TopbarLeading(props: {
  leadingMode: AdminTopbarLeadingMode;
  sidebarToggleMode: SidebarToggleMode;
  sidebarToggleLabel: string;
  homeLabel?: string;
  onToggleSidebar: () => void;
  backLabel?: string;
  onBack?: () => void;
}) {
  return (
    <div
      className={cn(
        "min-w-0 flex items-center gap-2.5",
        props.sidebarToggleMode === "mobile-only" ? DESKTOP_SCENE_NAV_ALIGNMENT_CLASSNAME : null,
      )}
    >
      <SidebarToggleButton
        mode={props.sidebarToggleMode}
        label={props.sidebarToggleLabel}
        onToggle={props.onToggleSidebar}
      />

      <div className="min-w-0 flex h-8 items-center">
        <AdminFullLogo
          ariaLabel="Arclayer"
          width={100}
          className="flex h-8 items-center"
          hoverLabel={props.homeLabel}
          hoverIcon={<ChevronLeft className="size-4 shrink-0" aria-hidden="true" />}
        />
      </div>

      {props.leadingMode === "workspace-switcher" ? (
        <div className="min-w-0 max-w-[14rem] xl:max-w-[18rem] 2xl:max-w-[20rem] flex">
          <AdminWorkspaceSwitcher
            variant="header"
            showSidebarToggle={false}
            className="min-w-0 justify-center items-center"
          />
        </div>
      ) : null}

      {props.leadingMode === "back" ? (
        <ButtonPrimitive
          type="button"
          tapScale={1}
          aria-label={props.backLabel}
          onClick={props.onBack}
          className={cn(
            headerTriggerButtonClassName,
            "text-callout font-semibold text-label-primary",
            "active:border-border/60 active:bg-accent/70 active:text-label-primary",
          )}
        >
          <ArrowLeft className="size-4 shrink-0 opacity-80" aria-hidden="true" />
          <span className="truncate">{props.backLabel}</span>
        </ButtonPrimitive>
      ) : null}
    </div>
  );
}

function TopbarTrailing(props: {
  notificationOpen: boolean;
  showNotificationsBadge: boolean;
  unreadCount: number;
  notificationLabel: string;
  helpCenterLabel: string;
  onNotificationToggle: () => void;
}) {
  return (
    <div className="min-w-0 flex items-center justify-end gap-2">
      <Tooltip>
        <TooltipTrigger asChild focusTrigger={false}>
          <ButtonPrimitive
            type="button"
            tapScale={1}
            aria-label={props.notificationLabel}
            data-state={props.notificationOpen ? "open" : "closed"}
            onClick={props.onNotificationToggle}
            className={TOPBAR_ICON_BUTTON_CLASSNAME}
          >
            <Bell className="size-4" aria-hidden="true" />
            {props.showNotificationsBadge && props.unreadCount > 0 ? (
              <span className="absolute right-1.5 top-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-caption font-semibold  text-primary-foreground">
                {props.unreadCount > 99 ? "99+" : props.unreadCount}
              </span>
            ) : null}
          </ButtonPrimitive>
        </TooltipTrigger>
        <TooltipContent>{props.notificationLabel}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild focusTrigger={false}>
          <ButtonPrimitive
            type="button"
            tapScale={1}
            aria-label={props.helpCenterLabel}
            className={TOPBAR_ICON_BUTTON_CLASSNAME}
          >
            <CircleHelp className="size-4" aria-hidden="true" />
          </ButtonPrimitive>
        </TooltipTrigger>
        <TooltipContent>{props.helpCenterLabel}</TooltipContent>
      </Tooltip>

      <AdminAccountMenu variant="header" />
    </div>
  );
}

export function AdminTopbar(props: {
  navItems: readonly AdminNavItem[];
  commandScope: CommandScope;
  notificationOpen: boolean;
  showNotificationsBadge: boolean;
  unreadCount: number;
  onNotificationToggle: () => void;
  showCommandTrigger?: boolean;
  leadingMode?: AdminTopbarLeadingMode;
  sidebarToggleMode?: SidebarToggleMode;
  backLabel?: string;
  onBack?: () => void;
  className?: string;
}) {
  const { toggleSidebar } = useSidebar();
  const { t } = useTranslation(["common", "notifications", "account"]);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const commandPalette = useAdminCommandPalette({
    navItems: props.navItems,
    scope: props.commandScope,
  });
  const showCommandTrigger = props.showCommandTrigger ?? true;
  const leadingMode = props.leadingMode ?? "workspace-switcher";
  const sidebarToggleMode = props.sidebarToggleMode ?? "always";
  const showHomeHoverLabel = !matchesGlobalNavScene(pathname);

  return (
    <header
      className={cn(
        "relative z-30 border-b border-border inset-y-auto",
        "bg-header",
        props.className,
      )}
    >
      {showCommandTrigger ? (
        <div
          className={cn(
            "grid h-(--admin-topbar-height) items-center gap-3",
            TOPBAR_CONTENT_PADDING_CLASSNAME,
            "grid-cols-[minmax(0,1fr)_minmax(11rem,24rem)_minmax(0,1fr)]",
            "lg:grid-cols-[minmax(0,1fr)_minmax(14rem,28rem)_minmax(0,1fr)]",
          )}
        >
          <TopbarLeading
            leadingMode={leadingMode}
            sidebarToggleMode={sidebarToggleMode}
            sidebarToggleLabel={t("common:SIDEBAR_TOGGLE")}
            homeLabel={showHomeHoverLabel ? t("common:GO_HOME") : undefined}
            onToggleSidebar={toggleSidebar}
            backLabel={props.backLabel}
            onBack={props.onBack}
          />

          <div className="min-w-0 justify-self-center w-full max-w-[32rem]">
            <AdminCommandTrigger
              sections={commandPalette.sections}
              query={commandPalette.query}
              onQueryChange={commandPalette.setQuery}
              emptyText={commandPalette.emptyText}
              onSelectEntry={commandPalette.onSelectEntry}
            />
          </div>

          <TopbarTrailing
            notificationOpen={props.notificationOpen}
            showNotificationsBadge={props.showNotificationsBadge}
            unreadCount={props.unreadCount}
            notificationLabel={t("notifications:NOTIFICATIONS_OPEN_CENTER")}
            helpCenterLabel={t("account:ACCOUNT_HELP_CENTER")}
            onNotificationToggle={props.onNotificationToggle}
          />
        </div>
      ) : (
        <div
          className={cn(
            "flex h-(--admin-topbar-height) items-center justify-between gap-4",
            TOPBAR_CONTENT_PADDING_CLASSNAME,
          )}
        >
          <TopbarLeading
            leadingMode={leadingMode}
            sidebarToggleMode={sidebarToggleMode}
            sidebarToggleLabel={t("common:SIDEBAR_TOGGLE")}
            homeLabel={showHomeHoverLabel ? t("common:GO_HOME") : undefined}
            onToggleSidebar={toggleSidebar}
            backLabel={props.backLabel}
            onBack={props.onBack}
          />
          <TopbarTrailing
            notificationOpen={props.notificationOpen}
            showNotificationsBadge={props.showNotificationsBadge}
            unreadCount={props.unreadCount}
            notificationLabel={t("notifications:NOTIFICATIONS_OPEN_CENTER")}
            helpCenterLabel={t("account:ACCOUNT_HELP_CENTER")}
            onNotificationToggle={props.onNotificationToggle}
          />
        </div>
      )}
    </header>
  );
}
