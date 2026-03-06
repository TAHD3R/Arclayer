import { useMemo } from "react";

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  Check,
  ChevronDown,
  Keyboard,
  Languages,
  LogOut,
  Monitor,
  Moon,
  Sun,
  UserCog,
} from "lucide-react";
import { type ReactNode } from "react";

import * as authApi from "@/api/auth";
import {
  FloatingPanelButton,
  FloatingPanelContent,
  FloatingPanelRoot,
  FloatingPanelTrigger,
  useFloatingPanel,
} from "@celestial/ui/floating-panel";
import { cn } from "@celestial/lib/utils";
import { UserAvatar } from "@/components/common/entity-avatar";
import { getUserDisplayName, normalizeUserProfile } from "@/lib/auth/user-profile";
import type { AppLocale } from "@/lib/i18n";
import { queryClient } from "@/lib/query/query-client-instance";
import { setThemePreferenceWithTransition } from "@/components/ui/theme-transition";
import { useAuthStore } from "@/stores/use-auth-store";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { useMeSettingsDialogStore } from "@/stores/use-me-settings-dialog-store";
import { useSidebar } from "@celestial/ui/sidebar";
import { NAV_ITEM_COLLAPSE_HIDE_CLASSNAME } from "@/components/layout/admin-side-nav/nav-node-styles";
import type { ThemePreference } from "@/types/stores";

const SHORTCUTS_HELP_HASH = "#shortcuts";

function MenuItemContent(props: { icon?: ReactNode; label: string; right?: ReactNode }) {
  return (
    <>
      <span className="flex min-w-0 flex-1 items-center gap-3">
        {props.icon ? <span className="shrink-0 [&>svg]:size-4">{props.icon}</span> : null}
        <span className="min-w-0 truncate text-callout">{props.label}</span>
      </span>
      {props.right ? (
        <span className="shrink-0 opacity-70 transition-opacity group-hover:opacity-100">
          {props.right}
        </span>
      ) : null}
    </>
  );
}

function divider() {
  return <div className="mx-4 my-2 h-px bg-border/60" />;
}

