import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";

import { Inbox, MessageCircle, PanelLeft as PanelLeftIcon, PanelsTopLeft } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";
import type { AdminNavItem } from "@/types/admin-nav";
import { AdminCommandTrigger } from "@/components/layout/admin-command-trigger";
import { ProjectAvatar, projectAvatarPropsFromIdentity } from "@/components/common/project-avatar";
import { AdminSidebarInbox } from "@/components/layout/admin-sidebar-inbox";
import { AdminFullLogo, AdminLogo } from "@/components/layout/admin-logo";
import { AdminSiderNav } from "@/components/layout/admin-side-nav";
import { AdminSidebarMainMenuSkeleton } from "@/components/layout/admin-sidebar-skeleton";
import { AdminWorkspaceSwitcher } from "@/components/layout/admin-workspace-switcher";
import GradualBlur from "@/components/ui/gradual-blur";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
  useSidebar,
} from "@arclayer/ui/sidebar";
import { Tabs, TabsList, TabsTrigger } from "@arclayer/ui/tabs";
import { cn } from "@arclayer/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@arclayer/ui/tooltip";
import { useAdminCommandPalette } from "@/hooks/use-admin-command-palette";
import type { CommandScope } from "@/lib/command/command-types";

export type SidebarBrowseProject = {
  projectId: string;
  workspaceId: string;
  name: string;
  description?: string | null;
  enterable: boolean;
  iconMode?: "initials" | "glyph" | "emoji" | "image" | null;
  iconColor?: string | null;
  iconGlyph?: string | null;
  iconEmoji?: string | null;
  iconUrl?: string | null;
};

export type AdminSidebarShellProps = {
  showNavSkeleton: boolean;
  showOrgNavErrorOverlay: boolean;
  mainItems: readonly AdminNavItem[];
  commandScope?: CommandScope;
  browseProjects?: readonly SidebarBrowseProject[];
  activeBrowseProjectId?: string | null;
  favoriteWorkspaceBase?: string | null;
  resolvePermissionName?: (code: string) => string | null;
  pathnameOverride?: string;
  collapsible?: "icon" | "none";
  railAriaLabel?: string;
  className?: string;
};

function shouldShowBottomBlur(el: HTMLElement): boolean {
  const hasOverflow = el.scrollHeight > el.clientHeight + 1;
  if (!hasOverflow) return false;
  const remaining = el.scrollHeight - el.clientHeight - el.scrollTop;
  return remaining > 1;
}

function resolveSidebarContentPaddingPx(el: HTMLElement): { left: number; right: number } {
  const sidebarContentEl = el.closest('[data-slot="sidebar-content"]') as HTMLElement | null;
  if (!sidebarContentEl) return { left: 0, right: 0 };

  const styles = window.getComputedStyle(sidebarContentEl);
  const left = Number.parseFloat(styles.paddingLeft) || 0;
  const right = Number.parseFloat(styles.paddingRight) || 0;

  return { left, right };
}

function useSidebarBottomBlurState(args: { showMenuSkeleton: boolean; mainItemCount: number }) {
  const navScrollRef = useRef<HTMLDivElement>(null);
  const [showNavBottomBlur, setShowNavBottomBlur] = useState(false);
  const [sidebarContentPadding, setSidebarContentPadding] = useState(() => ({ left: 0, right: 0 }));

  useEffect(() => {
    const el = navScrollRef.current;
    if (!el) return;

    const updateScroll = () => {
      const next = shouldShowBottomBlur(el);
      setShowNavBottomBlur((prev) => (prev === next ? prev : next));
    };
    const updatePadding = () => {
      const next = resolveSidebarContentPaddingPx(el);
      setSidebarContentPadding((prev) =>
        prev.left === next.left && prev.right === next.right ? prev : next,
      );
    };

    updatePadding();
    updateScroll();
    el.addEventListener("scroll", updateScroll, { passive: true });

    const resizeObserver = new ResizeObserver(() => {
      updatePadding();
      updateScroll();
    });
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener("scroll", updateScroll);
      resizeObserver.disconnect();
    };
  }, [args.showMenuSkeleton, args.mainItemCount]);

  return {
    navScrollRef,
    showNavBottomBlur,
    blurStyle: {
      left: -sidebarContentPadding.left,
      right: "auto",
      width: `calc(100% + ${sidebarContentPadding.left + sidebarContentPadding.right}px)`,
    } satisfies CSSProperties,
  };
}

