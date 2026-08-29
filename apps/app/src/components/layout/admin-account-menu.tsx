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
  ArrowLeftRight,
  BookOpen,
  Check,
  ChevronRight,
  ChevronDown,
  CircleHelp,
  CreditCard,
  ExternalLink,
  FileText,
  History,
  Languages,
  LifeBuoy,
  LogOut,
  Monitor,
  MonitorCog,
  Moon,
  Plus,
  Settings,
  Shield,
  SquareStack,
  Sun,
  TriangleAlert,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import * as authApi from "@/api/auth";
import { getPlatformEntryEligibility } from "@/api/platform-entry";
import {
  UserAvatar,
  WorkspaceAvatar,
  workspaceAvatarPropsFromIdentity,
} from "@/components/common/entity-avatar";
import { NAV_ITEM_COLLAPSE_HIDE_CLASSNAME } from "@/components/layout/admin-side-nav/nav-node-styles";
import { LegalModalDialogs, type LegalModal } from "@/components/layout/legal-footer";
import { useSettingsScreen } from "@/components/layout/settings-screen-provider";
import { LocaleFlag } from "@/components/ui/tags";
import { setThemePreferenceWithTransition } from "@/components/ui/theme-transition";
import { getUserDisplayName, normalizeUserProfile } from "@/lib/auth/user-profile";
import { buildSupportedLocaleOptions, SUPPORTED_LOCALES, type AppLocale } from "@/lib/i18n";
import { notifyError } from "@/lib/notifications";
import { parsePlatformOrigin } from "@/lib/platform-entry";
import { queryClient } from "@/lib/query/query-client-instance";
import { projectsHomePath } from "@/lib/routing/workspace-routing";
import { useAuthStore } from "@/stores/use-auth-store";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { useWorkspaceScope, type MyWorkspaceItem } from "@/hooks/use-workspace-scope";
import type { ThemePreference } from "@/types/stores";
import { cn } from "@arclayer/lib/utils";
import {
  FloatingPanelButton,
  FloatingPanelContent,
  FloatingPanelRoot,
  FloatingPanelTrigger,
  useFloatingPanel,
  useFloatingPanelBoundary,
} from "@arclayer/ui/floating-panel";
import { Popover, PopoverAnchor, PopoverContent } from "@arclayer/ui/popover";
import { useSidebar } from "@arclayer/ui/sidebar";

const ACCOUNT_MENU_RESOURCE_URLS = {
  documentation: "https://docs.arclayer.com",
  changelog: "https://arclayer.com/changelog",
  helpCenter: "https://arclayer.com/help",
} as const;

type AccountMenuResource = keyof typeof ACCOUNT_MENU_RESOURCE_URLS;

const HEADER_TRIGGER_CLASSNAME = cn(
  "group/panel-trigger flex h-11 w-11 items-center gap-1.5 rounded-md border border-transparent bg-transparent min-[769px]:h-10 min-[769px]:w-auto",
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
  onWorkspaceSettings: () => void;
  onPlanUsage: () => void;
  onThemePreferenceChange: (next: ThemePreference) => Promise<void>;
  onLocaleChange: (next: AppLocale) => void;
  onOpenResource: (resource: AccountMenuResource) => void;
  platformEntry: PlatformEntryState;
};

type PlatformEntryState =
  | { status: "hidden" }
  | { status: "configuration-error" }
  | { status: "available"; open: () => void };

type AccountMenuSubmenu = "language" | "appearance" | "docs" | "legal";

type AccountSubmenuOption = {
  icon: ReactNode;
  label: string;
  right?: ReactNode;
  selected?: boolean;
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
  onWorkspaceSettings: () => Promise<void> | void;
  onPlanUsage: () => Promise<void> | void;
  onThemePreferenceChange: (next: ThemePreference) => Promise<void> | void;
  onLocaleChange: (next: AppLocale) => Promise<void> | void;
  onOpenResource: (resource: AccountMenuResource) => Promise<void> | void;
  onOpenLegal: (modal: Exclude<LegalModal, null>) => Promise<void> | void;
  platformEntry: PlatformEntryState;
};

