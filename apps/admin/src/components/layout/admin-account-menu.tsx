import {
  cloneElement,
  isValidElement,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
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
import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";

import * as authApi from "@/api/auth";
import { UserAvatar } from "@/components/common/entity-avatar";
import { NAV_ITEM_COLLAPSE_HIDE_CLASSNAME } from "@/components/layout/admin-side-nav/nav-node-styles";
import { setThemePreferenceWithTransition } from "@/components/ui/theme-transition";
import { getUserDisplayName, normalizeUserProfile } from "@/lib/auth/user-profile";
import { buildSupportedLocaleOptions, SUPPORTED_LOCALES, type AppLocale } from "@/lib/i18n";
import { notifyError } from "@/lib/notifications";
import { queryClient } from "@/lib/query/query-client-instance";
import { buildNotificationsSourceSearch } from "@/lib/routing/notifications-source";
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
import { useSidebar } from "@arclayer/ui/sidebar";

const SHORTCUTS_HELP_HASH = "#shortcuts";
const HEADER_TRIGGER_CLASSNAME = cn(
  "group/panel-trigger flex h-11 items-center gap-1.5 rounded-xl border border-transparent bg-transparent pl-0.5 pr-1.5",
  "text-label-secondary transition-[background-color,color,border-color] duration-200",
  "hover:bg-accent/70 hover:text-label-primary",
  "data-[state=open]:border-border/70 data-[state=open]:bg-accent data-[state=open]:text-label-primary",
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

type AccountMenuView = "root" | "language" | "appearance";

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
const MENU_ITEM_CLASSNAME = cn(
  "group transition-[background-color,color] duration-200",
  "hover:bg-accent hover:text-label-primary",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
);
const VIEW_TRANSITIONS = {
  enter: (direction: number) => ({ opacity: 0, x: direction > 0 ? 20 : -20 }),
  center: { opacity: 1, x: 0 },
  exit: (direction: number) => ({ opacity: 0, x: direction > 0 ? -20 : 20 }),
};

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
        <span className="min-w-0 truncate text-callout">{props.label}</span>
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
  onClick: () => Promise<void> | void;
}) {
  return (
    <FloatingPanelButton className={MENU_ITEM_CLASSNAME} onClick={props.onClick}>
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
  onAccountSettings: () => Promise<void> | void;
  onOpenAppearance: () => void;
  onOpenLanguage: () => void;
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
        <MenuAction
          icon={<Languages />}
          label={t("ACCOUNT_MENU_LANGUAGE_PREFERENCES")}
          right={<ArrowRight />}
          onClick={props.onOpenLanguage}
        />
        <MenuAction
          icon={<Monitor />}
          label={t("ACCOUNT_MENU_APPEARANCE")}
          right={<ArrowRight />}
          onClick={props.onOpenAppearance}
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
  view: Exclude<AccountMenuView, "root">,
  t: (key: string) => string,
  locale: AppLocale,
  themePreference: ThemePreference,
  onLocaleChange: (next: AppLocale) => Promise<void> | void,
  onThemePreferenceChange: (next: ThemePreference) => Promise<void> | void,
): PreferenceOption[] {
  if (view === "language") {
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

function PreferenceSubmenu(props: {
  view: Exclude<AccountMenuView, "root">;
  locale: AppLocale;
  themePreference: ThemePreference;
  onBack: () => void;
  onLocaleChange: (next: AppLocale) => Promise<void> | void;
  onThemePreferenceChange: (next: ThemePreference) => Promise<void> | void;
  onSelectAndClose: (fn: () => Promise<void> | void) => Promise<void>;
}) {
  const { t } = useTranslation(["account", "common"]);
  const translate = (key: string) => t(key) as string;
  const translateLocaleLabel = (key: string) =>
    translate(key.startsWith("account:") ? key.slice("account:".length) : key);
  const options = buildPreferenceOptions(
    props.view,
    translateLocaleLabel,
    props.locale,
    props.themePreference,
    props.onLocaleChange,
    props.onThemePreferenceChange,
  );

  return (
    <>
      <div className="py-1">
        <MenuAction icon={<ArrowLeft />} label={translate("common:BACK")} onClick={props.onBack} />
      </div>
      <MenuDivider />
      <div className="pb-4">
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
    </>
  );
}

function AdminAccountPanelContent(props: AdminAccountPanelContentProps) {
  const { isOpen, closeFloatingPanel } = useFloatingPanel();
  const [view, setView] = useState<AccountMenuView>("root");
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    if (!isOpen) {
      setView("root");
      setDirection(1);
    }
  }, [isOpen]);

  const onClickAndClose = async (fn: () => Promise<void> | void) => {
    await fn();
    closeFloatingPanel();
  };

  const showAppearance = () => {
    setDirection(1);
    setView("appearance");
  };

  const showLanguage = () => {
    setDirection(1);
    setView("language");
  };

  const showRoot = () => {
    setDirection(-1);
    setView("root");
  };

  return (
    <div className={PANEL_WIDTH_CLASSNAME}>
      <ProfileSummary
        displayName={props.displayName}
        email={props.email}
        avatarUrl={props.avatarUrl}
      />
      <MenuDivider />
      <div className="relative overflow-hidden">
        <AnimatePresence initial={false} custom={direction} mode="wait">
          <motion.div
            key={view}
            custom={direction}
            initial="enter"
            animate="center"
            exit="exit"
            variants={VIEW_TRANSITIONS}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            {view === "root" ? (
              <RootMenu
                onAccountSettings={() => onClickAndClose(props.onAccountSettings)}
                onOpenAppearance={showAppearance}
                onOpenLanguage={showLanguage}
                onShortcuts={() => onClickAndClose(props.onShortcuts)}
                onLogout={() => onClickAndClose(props.onLogout)}
              />
            ) : (
              <PreferenceSubmenu
                view={view}
                locale={props.locale}
                themePreference={props.themePreference}
                onBack={showRoot}
                onLocaleChange={props.onLocaleChange}
                onThemePreferenceChange={props.onThemePreferenceChange}
                onSelectAndClose={onClickAndClose}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function useAdminAccountMenuModel(): AdminAccountMenuModel {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
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
    onAccountSettings: () =>
      void navigate({
        to: "/usercenter/profile",
        search: buildNotificationsSourceSearch(pathname),
      }),
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