type SidebarTopTab = "browse" | "inbox" | "chat";
const BROWSE_TAB_ACTIVE_MAX_WIDTH_CLASSNAME = "data-[state=active]:max-w-[7rem]";
const GHOST_HOVER_CLASSNAME =
  "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50";
const GHOST_ACTIVE_CLASSNAME =
  "data-[state=active]:bg-accent data-[state=active]:text-accent-foreground dark:data-[state=active]:bg-accent/50";
const SIDEBAR_CONTENT_TRANSITION = {
  duration: 0.2,
  ease: [0.22, 1, 0.36, 1],
} as const;

function useSidebarExpandedHeaderRows() {
  const { motionPhase, state } = useSidebar();
  return state !== "collapsed" && motionPhase !== "collapsing";
}

function AdminSidebarBranding() {
  const { t } = useTranslation("common");
  const { toggleSidebar } = useSidebar();
  const showExpandedHeaderRows = useSidebarExpandedHeaderRows();

  return (
    <SidebarHeader className="gap-0 px-0 py-2">
      <div className="flex items-center gap-2 px-4 py-2 pr-3">
        <div className="relative flex h-8 w-[108px] shrink-0 items-center justify-start overflow-hidden">
          <div
            className={cn(
              "absolute inset-y-0 left-0 flex items-center justify-start transition-opacity duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none",
              showExpandedHeaderRows ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            <AdminFullLogo
              to="/"
              ariaLabel="Arclayer"
              width={108}
              className="h-8 justify-start"
              imgClassName="h-8 w-auto object-contain"
            />
          </div>
          <div
            className={cn(
              "absolute inset-y-0 left-0 flex items-center justify-start transition-opacity duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none",
              showExpandedHeaderRows ? "pointer-events-none opacity-0" : "opacity-100",
            )}
          >
            <AdminLogo to="/" ariaLabel="Arclayer" size={28} />
          </div>
        </div>
        <button
          type="button"
          aria-label={t("common:SIDEBAR_TOGGLE")}
          onClick={toggleSidebar}
          className={cn(
            "ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-transparent text-label-secondary",
            "transition-[opacity,background-color,color,border-color] duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none",
            "hover:bg-accent/60 hover:text-label-primary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            showExpandedHeaderRows ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          <PanelLeftIcon className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className="px-2 pt-2">
        <AdminWorkspaceSwitcher
          variant="sidebar"
          showSidebarToggle={false}
          forceVisible
          className="flex w-full min-w-0"
        />
      </div>
    </SidebarHeader>
  );
}

function AdminSidebarTopTabs(props: {
  value: SidebarTopTab;
  onValueChange: (next: SidebarTopTab) => void;
  navItems: readonly AdminNavItem[];
  commandScope?: CommandScope;
  browseProjects?: readonly SidebarBrowseProject[];
  activeBrowseProjectId?: string | null;
}) {
  const { t } = useTranslation(["common"]);
  const showExpandedHeaderRows = useSidebarExpandedHeaderRows();
  const commandPalette = useAdminCommandPalette({
    navItems: props.navItems,
    scope:
      props.commandScope ??
      ({
        kind: "none",
        pathname: "/",
        workspaceId: null,
        organizationId: null,
      } as const),
  });
  const handleTabChange = (next: string) => {
    if (next === "browse" || next === "inbox" || next === "chat") {
      props.onValueChange(next);
    }
  };

  if (!showExpandedHeaderRows) {
    return null;
  }

  const browseLabel = t("common:SIDEBAR_TOP_TAB_BROWSE");
  const inboxLabel = t("nav:NAV_INBOX");
  const chatLabel = t("common:SIDEBAR_TOP_TAB_CHAT");
  const activeBrowseProject =
    props.activeBrowseProjectId != null
      ? ((props.browseProjects ?? []).find(
          (project) => project.projectId === props.activeBrowseProjectId,
        ) ?? null)
      : null;
  const browseTabDisplayLabel = activeBrowseProject?.name || browseLabel;
  const browseTabClassName = cn(
    "h-9 min-w-9 rounded-full border border-transparent bg-transparent text-callout font-semibold",
    "transition-[width,padding,color,background-color,border-color] duration-200 ease-out",
    GHOST_HOVER_CLASSNAME,
    "data-[state=active]:justify-start data-[state=active]:gap-2 data-[state=active]:px-3",
    GHOST_ACTIVE_CLASSNAME,
    "data-[state=inactive]:w-9 data-[state=inactive]:justify-center data-[state=inactive]:px-0 data-[state=inactive]:text-label-secondary",
    BROWSE_TAB_ACTIVE_MAX_WIDTH_CLASSNAME,
  );

  return (
    <div className="px-2 py-2 pr-3">
      <div className="flex items-center gap-2">
        <Tabs value={props.value} onValueChange={handleTabChange} className="min-w-0 flex-1">
          <TabsList
            aria-label={t("common:SIDEBAR_TOP_TABS_LABEL")}
            className={cn(
              "h-9 w-full justify-start gap-1 rounded-full bg-transparent p-0 text-label-secondary",
            )}
          >
            <Tooltip>
              <TabsTrigger value="browse" className={browseTabClassName}>
                <TooltipTrigger asChild focusTrigger={false}>
                  <span className="inline-flex items-center justify-center">
                    {activeBrowseProject ? (
                      <ProjectAvatar
                        name={browseTabDisplayLabel}
                        size={18}
                        className="shrink-0 rounded-sm ring-0"
                        {...projectAvatarPropsFromIdentity(activeBrowseProject)}
                      />
                    ) : (
                      <PanelsTopLeft className="size-4 shrink-0" aria-hidden="true" />
                    )}
                  </span>
                </TooltipTrigger>
                <span
                  className={cn("min-w-0 truncate", props.value === "browse" ? "inline" : "hidden")}
                >
                  {browseTabDisplayLabel}
                </span>
              </TabsTrigger>
              <TooltipContent hidden={props.value === "browse"}>
                {browseTabDisplayLabel}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TabsTrigger
                value="inbox"
                className={cn(
                  "h-9 min-w-9 rounded-full border border-transparent bg-transparent text-callout font-semibold",
                  "transition-[width,padding,color,background-color,border-color] duration-200 ease-out",
                  GHOST_HOVER_CLASSNAME,
                  "data-[state=active]:justify-start data-[state=active]:gap-2 data-[state=active]:px-3",
                  GHOST_ACTIVE_CLASSNAME,
                  "data-[state=inactive]:w-9 data-[state=inactive]:justify-center data-[state=inactive]:px-0 data-[state=inactive]:text-label-secondary",
                )}
              >
                <TooltipTrigger asChild focusTrigger={false}>
                  <span className="inline-flex items-center justify-center">
                    <Inbox className="size-4 shrink-0" aria-hidden="true" />
                  </span>
                </TooltipTrigger>
                <span className={cn("truncate", props.value === "inbox" ? "inline" : "hidden")}>
                  {inboxLabel}
                </span>
              </TabsTrigger>
              <TooltipContent hidden={props.value === "inbox"}>{inboxLabel}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TabsTrigger
                value="chat"
                className={cn(
                  "h-9 min-w-9 rounded-full border border-transparent bg-transparent text-callout font-semibold",
                  "transition-[width,padding,color,background-color,border-color] duration-200 ease-out",
                  GHOST_HOVER_CLASSNAME,
                  "data-[state=active]:justify-start data-[state=active]:gap-2 data-[state=active]:px-3",
                  GHOST_ACTIVE_CLASSNAME,
                  "data-[state=inactive]:w-9 data-[state=inactive]:justify-center data-[state=inactive]:px-0 data-[state=inactive]:text-label-secondary",
                )}
              >
                <TooltipTrigger asChild focusTrigger={false}>
                  <span className="inline-flex items-center justify-center">
                    <MessageCircle className="size-4 shrink-0" aria-hidden="true" />
                  </span>
                </TooltipTrigger>
                <span className={cn("truncate", props.value === "chat" ? "inline" : "hidden")}>
                  {chatLabel}
                </span>
              </TabsTrigger>
              <TooltipContent hidden={props.value === "chat"}>{chatLabel}</TooltipContent>
            </Tooltip>
          </TabsList>
        </Tabs>
        <AdminCommandTrigger
          sections={commandPalette.sections}
          query={commandPalette.query}
          onQueryChange={commandPalette.setQuery}
          emptyText={commandPalette.emptyText}
          onSelectEntry={commandPalette.onSelectEntry}
          variant="icon"
          className="h-8 w-8 shrink-0 rounded-xl"
        />
      </div>
    </div>
  );
}

function AdminSidebarContentArea(props: {
  activeTab: SidebarTopTab;
  showMenuSkeleton: boolean;
  mainItems: readonly AdminNavItem[];
  favoriteWorkspaceBase?: string | null;
  resolvePermissionName?: (code: string) => string | null;
  pathnameOverride?: string;
}) {
  const { t } = useTranslation(["common"]);
  const bottomBlur = useSidebarBottomBlurState({
    showMenuSkeleton: props.showMenuSkeleton,
    mainItemCount: props.mainItems.length,
  });

  const mainMenu = props.showMenuSkeleton ? (
    <AdminSidebarMainMenuSkeleton />
  ) : (
    <AdminSiderNav
      items={props.mainItems}
      favoriteWorkspaceBase={props.favoriteWorkspaceBase}
      showFavorites
      resolvePermissionName={props.resolvePermissionName}
      pathnameOverride={props.pathnameOverride}
    />
  );

  const browseContent = (
    <div className="relative flex min-h-0 flex-1">
      <div
        ref={bottomBlur.navScrollRef}
        className="flex min-h-0 flex-1 flex-col overflow-auto scrollbar-none"
      >
        {mainMenu}
      </div>
      {bottomBlur.showNavBottomBlur ? (
        <GradualBlur
          target="parent"
          position="bottom"
          height="4rem"
          strength={2}
          divCount={5}
          curve="bezier"
          exponential={false}
          opacity={0.75}
          zIndex={20}
          className="pointer-events-none"
          style={bottomBlur.blurStyle}
        />
      ) : null}
    </div>
  );

  const chatContent = (
    <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-6">
      <div className="mx-auto flex max-w-[14rem] flex-col items-center text-center">
        <MessageCircle className="mb-4 size-5 text-label-secondary" aria-hidden="true" />
        <h3 className="text-callout font-semibold text-label-primary">
          <span>{t("common:SIDEBAR_CHAT_EMPTY_TITLE")}</span>
        </h3>
        <p className="mt-2 text-footnote leading-6 text-label-secondary">
          {t("common:SIDEBAR_CHAT_EMPTY_DESC")}
        </p>
      </div>
    </div>
  );

  const activeContent =
    props.activeTab === "browse" ? (
      browseContent
    ) : props.activeTab === "inbox" ? (
      <AdminSidebarInbox />
    ) : (
      chatContent
    );

  return (
    <SidebarContent className="relative z-10 overflow-hidden px-2 scrollbar-none">
      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={props.activeTab}
            className="flex min-h-0 min-w-0 w-full flex-1"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={SIDEBAR_CONTENT_TRANSITION}
          >
            {activeContent}
          </motion.div>
        </AnimatePresence>
      </div>
    </SidebarContent>
  );
}

export function AdminSidebarShell({
  showNavSkeleton,
  showOrgNavErrorOverlay,
  mainItems,
  commandScope,
  browseProjects,
  activeBrowseProjectId,
  favoriteWorkspaceBase,
  resolvePermissionName,
  pathnameOverride,
  collapsible = "icon",
  railAriaLabel,
  className,
}: AdminSidebarShellProps) {
  const { t } = useTranslation("common");
  const showFailureSkeleton = showOrgNavErrorOverlay;
  const showMenuSkeleton = showNavSkeleton || showFailureSkeleton;
  const [activeTab, setActiveTab] = useState<SidebarTopTab>("browse");

  return (
    <Sidebar
      collapsible={collapsible}
      animateOnHover={false}
      className={cn("relative isolate z-40 h-screen", className)}
    >
      <AdminSidebarBranding />
      <AdminSidebarTopTabs
        value={activeTab}
        onValueChange={setActiveTab}
        navItems={mainItems}
        commandScope={commandScope}
        browseProjects={browseProjects}
        activeBrowseProjectId={activeBrowseProjectId}
      />
      <AdminSidebarContentArea
        activeTab={activeTab}
        showMenuSkeleton={showMenuSkeleton}
        mainItems={mainItems}
        favoriteWorkspaceBase={favoriteWorkspaceBase}
        resolvePermissionName={resolvePermissionName}
        pathnameOverride={pathnameOverride}
      />
      {collapsible !== "none" ? (
        <SidebarRail aria-label={railAriaLabel ?? t("common:SIDEBAR_RESIZE")} />
      ) : null}
    </Sidebar>
  );
}