const PANEL_WIDTH_CLASSNAME = "w-60";
const SUBMENU_PANEL_WIDTH_CLASSNAME = "w-60";
const SUBMENU_CLOSE_DELAY_MS = 120;
const MENU_ITEM_CLASSNAME = cn(
  "group rounded-none px-4 transition-[background-color,color] duration-200",
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
        <span className="min-w-0 flex-1 truncate text-callout">{props.label}</span>
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

function MenuStatus(props: { icon: ReactNode; label: string }) {
  return (
    <div className={cn(MENU_ITEM_CLASSNAME, "flex h-9 items-center text-label-secondary")}>
      <MenuItemContent icon={props.icon} label={props.label} />
    </div>
  );
}

function PlatformEntryMenuItem(props: { entry: PlatformEntryState }) {
  const { t } = useTranslation("account");
  if (props.entry.status === "hidden") return null;
  if (props.entry.status === "configuration-error") {
    return (
      <MenuStatus icon={<TriangleAlert />} label={t("ACCOUNT_MENU_PLATFORM_CONFIGURATION_ERROR")} />
    );
  }
  return (
    <MenuAction
      icon={<MonitorCog />}
      label={t("OPEN_PLATFORM_CONSOLE")}
      right={<ExternalLink />}
      onClick={props.entry.open}
    />
  );
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
  onWorkspaceSettings: () => Promise<void> | void;
  onPlanUsage: () => Promise<void> | void;
  onLocaleChange: (next: AppLocale) => Promise<void> | void;
  onThemePreferenceChange: (next: ThemePreference) => Promise<void> | void;
  onSelectAndClose: (fn: () => Promise<void> | void) => Promise<void>;
  onOpenResource: (resource: AccountMenuResource) => Promise<void> | void;
  onOpenLegal: (modal: Exclude<LegalModal, null>) => Promise<void> | void;
  onLogout: () => Promise<void>;
  platformEntry: PlatformEntryState;
}) {
  const { t } = useTranslation("account");
  return (
    <>
      <div className="py-1">
        <MenuAction
          icon={<Settings />}
          label={t("ACCOUNT_MENU_PERSONAL_SETTINGS")}
          onClick={props.onAccountSettings}
        />
        <MenuAction
          icon={<SquareStack />}
          label={t("ACCOUNT_MENU_WORKSPACE_SETTINGS")}
          onClick={props.onWorkspaceSettings}
        />
        <MenuAction
          icon={<CreditCard />}
          label={t("ACCOUNT_MENU_PLAN_USAGE")}
          onClick={props.onPlanUsage}
        />
        <AccountSubmenuAction
          panelOpen={props.panelOpen}
          icon={<Monitor />}
          label={t("ACCOUNT_MENU_APPEARANCE")}
          submenu="appearance"
          locale={props.locale}
          themePreference={props.themePreference}
          onLocaleChange={props.onLocaleChange}
          onThemePreferenceChange={props.onThemePreferenceChange}
          onOpenResource={props.onOpenResource}
          onOpenLegal={props.onOpenLegal}
          onSelectAndClose={props.onSelectAndClose}
        />
        <AccountSubmenuAction
          panelOpen={props.panelOpen}
          icon={<Languages />}
          label={t("ACCOUNT_MENU_LANGUAGE")}
          submenu="language"
          locale={props.locale}
          themePreference={props.themePreference}
          onLocaleChange={props.onLocaleChange}
          onThemePreferenceChange={props.onThemePreferenceChange}
          onOpenResource={props.onOpenResource}
          onOpenLegal={props.onOpenLegal}
          onSelectAndClose={props.onSelectAndClose}
        />
      </div>
      <MenuDivider />
      <div className="py-1">
        <PlatformEntryMenuItem entry={props.platformEntry} />
        <AccountSubmenuAction
          panelOpen={props.panelOpen}
          icon={<LifeBuoy />}
          label={t("ACCOUNT_MENU_DOCS_RESOURCES")}
          submenu="docs"
          locale={props.locale}
          themePreference={props.themePreference}
          onLocaleChange={props.onLocaleChange}
          onThemePreferenceChange={props.onThemePreferenceChange}
          onOpenResource={props.onOpenResource}
          onOpenLegal={props.onOpenLegal}
          onSelectAndClose={props.onSelectAndClose}
        />
        <AccountSubmenuAction
          panelOpen={props.panelOpen}
          icon={<Shield />}
          label={t("ACCOUNT_MENU_TERMS_PRIVACY")}
          submenu="legal"
          locale={props.locale}
          themePreference={props.themePreference}
          onLocaleChange={props.onLocaleChange}
          onThemePreferenceChange={props.onThemePreferenceChange}
          onOpenResource={props.onOpenResource}
          onOpenLegal={props.onOpenLegal}
          onSelectAndClose={props.onSelectAndClose}
        />
      </div>
      <MenuDivider />
      <div className="pb-4 pt-1">
        <MenuAction icon={<LogOut />} label={t("ACCOUNT_LOGOUT")} onClick={props.onLogout} />
      </div>
    </>
  );
}