function AdminAccountPanelContent(props: {
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  themePreference: ThemePreference;
  locale: AppLocale;
  onLogout: () => Promise<void>;
  onAccountSettings: () => Promise<void> | void;
  onThemePreferenceChange: (next: ThemePreference) => Promise<void> | void;
  onLocaleChange: (next: AppLocale) => Promise<void> | void;
  onShortcuts: () => Promise<void> | void;
}) {
  const { t } = useTranslation("account");
  const { closeFloatingPanel } = useFloatingPanel();

  const onClickAndClose = async (fn: () => Promise<void> | void) => {
    await fn();
    closeFloatingPanel();
  };

  const menuItemClassName = cn(
    "group",
    "transition-colors",
    "hover:bg-accent hover:text-primary-foreground",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
  );

  return (
    <div className="w-72">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-3">
          <UserAvatar name={props.displayName} assetRef={props.avatarUrl} size={56} />

          <div className="min-w-0 flex-1">
            <div className="truncate text-headline">{props.displayName}</div>
            {props.email ? (
              <div className="truncate text-callout text-label-secondary">{props.email}</div>
            ) : null}
          </div>
        </div>
      </div>

      {divider()}

      <div className="py-1">
        <FloatingPanelButton
          className={menuItemClassName}
          onClick={() => onClickAndClose(props.onAccountSettings)}
        >
          <MenuItemContent icon={<UserCog />} label={t("ACCOUNT_ACCOUNT_SETTINGS")} />
        </FloatingPanelButton>
      </div>

      {divider()}

      <div className="px-4 py-1 text-caption text-label-secondary">
        {t("ACCOUNT_SETTINGS_THEME_LABEL")}
      </div>

      <div className="py-1">
        <FloatingPanelButton
          className={menuItemClassName}
          onClick={() => onClickAndClose(() => props.onThemePreferenceChange("system"))}
        >
          <MenuItemContent
            icon={<Monitor />}
            label={t("ACCOUNT_THEME_SYSTEM")}
            right={
              props.themePreference === "system" ? <Check className="h-4 w-4 text-primary" /> : null
            }
          />
        </FloatingPanelButton>

        <FloatingPanelButton
          className={menuItemClassName}
          onClick={() => onClickAndClose(() => props.onThemePreferenceChange("light"))}
        >
          <MenuItemContent
            icon={<Sun />}
            label={t("ACCOUNT_THEME_LIGHT")}
            right={
              props.themePreference === "light" ? <Check className="h-4 w-4 text-primary" /> : null
            }
          />
        </FloatingPanelButton>

        <FloatingPanelButton
          className={menuItemClassName}
          onClick={() => onClickAndClose(() => props.onThemePreferenceChange("dark"))}
        >
          <MenuItemContent
            icon={<Moon />}
            label={t("ACCOUNT_THEME_DARK")}
            right={
              props.themePreference === "dark" ? <Check className="h-4 w-4 text-primary" /> : null
            }
          />
        </FloatingPanelButton>
      </div>

      <div className="px-4 py-1 text-caption text-label-secondary">
        {t("ACCOUNT_SETTINGS_LANGUAGE_LABEL")}
      </div>

      <div className="py-1">
        <FloatingPanelButton
          className={menuItemClassName}
          onClick={() => onClickAndClose(() => props.onLocaleChange("zh-CN"))}
        >
          <MenuItemContent
            icon={<Languages />}
            label={t("ACCOUNT_LANGUAGE_ZH")}
            right={props.locale === "zh-CN" ? <Check className="h-4 w-4 text-primary" /> : null}
          />
        </FloatingPanelButton>

        <FloatingPanelButton
          className={menuItemClassName}
          onClick={() => onClickAndClose(() => props.onLocaleChange("en-US"))}
        >
          <MenuItemContent
            icon={<Languages />}
            label={t("ACCOUNT_LANGUAGE_EN")}
            right={props.locale === "en-US" ? <Check className="h-4 w-4 text-primary" /> : null}
          />
        </FloatingPanelButton>
      </div>

      {divider()}

      <div className="py-1">
        <FloatingPanelButton
          className={menuItemClassName}
          onClick={() => onClickAndClose(props.onShortcuts)}
        >
          <MenuItemContent icon={<Keyboard />} label={t("ACCOUNT_SHORTCUTS")} />
        </FloatingPanelButton>
      </div>

      {divider()}

      <div>
        <FloatingPanelButton
          className={menuItemClassName}
          onClick={() => onClickAndClose(props.onLogout)}
        >
          <MenuItemContent icon={<LogOut />} label={t("ACCOUNT_LOGOUT")} />
        </FloatingPanelButton>
      </div>
    </div>
  );
}

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
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const clear = useAuthStore((s) => s.clear);
  const themePreference = usePreferencesStore((s) => s.themePreference);
  const locale = usePreferencesStore((s) => s.locale);
  const setLocale = usePreferencesStore((s) => s.setLocale);
  const openMeSettingsDialog = useMeSettingsDialogStore((s) => s.openDialog);

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
    void queryClient.cancelQueries();
    queryClient.clear();
    clear();
    await navigate({ to: "/login", replace: true });
  };

  return {
    displayName,
    email: profile.email,
    avatarUrl: profile.avatarUrl ?? profile.avatarAssetId,
    themePreference,
    locale,
    onLogout,
    onAccountSettings: () => openMeSettingsDialog({ tab: "profile" }),
    onThemePreferenceChange: async (next) => {
      await setThemePreferenceWithTransition(next, { direction: "ltr" });
    },
    onLocaleChange: (next) => setLocale(next),
    onShortcuts: () => window.location.assign(SHORTCUTS_HELP_HASH),
  };
}

export function AdminAccountMenu() {
  const { t } = useTranslation("account");
  const model = useAdminAccountMenuModel();
  const { state: sidebarState, isMobile } = useSidebar();
  const isCollapsed = sidebarState === "collapsed" && !isMobile;

  const triggerClassName = cn(
    "group",
    "flex w-full items-center",
    "h-16 py-0",
    "justify-start gap-3 px-5",
    // In collapsed state, sidebar width is 56px and avatar is 40px.
    // Use padding (animatable) instead of `justify-center` (non-animatable) to keep the avatar centered smoothly.
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

  const nameClassName = cn(
    "text-sidebar-foreground",
    "group-hover:text-sidebar-accent-foreground",
    "group-data-[state=open]:text-sidebar-accent-foreground",
  );

  const emailClassName = "text-label-secondary";

  return (
    <FloatingPanelRoot className="w-full">
      <FloatingPanelTrigger
        title={isCollapsed ? model.displayName : t("ACCOUNT_TITLE")}
        className={triggerClassName}
      >
        <UserAvatar
          name={model.displayName}
          assetRef={model.avatarUrl}
          size={40}
          className="shrink-0"
        />

        <div className={cn("min-w-0 text-left flex-1", NAV_ITEM_COLLAPSE_HIDE_CLASSNAME)}>
          <div className={cn("truncate text-footnote font-semibold", nameClassName)}>
            {model.displayName}
          </div>
          {model.email ? (
            <div className={cn("truncate text-caption", emailClassName)}>{model.email}</div>
          ) : null}
        </div>

        <ChevronDown
          className={cn(
            "ml-auto group-data-[collapsible=icon]:ml-0 size-4 shrink-0 opacity-70 transition-colors group-hover:opacity-100",
            NAV_ITEM_COLLAPSE_HIDE_CLASSNAME,
          )}
        />
      </FloatingPanelTrigger>

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
