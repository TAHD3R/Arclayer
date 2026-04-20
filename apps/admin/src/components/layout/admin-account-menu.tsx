import {
  cloneElement,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type MouseEventHandler,
  type FocusEventHandler,
  type ReactNode,
} from "react";

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Check,
  ChevronRight,
  ChevronDown,
  Keyboard,
  Languages,
  LogOut,
  Monitor,
  Moon,
  Sun,
  UserCog,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import * as authApi from "@/api/auth";
import { UserAvatar } from "@/components/common/entity-avatar";
import { NAV_ITEM_COLLAPSE_HIDE_CLASSNAME } from "@/components/layout/admin-side-nav/nav-node-styles";
import { useSettingsScreen } from "@/components/layout/settings-screen-provider";
import { setThemePreferenceWithTransition } from "@/components/ui/theme-transition";
import { getUserDisplayName, normalizeUserProfile } from "@/lib/auth/user-profile";
import { buildSupportedLocaleOptions, SUPPORTED_LOCALES, type AppLocale } from "@/lib/i18n";
import { notifyError } from "@/lib/notifications";
import { queryClient } from "@/lib/query/query-client-instance";
import { useAuthStore } from "@/stores/use-auth-store";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import type { ThemePreference } from "@/types/stores";
import { cn } from "@arclayer/lib/utils";
import {
  FloatingPanelButton,
  FloatingPanelContent,
  FloatingPanelRoot,
  FloatingPanelTrigger,
  useFloatingPanel,
} from "@arclayer/ui/floating-panel";
import { Popover, PopoverAnchor, PopoverContent } from "@arclayer/ui/popover";
import { useSidebar } from "@arclayer/ui/sidebar";