function buildAccountSubmenuOptions(
  submenu: AccountMenuSubmenu,
  t: (key: string) => string,
  locale: AppLocale,
  themePreference: ThemePreference,
  onLocaleChange: (next: AppLocale) => Promise<void> | void,
  onThemePreferenceChange: (next: ThemePreference) => Promise<void> | void,
  onOpenResource: (resource: AccountMenuResource) => Promise<void> | void,
  onOpenLegal: (modal: Exclude<LegalModal, null>) => Promise<void> | void,
): AccountSubmenuOption[] {
  if (submenu === "language") {
    return buildSupportedLocaleOptions(SUPPORTED_LOCALES, t).map((option) => ({
      icon: <LocaleFlag locale={option.value} className="text-body" />,
      label: option.label,
      selected: locale === option.value,
      onClick: () => onLocaleChange(option.value as AppLocale),
    }));
  }

  if (submenu === "appearance") {
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

  if (submenu === "docs") {
    return [
      {
        icon: <BookOpen />,
        label: t("ACCOUNT_MENU_DOCUMENTATION"),
        right: <ExternalLink />,
        onClick: () => onOpenResource("documentation"),
      },
      {
        icon: <History />,
        label: t("ACCOUNT_MENU_CHANGELOG"),
        right: <ExternalLink />,
        onClick: () => onOpenResource("changelog"),
      },
      {
        icon: <CircleHelp />,
        label: t("ACCOUNT_MENU_HELP_CENTER"),
        right: <ExternalLink />,
        onClick: () => onOpenResource("helpCenter"),
      },
    ];
  }

  return [
    {
      icon: <FileText />,
      label: t("ACCOUNT_MENU_TERMS"),
      right: <ExternalLink />,
      onClick: () => onOpenLegal("terms"),
    },
    {
      icon: <Shield />,
      label: t("ACCOUNT_MENU_PRIVACY_POLICY"),
      right: <ExternalLink />,
      onClick: () => onOpenLegal("privacy"),
    },
  ];
}

function AccountSubmenuContent(props: {
  submenu: AccountMenuSubmenu;
  locale: AppLocale;
  themePreference: ThemePreference;
  open: boolean;
  shouldFocusInitialItem: boolean;
  onLocaleChange: (next: AppLocale) => Promise<void> | void;
  onThemePreferenceChange: (next: ThemePreference) => Promise<void> | void;
  onOpenResource: (resource: AccountMenuResource) => Promise<void> | void;
  onOpenLegal: (modal: Exclude<LegalModal, null>) => Promise<void> | void;
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
  const options = buildAccountSubmenuOptions(
    props.submenu,
    translateLocaleLabel,
    props.locale,
    props.themePreference,
    props.onLocaleChange,
    props.onThemePreferenceChange,
    props.onOpenResource,
    props.onOpenLegal,
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
          right={option.selected ? <Check className="text-primary" /> : option.right}
          onClick={() => props.onSelectAndClose(option.onClick)}
        />
      ))}
    </div>
  );
}

function useSubmenuTiming(panelOpen: boolean) {
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
    if (panelOpen) return;
    clearCloseTimeout();
    setOpen(false);
    setFocusInitialItem(false);
  }, [panelOpen]);

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

  const handleOpenChange = (next: boolean) => {
    clearCloseTimeout();
    setOpen(next);
    if (!next) {
      setFocusInitialItem(false);
    }
  };

  return {
    open,
    focusInitialItem,
    openSubmenu,
    scheduleClose,
    clearCloseTimeout,
    handleOpenChange,
    clearFocusInitialItem: () => setFocusInitialItem(false),
  };
}

