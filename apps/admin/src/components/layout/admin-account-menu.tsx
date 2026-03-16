import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import * as authApi from "@/api/auth";
import { UserAvatar } from "@/components/common/entity-avatar";
import { NAV_ITEM_COLLAPSE_HIDE_CLASSNAME } from "@/components/layout/admin-side-nav/nav-node-styles";
import { AdminAccountPanelContent } from "@/components/layout/admin-account-menu-panel";
import { setThemePreferenceWithTransition } from "@/components/ui/theme-transition";
import { getUserDisplayName, normalizeUserProfile } from "@/lib/auth/user-profile";
import type { AppLocale } from "@/lib/i18n";
import { notifyError } from "@/lib/notifications";
import { queryClient } from "@/lib/query/query-client-instance";
import { useAuthStore } from "@/stores/use-auth-store";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import type { ThemePreference } from "@/types/stores";
import { cn } from "@arclayer/lib/utils";
import { ChevronDown } from "@arclayer/ui/icons/lucide-animated";
import {
  FloatingPanelContent,
  FloatingPanelRoot,
  FloatingPanelTrigger,
  useFloatingPanel,
} from "@arclayer/ui/floating-panel";
import { useSidebar } from "@arclayer/ui/sidebar";

const SHORTCUTS_HELP_HASH = "#shortcuts";
const HEADER_TRIGGER_CLASSNAME = cn(
  "group/panel-trigger flex h-11 items-center gap-1.5 rounded-xl border border-transparent bg-transparent pl-0.5 pr-1.5",
  "text-label-secondary transition-[background-color,color,border-color] duration-200",
  "hover:bg-accent/70 hover:text-foreground",
  "data-[state=open]:border-border/70 data-[state=open]:bg-accent data-[state=open]:text-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);
const SIDEBAR_TRIGGER_CLASSNAME = cn(
  "group/panel-trigger",
  "flex w-full items-center",
  "h-16 py-0",
  "justify-start gap-3 px-5",
  "group-data-[collapsible=icon]:px-2",
  "group-data-[collapsible=icon]:gap-0",
  "border-0 bg-transparent",
  "rounded-none",
  "text-label-secondary",
  "hover:bg-accent hover:text-sidebar-accent-foreground",
  "data-[state=open]:bg-accent data-[state=open]:text-sidebar-accent-foreground",
  "transition-[color,background-color,padding,gap] duration-400 ease-[cubic-bezier(0.75,0,0.25,1)]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
);

type AdminAccountMenuModel = {
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  themePreference: ThemePreference;
  locale: AppLocale;
  onLogout: () => Promise<void>;
  onAccountSettings: () => void;
  onThemePreferenceChange: (next: ThemePreference) => Promise<void>;
  onLocaleChange: (next: AppLocale) => void;
  onShortcuts: () => void;
};

function useAdminAccountMenuModel(): AdminAccountMenuModel {
  const navigate = useNavigate();
  const accessToken = useAuthStore((s) => s.accessToken);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const clear = useAuthStore((s) => s.clear);
  const clearWorkspace = useWorkspaceStore((s) => s.clearWorkspace);
  const themePreference = usePreferencesStore((s) => s.themePreference);
  const locale = usePreferencesStore((s) => s.locale);
  const setLocale = usePreferencesStore((s) => s.setLocale);

  const meQuery = useQuery({
    queryKey: ["auth", "me", sessionVersion],
    enabled: Boolean(accessToken),
    queryFn: async () => authApi.me(),
    meta: { silent: true },
  });
  const profile = useMemo(() => normalizeUserProfile(meQuery.data), [meQuery.data]);
  const displayName = useMemo(() => {
    return (
      profile.displayName ??
      profile.username ??
      profile.email ??
      getUserDisplayName(accessToken, "用户")
    );
  }, [accessToken, profile.displayName, profile.email, profile.username]);

  const onLogout = async () => {
    try {
      await authApi.logout({ refreshToken });
      void queryClient.cancelQueries();
      queryClient.clear();
      clearWorkspace();
      clear();
      await navigate({ to: "/login", replace: true });
    } catch (error) {
      notifyError(error);
    }
  };

  return {
    displayName,
    email: profile.email,
    avatarUrl: profile.avatarUrl ?? profile.avatarAssetId,
    themePreference,
    locale,
    onLogout,
    onAccountSettings: () => void navigate({ to: "/account/profile" }),
    onThemePreferenceChange: async (next) => {
      await setThemePreferenceWithTransition(next, { direction: "ltr" });
    },
    onLocaleChange: (next) => setLocale(next),
    onShortcuts: () => window.location.assign(SHORTCUTS_HELP_HASH),
  };
}

function HeaderAccountMenuTrigger(props: { displayName: string; avatarUrl: string | null }) {
  return (
    <FloatingPanelTrigger
      title={props.displayName}
      disableLayoutId
      className={HEADER_TRIGGER_CLASSNAME}
    >
      <UserAvatar
        name={props.displayName}
        assetRef={props.avatarUrl}
        size={36}
        className="shrink-0"
      />
    </FloatingPanelTrigger>
  );
}

function SidebarAccountMenuTrigger(props: {
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  isCollapsed: boolean;
}) {
  const { t } = useTranslation("account");
  const { isOpen } = useFloatingPanel();
  const [isHovered, setIsHovered] = useState(false);
  const title = props.isCollapsed ? props.displayName : t("ACCOUNT_TITLE");
  const nameClassName = cn(
    "text-sidebar-foreground",
    "group-hover:text-sidebar-accent-foreground",
    "group-data-[state=open]:text-sidebar-accent-foreground",
  );

  return (
    <FloatingPanelTrigger
      title={title}
      disableLayoutId
      className={SIDEBAR_TRIGGER_CLASSNAME}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <UserAvatar
        name={props.displayName}
        assetRef={props.avatarUrl}
        size={40}
        className="shrink-0"
      />

      <div className={cn("min-w-0 flex-1 text-left", NAV_ITEM_COLLAPSE_HIDE_CLASSNAME)}>
        <div className={cn("truncate text-footnote font-semibold", nameClassName)}>
          {props.displayName}
        </div>
        {props.email ? (
          <div className="truncate text-caption text-label-secondary">{props.email}</div>
        ) : null}
      </div>

      <ChevronDown
        className={cn(
          "ml-auto size-4 shrink-0 opacity-70",
          "group-data-[collapsible=icon]:ml-0",
          NAV_ITEM_COLLAPSE_HIDE_CLASSNAME,
        )}
        expanded={isOpen}
        isHovered={isHovered}
      />
    </FloatingPanelTrigger>
  );
}

export function AdminAccountMenu(props: { variant?: "sidebar" | "header" } = {}) {
  const model = useAdminAccountMenuModel();
  const { state: sidebarState, isMobile } = useSidebar();
  const isCollapsed = sidebarState === "collapsed" && !isMobile;
  const isHeaderVariant = props.variant === "header";

  if (isHeaderVariant) {
    return (
      <FloatingPanelRoot>
        <HeaderAccountMenuTrigger displayName={model.displayName} avatarUrl={model.avatarUrl} />

        <FloatingPanelContent placement="bottom" showTitle={false} className="p-0">
          <AdminAccountPanelContent
            displayName={model.displayName}
            email={model.email}
            avatarUrl={model.avatarUrl}
            themePreference={model.themePreference}
            locale={model.locale}
            onLogout={model.onLogout}
            onAccountSettings={model.onAccountSettings}
            onThemePreferenceChange={model.onThemePreferenceChange}
            onLocaleChange={model.onLocaleChange}
            onShortcuts={model.onShortcuts}
          />
        </FloatingPanelContent>
      </FloatingPanelRoot>
    );
  }

  return (
    <FloatingPanelRoot className="w-full">
      <SidebarAccountMenuTrigger
        displayName={model.displayName}
        email={model.email}
        avatarUrl={model.avatarUrl}
        isCollapsed={isCollapsed}
      />

      <FloatingPanelContent placement="bottom" showTitle={false} className="p-0">
        <AdminAccountPanelContent
          displayName={model.displayName}
          email={model.email}
          avatarUrl={model.avatarUrl}
          themePreference={model.themePreference}
          locale={model.locale}
          onLogout={model.onLogout}
          onAccountSettings={model.onAccountSettings}
          onThemePreferenceChange={model.onThemePreferenceChange}
          onLocaleChange={model.onLocaleChange}
          onShortcuts={model.onShortcuts}
        />
      </FloatingPanelContent>
    </FloatingPanelRoot>
  );
}