const SHORTCUTS_HELP_HASH = "#shortcuts";
const HEADER_TRIGGER_CLASSNAME = cn(
  "group/panel-trigger flex h-10 items-center gap-1.5 rounded-md border border-transparent bg-transparent",
  "text-label-secondary transition-[background-color,color,border-color] duration-200",
  "hover:text-label-primary",
  "data-[state=open]:text-label-primary",
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

type AccountMenuSubmenu = "language" | "appearance";

type PreferenceOption = {
  icon: ReactNode;
  label: string;
  selected: boolean;
  onClick: () => Promise<void> | void;
};

type AdminAccountPanelContentProps = {
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
};

const PANEL_WIDTH_CLASSNAME = "w-75";
const SUBMENU_PANEL_WIDTH_CLASSNAME = "w-64";
const SUBMENU_CLOSE_DELAY_MS = 120;
const MENU_ITEM_CLASSNAME = cn(
  "group transition-[background-color,color] duration-200",
  "hover:bg-accent hover:text-label-primary",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
);

function normalizeIcon(node: ReactNode) {
  if (!isValidElement(node)) return node;

  const element = node as ReactElement<{ className?: string; "aria-hidden"?: boolean }>;
  return cloneElement(element, {
    className: cn("size-4 shrink-0", element.props.className),
    "aria-hidden": true,
  });
}

function MenuItemContent(props: { icon?: ReactNode; label: string; right?: ReactNode }) {
  return (
    <>
      <span className="flex min-w-0 flex-1 items-center gap-3">
        {props.icon ? <span className="shrink-0">{normalizeIcon(props.icon)}</span> : null}
        <span className="min-w-0 truncate text-body">{props.label}</span>
      </span>
      {props.right ? (
        <span className="shrink-0 opacity-70 transition-opacity group-hover:opacity-100">
          {normalizeIcon(props.right)}
        </span>
      ) : null}
    </>
  );
}

function MenuDivider() {
  return <div className="mx-4 my-2 h-px bg-border/60" />;
}

function MenuAction(props: {
  icon?: ReactNode;
  label: string;
  right?: ReactNode;
  onClick?: () => Promise<void> | void;
  onMouseEnter?: MouseEventHandler<HTMLButtonElement>;
  onMouseLeave?: MouseEventHandler<HTMLButtonElement>;
  onFocus?: FocusEventHandler<HTMLButtonElement>;
  onBlur?: FocusEventHandler<HTMLButtonElement>;
}) {
  return (
    <FloatingPanelButton
      className={MENU_ITEM_CLASSNAME}
      onClick={props.onClick}
      onMouseEnter={props.onMouseEnter}
      onMouseLeave={props.onMouseLeave}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
    >
      <MenuItemContent icon={props.icon} label={props.label} right={props.right} />
    </FloatingPanelButton>
  );
}

function ProfileSummary(props: {
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
}) {
  return (
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
  );
}

function RootMenu(props: {
  panelOpen: boolean;
  locale: AppLocale;
  themePreference: ThemePreference;
  onAccountSettings: () => Promise<void> | void;
  onLocaleChange: (next: AppLocale) => Promise<void> | void;
  onThemePreferenceChange: (next: ThemePreference) => Promise<void> | void;
  onSelectAndClose: (fn: () => Promise<void> | void) => Promise<void>;
  onShortcuts: () => Promise<void> | void;
  onLogout: () => Promise<void>;
}) {
  const { t } = useTranslation("account");
  return (
    <>
      <div className="py-1">
        <MenuAction
          icon={<UserCog />}
          label={t("ACCOUNT_MENU_ACCOUNT")}
          onClick={props.onAccountSettings}
        />
        <PreferenceSubmenuAction
          panelOpen={props.panelOpen}
          icon={<Languages />}
          label={t("ACCOUNT_MENU_LANGUAGE_PREFERENCES")}
          submenu="language"
          locale={props.locale}
          themePreference={props.themePreference}
          onLocaleChange={props.onLocaleChange}
          onThemePreferenceChange={props.onThemePreferenceChange}
          onSelectAndClose={props.onSelectAndClose}
        />
        <PreferenceSubmenuAction
          panelOpen={props.panelOpen}
          icon={<Monitor />}
          label={t("ACCOUNT_MENU_APPEARANCE")}
          submenu="appearance"
          locale={props.locale}
          themePreference={props.themePreference}
          onLocaleChange={props.onLocaleChange}
          onThemePreferenceChange={props.onThemePreferenceChange}
          onSelectAndClose={props.onSelectAndClose}
        />
      </div>
      <MenuDivider />
      <div className="py-1">
        <MenuAction
          icon={<Keyboard />}
          label={t("ACCOUNT_SHORTCUTS")}
          onClick={props.onShortcuts}
        />
      </div>
      <MenuDivider />
      <div className="pb-4">
        <MenuAction icon={<LogOut />} label={t("ACCOUNT_LOGOUT")} onClick={props.onLogout} />
      </div>
    </>
  );
}

function buildPreferenceOptions(
  submenu: AccountMenuSubmenu,
  t: (key: string) => string,
  locale: AppLocale,
  themePreference: ThemePreference,
  onLocaleChange: (next: AppLocale) => Promise<void> | void,
  onThemePreferenceChange: (next: ThemePreference) => Promise<void> | void,
): PreferenceOption[] {
  if (submenu === "language") {
    return buildSupportedLocaleOptions(SUPPORTED_LOCALES, t).map((option) => ({
      icon: <Languages />,
      label: option.label,
      selected: locale === option.value,
      onClick: () => onLocaleChange(option.value as AppLocale),
    }));
  }

  return [
    {
      icon: <Monitor />,
      label: t("ACCOUNT_THEME_SYSTEM"),
      selected: themePreference === "system",
      onClick: () => onThemePreferenceChange("system"),
    },
    {
      icon: <Sun />,
      label: t("ACCOUNT_THEME_LIGHT"),
      selected: themePreference === "light",
      onClick: () => onThemePreferenceChange("light"),
    },
    {
      icon: <Moon />,
      label: t("ACCOUNT_THEME_DARK"),
      selected: themePreference === "dark",
      onClick: () => onThemePreferenceChange("dark"),
    },
  ];
}

function PreferenceSubmenuContent(props: {
  submenu: AccountMenuSubmenu;
  locale: AppLocale;
  themePreference: ThemePreference;
  open: boolean;
  shouldFocusInitialItem: boolean;
  onLocaleChange: (next: AppLocale) => Promise<void> | void;
  onThemePreferenceChange: (next: ThemePreference) => Promise<void> | void;
  onSelectAndClose: (fn: () => Promise<void> | void) => Promise<void>;
  onInitialItemFocused: () => void;
  onMouseEnter: MouseEventHandler<HTMLDivElement>;
  onMouseLeave: MouseEventHandler<HTMLDivElement>;
  onFocusCapture: FocusEventHandler<HTMLDivElement>;
  onBlurCapture: FocusEventHandler<HTMLDivElement>;
}) {
  const { t } = useTranslation(["account", "common"]);
  const translate = (key: string) => t(key) as string;
  const translateLocaleLabel = (key: string) =>
    translate(key.startsWith("account:") ? key.slice("account:".length) : key);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const options = buildPreferenceOptions(
    props.submenu,
    translateLocaleLabel,
    props.locale,
    props.themePreference,
    props.onLocaleChange,
    props.onThemePreferenceChange,
  );

  useEffect(() => {
    if (!props.open || !props.shouldFocusInitialItem) return;

    queueMicrotask(() => {
      const firstButton = contentRef.current?.querySelector<HTMLButtonElement>("button");
      firstButton?.focus();
      props.onInitialItemFocused();
    });
  }, [props.open, props.shouldFocusInitialItem, props.onInitialItemFocused]);

  return (
    <div
      ref={contentRef}
      className="py-1"
      onMouseEnter={props.onMouseEnter}
      onMouseLeave={props.onMouseLeave}
      onFocusCapture={props.onFocusCapture}
      onBlurCapture={props.onBlurCapture}
    >
      {options.map((option) => (
        <MenuAction
          key={option.label}
          icon={option.icon}
          label={option.label}
          right={option.selected ? <Check className="text-primary" /> : null}
          onClick={() => props.onSelectAndClose(option.onClick)}
        />
      ))}
    </div>
  );
}

function PreferenceSubmenuAction(props: {
  panelOpen: boolean;
  icon: ReactNode;
  label: string;
  submenu: AccountMenuSubmenu;
  locale: AppLocale;
  themePreference: ThemePreference;
  onLocaleChange: (next: AppLocale) => Promise<void> | void;
  onThemePreferenceChange: (next: ThemePreference) => Promise<void> | void;
  onSelectAndClose: (fn: () => Promise<void> | void) => Promise<void>;
}) {
  const closeTimeoutRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [focusInitialItem, setFocusInitialItem] = useState(false);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current === null) return;
      window.clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (props.panelOpen) return;
    clearCloseTimeout();
    setOpen(false);
    setFocusInitialItem(false);
  }, [props.panelOpen]);

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current === null) return;
    window.clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = null;
  };

  const openSubmenu = (focusInitial = false) => {
    clearCloseTimeout();
    setFocusInitialItem(focusInitial);
    setOpen(true);
  };

  const scheduleClose = () => {
    clearCloseTimeout();
    closeTimeoutRef.current = window.setTimeout(() => {
      setOpen(false);
      setFocusInitialItem(false);
      closeTimeoutRef.current = null;
    }, SUBMENU_CLOSE_DELAY_MS);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        clearCloseTimeout();
        setOpen(next);
        if (!next) {
          setFocusInitialItem(false);
        }
      }}
    >
      <PopoverAnchor className="block w-full">
        <MenuAction
          icon={props.icon}
          label={props.label}
          right={<ChevronRight />}
          onClick={() => openSubmenu(true)}
          onMouseEnter={() => openSubmenu(false)}
          onMouseLeave={scheduleClose}
          onFocus={() => openSubmenu(false)}
          onBlur={scheduleClose}
        />
      </PopoverAnchor>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={8}
        className={cn(SUBMENU_PANEL_WIDTH_CLASSNAME, "p-1")}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onMouseDownCapture={(event) => event.stopPropagation()}
        onPointerDownCapture={(event) => event.stopPropagation()}
      >
        <PreferenceSubmenuContent
          submenu={props.submenu}
          locale={props.locale}
          themePreference={props.themePreference}
          open={open}
          shouldFocusInitialItem={focusInitialItem}
          onLocaleChange={props.onLocaleChange}
          onThemePreferenceChange={props.onThemePreferenceChange}
          onSelectAndClose={props.onSelectAndClose}
          onInitialItemFocused={() => setFocusInitialItem(false)}
          onMouseEnter={clearCloseTimeout}
          onMouseLeave={scheduleClose}
          onFocusCapture={clearCloseTimeout}
          onBlurCapture={scheduleClose}
        />
      </PopoverContent>
    </Popover>
  );
}