function AccountSubmenuAction(props: {
  panelOpen: boolean;
  icon: ReactNode;
  label: string;
  submenu: AccountMenuSubmenu;
  locale: AppLocale;
  themePreference: ThemePreference;
  onLocaleChange: (next: AppLocale) => Promise<void> | void;
  onThemePreferenceChange: (next: ThemePreference) => Promise<void> | void;
  onOpenResource: (resource: AccountMenuResource) => Promise<void> | void;
  onOpenLegal: (modal: Exclude<LegalModal, null>) => Promise<void> | void;
  onSelectAndClose: (fn: () => Promise<void> | void) => Promise<void>;
}) {
  const {
    open,
    focusInitialItem,
    openSubmenu,
    scheduleClose,
    clearCloseTimeout,
    handleOpenChange,
    clearFocusInitialItem,
  } = useSubmenuTiming(props.panelOpen);
  const collisionBoundary = useFloatingPanelBoundary();

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
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
        collisionBoundary={collisionBoundary ?? undefined}
        collisionPadding={16}
        className={cn(
          SUBMENU_PANEL_WIDTH_CLASSNAME,
          "max-h-(--radix-popover-content-available-height) overflow-y-auto p-0",
        )}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onMouseDownCapture={(event) => event.stopPropagation()}
        onPointerDownCapture={(event) => event.stopPropagation()}
      >
        <AccountSubmenuContent
          submenu={props.submenu}
          locale={props.locale}
          themePreference={props.themePreference}
          open={open}
          shouldFocusInitialItem={focusInitialItem}
          onLocaleChange={props.onLocaleChange}
          onThemePreferenceChange={props.onThemePreferenceChange}
          onOpenResource={props.onOpenResource}
          onOpenLegal={props.onOpenLegal}
          onSelectAndClose={props.onSelectAndClose}
          onInitialItemFocused={clearFocusInitialItem}
          onMouseEnter={clearCloseTimeout}
          onMouseLeave={scheduleClose}
          onFocusCapture={clearCloseTimeout}
          onBlurCapture={scheduleClose}
        />
      </PopoverContent>
    </Popover>
  );
}