function AdminAccountPanelContent(props: AdminAccountPanelContentProps) {
  const { isOpen, closeFloatingPanel } = useFloatingPanel();

  const onClickAndClose = async (fn: () => Promise<void> | void) => {
    await fn();
    closeFloatingPanel();
  };

  return (
    <div className={PANEL_WIDTH_CLASSNAME}>
      <ProfileSummary
        displayName={props.displayName}
        email={props.email}
        avatarUrl={props.avatarUrl}
      />
      <MenuDivider />
      <RootMenu
        panelOpen={isOpen}
        locale={props.locale}
        themePreference={props.themePreference}
        onAccountSettings={() => onClickAndClose(props.onAccountSettings)}
        onLocaleChange={props.onLocaleChange}
        onThemePreferenceChange={props.onThemePreferenceChange}
        onSelectAndClose={onClickAndClose}
        onShortcuts={() => onClickAndClose(props.onShortcuts)}
        onLogout={() => onClickAndClose(props.onLogout)}
      />
    </div>
  );
}

function useAdminAccountMenuModel(): AdminAccountMenuModel {
  const navigate = useNavigate();
  const settingsScreen = useSettingsScreen();
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
    onAccountSettings: () => {
      settingsScreen.openSettings({ screen: "personal.profile" });
    },
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
        size={40}
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
  const title = props.isCollapsed ? props.displayName : t("ACCOUNT_TITLE");
  const nameClassName = cn(
    "text-sidebar-foreground",
    "group-hover:text-sidebar-accent-foreground",
    "group-data-[state=open]:text-sidebar-accent-foreground",
  );

  return (
    <FloatingPanelTrigger title={title} disableLayoutId className={SIDEBAR_TRIGGER_CLASSNAME}>
      <UserAvatar
        name={props.displayName}
        assetRef={props.avatarUrl}
        size={40}
        className="shrink-0 bg-accent"
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
          "ml-auto size-4 shrink-0 opacity-70 transition-transform duration-200",
          "group-data-[collapsible=icon]:ml-0",
          NAV_ITEM_COLLAPSE_HIDE_CLASSNAME,
          isOpen && "rotate-180",
        )}
        aria-hidden="true"
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