function WorkspaceSwitcherSkeleton(props: { rows: number }) {
  return (
    <div className="px-4 py-2.5">
      <div className="flex flex-col gap-3">
        {Array.from({ length: props.rows }).map((_, index) => (
          <div key={index} className="flex items-center gap-3" aria-hidden="true">
            <div className="size-5 shrink-0 animate-pulse rounded-sm bg-accent/50" />
            <div className="h-4 flex-1 animate-pulse rounded bg-accent/50" />
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkspaceOptionButton(props: {
  workspace: MyWorkspaceItem;
  selected: boolean;
  onClick: () => void;
}) {
  const title = props.workspace.name || props.workspace.workspaceId;
  return (
    <FloatingPanelButton className={MENU_ITEM_CLASSNAME} onClick={props.onClick}>
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <WorkspaceAvatar
          name={title}
          size={20}
          className="shrink-0 rounded-sm"
          {...workspaceAvatarPropsFromIdentity(props.workspace)}
        />
        <span className="min-w-0 flex-1 truncate text-left text-callout font-semibold text-label-primary">
          {title}
        </span>
      </span>
      {props.selected ? (
        <span className="shrink-0">
          <Check className="size-4 text-primary" aria-hidden="true" />
        </span>
      ) : null}
    </FloatingPanelButton>
  );
}

function WorkspaceSwitcherContent(props: {
  open: boolean;
  shouldFocusInitialItem: boolean;
  workspaces: readonly MyWorkspaceItem[];
  selectedWorkspaceId: string | null;
  loading: boolean;
  loadError: boolean;
  onSelectWorkspace: (workspace: MyWorkspaceItem) => void;
  onCreateWorkspace: () => void;
  onInitialItemFocused: () => void;
  onMouseEnter: MouseEventHandler<HTMLDivElement>;
  onMouseLeave: MouseEventHandler<HTMLDivElement>;
  onFocusCapture: FocusEventHandler<HTMLDivElement>;
  onBlurCapture: FocusEventHandler<HTMLDivElement>;
}) {
  const { t } = useTranslation(["account", "common"]);
  const contentRef = useRef<HTMLDivElement | null>(null);

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
      className="flex min-h-0 flex-col py-1"
      onMouseEnter={props.onMouseEnter}
      onMouseLeave={props.onMouseLeave}
      onFocusCapture={props.onFocusCapture}
      onBlurCapture={props.onBlurCapture}
    >
      {props.loadError ? (
        <div className="flex items-center justify-center px-4 py-6 text-center text-callout text-label-secondary">
          {t("common:REQUEST_FAILED")}
        </div>
      ) : props.loading ? (
        <WorkspaceSwitcherSkeleton rows={3} />
      ) : (
        <>
          {props.workspaces.length === 0 ? (
            <div className="flex items-center justify-center px-4 py-6 text-center text-callout text-label-secondary">
              {t("common:WORKSPACE_SWITCHER_WORKSPACE_EMPTY")}
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {props.workspaces.map((workspace) => (
              <WorkspaceOptionButton
                key={workspace.workspaceId}
                workspace={workspace}
                selected={String(props.selectedWorkspaceId || "") === String(workspace.workspaceId)}
                onClick={() => props.onSelectWorkspace(workspace)}
              />
            ))}
          </div>
          <MenuDivider />
          <MenuAction
            icon={<Plus />}
            label={t("common:WORKSPACE_SWITCHER_ADD_WORKSPACE")}
            onClick={props.onCreateWorkspace}
          />
        </>
      )}
    </div>
  );
}

function WorkspaceSwitcherSubmenu(props: {
  panelOpen: boolean;
  workspaces: readonly MyWorkspaceItem[];
  selectedWorkspaceId: string | null;
  selectedWorkspace: MyWorkspaceItem | null;
  loading: boolean;
  loadError: boolean;
  onSelectWorkspace: (workspace: MyWorkspaceItem) => void;
  onCreateWorkspace: () => void;
}) {
  const { t } = useTranslation(["account", "common"]);
  const {
    open,
    focusInitialItem,
    openSubmenu,
    scheduleClose,
    clearCloseTimeout,
    handleOpenChange,
    clearFocusInitialItem,
  } = useSubmenuTiming(props.panelOpen);
  const collisionBoundary = useFloatingPanelBoundary();

  const anchorLabel = props.selectedWorkspace
    ? props.selectedWorkspace.name || props.selectedWorkspace.workspaceId
    : t("common:WORKSPACE_SWITCHER_SELECT_WORKSPACE");

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverAnchor className="block w-full">
        <FloatingPanelButton
          className={MENU_ITEM_CLASSNAME}
          onClick={() => openSubmenu(true)}
          onMouseEnter={() => openSubmenu(false)}
          onMouseLeave={scheduleClose}
          onBlur={scheduleClose}
        >
          {props.selectedWorkspace ? (
            <WorkspaceAvatar
              name={anchorLabel}
              size={20}
              className="shrink-0 rounded-sm"
              {...workspaceAvatarPropsFromIdentity(props.selectedWorkspace)}
            />
          ) : (
            <span className="shrink-0">
              <SquareStack className="size-4" aria-hidden="true" />
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-callout font-semibold text-label-primary">
            {anchorLabel}
          </span>
          <span className="sr-only">{t("account:ACCOUNT_MENU_SWITCH_WORKSPACE")}</span>
          <span className="shrink-0 opacity-70 transition-opacity group-hover:opacity-100">
            <ArrowLeftRight className="size-4" aria-hidden="true" />
          </span>
        </FloatingPanelButton>
      </PopoverAnchor>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={8}
        collisionBoundary={collisionBoundary ?? undefined}
        collisionPadding={16}
        className={cn(
          SUBMENU_PANEL_WIDTH_CLASSNAME,
          "flex max-h-(--radix-popover-content-available-height) max-w-[calc(100vw-1rem)] flex-col overflow-hidden p-0",
        )}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onMouseDownCapture={(event) => event.stopPropagation()}
        onPointerDownCapture={(event) => event.stopPropagation()}
      >
        <WorkspaceSwitcherContent
          open={open}
          shouldFocusInitialItem={focusInitialItem}
          workspaces={props.workspaces}
          selectedWorkspaceId={props.selectedWorkspaceId}
          loading={props.loading}
          loadError={props.loadError}
          onSelectWorkspace={props.onSelectWorkspace}
          onCreateWorkspace={props.onCreateWorkspace}
          onInitialItemFocused={clearFocusInitialItem}
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
  const navigate = useNavigate();
  const workspaceScope = useWorkspaceScope();
  const setCurrentWorkspaceId = useWorkspaceStore((s) => s.setCurrentWorkspaceId);
  const setCurrentProjectId = useWorkspaceStore((s) => s.setCurrentProjectId);

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
      <WorkspaceSwitcherSubmenu
        panelOpen={isOpen}
        workspaces={workspaceScope.workspaces}
        selectedWorkspaceId={workspaceScope.selectedWorkspaceId}
        selectedWorkspace={workspaceScope.selectedWorkspace}
        loading={workspaceScope.isLoading}
        loadError={workspaceScope.isError}
        onSelectWorkspace={(workspace) =>
          onClickAndClose(() => {
            setCurrentWorkspaceId(workspace.workspaceId);
            setCurrentProjectId(null);
            void navigate({ to: projectsHomePath() as never });
          })
        }
        onCreateWorkspace={() =>
          onClickAndClose(() => {
            void navigate({
              to: "/welcome" as never,
              search: { mode: "create-workspace" } as never,
              viewTransition: true,
            });
          })
        }
      />
      <MenuDivider />
      <RootMenu
        panelOpen={isOpen}
        locale={props.locale}
        themePreference={props.themePreference}
        onAccountSettings={() => onClickAndClose(props.onAccountSettings)}
        onWorkspaceSettings={() => onClickAndClose(props.onWorkspaceSettings)}
        onPlanUsage={() => onClickAndClose(props.onPlanUsage)}
        onLocaleChange={props.onLocaleChange}
        onThemePreferenceChange={props.onThemePreferenceChange}
        onSelectAndClose={onClickAndClose}
        onOpenResource={props.onOpenResource}
        onOpenLegal={props.onOpenLegal}
        onLogout={() => onClickAndClose(props.onLogout)}
        platformEntry={props.platformEntry}
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
  const platformEntryQuery = useQuery({
    queryKey: ["me", "platform-entry-eligibility", sessionVersion],
    enabled: Boolean(accessToken),
    queryFn: ({ signal }) => getPlatformEntryEligibility(signal),
    retry: false,
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

  const platformEntry: PlatformEntryState = (() => {
    if (platformEntryQuery.isPending) return { status: "hidden" };
    if (platformEntryQuery.isError) return { status: "hidden" };
    if (!platformEntryQuery.data.eligible) return { status: "hidden" };

    try {
      const origin = parsePlatformOrigin(import.meta.env.VITE_PLATFORM_ORIGIN);
      return {
        status: "available",
        open: () => window.open(origin, "_blank", "noopener,noreferrer"),
      };
    } catch {
      return { status: "configuration-error" };
    }
  })();

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
    onWorkspaceSettings: () => {
      settingsScreen.openSettings({ screen: "workspace.general" });
    },
    onPlanUsage: () => {
      settingsScreen.openSettings({ screen: "workspace.plan-usage" });
    },
    onThemePreferenceChange: async (next) => {
      await setThemePreferenceWithTransition(next, { direction: "ltr" });
    },
    onLocaleChange: (next) => setLocale(next),
    onOpenResource: (resource) => {
      window.open(ACCOUNT_MENU_RESOURCE_URLS[resource], "_blank", "noopener,noreferrer");
    },
    platformEntry,
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
        className="shrink-0 ring-border dark:ring-input"
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
  const [legalModal, setLegalModal] = useState<LegalModal>(null);
  const isCollapsed = sidebarState === "collapsed" && !isMobile;
  const isHeaderVariant = props.variant === "header";

  if (isHeaderVariant) {
    return (
      <>
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
              onWorkspaceSettings={model.onWorkspaceSettings}
              onPlanUsage={model.onPlanUsage}
              onThemePreferenceChange={model.onThemePreferenceChange}
              onLocaleChange={model.onLocaleChange}
              onOpenResource={model.onOpenResource}
              onOpenLegal={setLegalModal}
              platformEntry={model.platformEntry}
            />
          </FloatingPanelContent>
        </FloatingPanelRoot>
        <LegalModalDialogs openModal={legalModal} setOpenModal={setLegalModal} />
      </>
    );
  }

  return (
    <>
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
            onWorkspaceSettings={model.onWorkspaceSettings}
            onPlanUsage={model.onPlanUsage}
            onThemePreferenceChange={model.onThemePreferenceChange}
            onLocaleChange={model.onLocaleChange}
            onOpenResource={model.onOpenResource}
            onOpenLegal={setLegalModal}
            platformEntry={model.platformEntry}
          />
        </FloatingPanelContent>
      </FloatingPanelRoot>
      <LegalModalDialogs openModal={legalModal} setOpenModal={setLegalModal} />
    </>
  );
}
