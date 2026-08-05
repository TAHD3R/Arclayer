import { useEffect, useMemo, useState } from "react";

import { Inbox, MessageCircle, PanelLeft as PanelLeftIcon, PanelsTopLeft } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import type { AdminNavItem } from "@/types/admin-nav";
import { AgentThreadSidebar } from "@/components/ai/agent-thread-sidebar";
import { AdminCommandTrigger } from "@/components/layout/admin-command-trigger";
import type { FavoriteDynamicLabelIndex } from "@/components/layout/admin-side-nav/favorite-nav-items";
import {
  ProjectBrowseMenuContent,
  type SidebarBrowseProject,
} from "@/components/layout/project-browse-menu";
import { AdminSidebarInbox } from "@/components/layout/admin-sidebar-inbox";
import { AdminFullLogo, AdminLogo } from "@/components/layout/admin-logo";
import { AdminSiderNav } from "@/components/layout/admin-side-nav";
import { AdminSidebarMainMenuSkeleton } from "@/components/layout/admin-sidebar-skeleton";
import { AdminScopeSwitcher } from "@/components/layout/admin-scope-switcher";
import { Button as ButtonPrimitive } from "@arclayer/ui/button-primitive";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@arclayer/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
  useSidebar,
} from "@arclayer/ui/sidebar";
import { Tabs, TabsList, TabsTrigger } from "@arclayer/ui/tabs";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@arclayer/ui/empty";
import { cn } from "@arclayer/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@arclayer/ui/tooltip";
import { useAdminCommandPalette } from "@/hooks/use-admin-command-palette";
import type { CommandScope } from "@/lib/command/command-types";
import { projectHomePath, projectsHomePath } from "@/lib/routing/workspace-routing";

export type AdminSidebarShellProps = {
  showNavSkeleton: boolean;
  showOrgNavErrorOverlay: boolean;
  mainItems: readonly AdminNavItem[];
  showInboxBadge?: boolean;
  unreadInboxCount?: number;
  commandScope?: CommandScope;
  browseProjects?: readonly SidebarBrowseProject[];
  activeBrowseProjectId?: string | null;
  favoriteWorkspaceBase?: string | null;
  favoriteDynamicLabels?: FavoriteDynamicLabelIndex;
  resolvePermissionName?: (code: string) => string | null;
  pathnameOverride?: string;
  collapsible?: "icon" | "none";
  railAriaLabel?: string;
  className?: string;
  assistantAvailable?: boolean;
};

const ACTIVE_PILL_TAP_SCALE = 0.98;
const BROWSE_TAB_ACTIVE_MAX_WIDTH_CLASSNAME = "data-[state=active]:max-w-[7rem]";
const GHOST_HOVER_CLASSNAME =
  "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50";
const GHOST_ACTIVE_CLASSNAME =
  "data-[state=active]:bg-accent data-[state=active]:text-accent-foreground dark:data-[state=active]:bg-accent/50";
const SIDEBAR_CONTENT_TRANSITION = {
  duration: 0.2,
  ease: [0.22, 1, 0.36, 1],
} as const;

type AdminSidebarTopTab = "browse" | "inbox" | "chat";

function getSidebarMenuTreeItemKey(item: AdminNavItem): string {
  const childrenKey = item.children?.map(getSidebarMenuTreeItemKey).join(",");
  const groupKey = item.groupLabelBeforeKey ?? item.groupLabelBefore ?? "";
  const targetKey = item.to ?? "";
  return [item.key, item.labelKey ?? item.label, groupKey, targetKey, childrenKey ?? ""].join(":");
}

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
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="relative flex h-8 w-27 shrink-0 items-center justify-start overflow-hidden">
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
            <AdminLogo to="/" ariaLabel="Arclayer" size={32} />
          </div>
        </div>
        <button
          type="button"
          aria-label={t("common:SIDEBAR_TOGGLE")}
          onClick={toggleSidebar}
          className={cn(
            "ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-transparent text-label-secondary",
            "transition-[opacity,background-color,color,border-color] duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none",
            GHOST_HOVER_CLASSNAME,
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            showExpandedHeaderRows ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          <PanelLeftIcon className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className="px-2 pt-2">
        <AdminScopeSwitcher
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
  value: AdminSidebarTopTab;
  onValueChange: (next: AdminSidebarTopTab) => void;
  navItems: readonly AdminNavItem[];
  showInboxBadge?: boolean;
  unreadInboxCount?: number;
  commandScope?: CommandScope;
  browseProjects?: readonly SidebarBrowseProject[];
  activeBrowseProjectId?: string | null;
}) {
  const { t } = useTranslation(["common"]);
  const navigate = useNavigate();
  const showExpandedHeaderRows = useSidebarExpandedHeaderRows();
  const [browseMenuOpen, setBrowseMenuOpen] = useState(false);
  const commandPalette = useAdminCommandPalette({
    navItems: props.navItems,
    scope:
      props.commandScope ??
      ({
        kind: "none",
        pathname: "/",
        workspaceId: null,
        projectId: null,
      } as const),
  });
  const handleTabChange = (next: string) => {
    if (next === "browse" || next === "inbox" || next === "chat") {
      props.onValueChange(next);
    }
  };
  const browseLabel = t("common:SIDEBAR_TOP_TAB_BROWSE");
  const inboxLabel = t("nav:NAV_INBOX");
  const chatLabel = t("common:SIDEBAR_TOP_TAB_CHAT");
  const unreadInboxCount = props.showInboxBadge ? (props.unreadInboxCount ?? 0) : 0;
  const showUnreadInboxBadge = unreadInboxCount > 0;
  const unreadInboxCountLabel = unreadInboxCount > 99 ? "99+" : String(unreadInboxCount);
  const activeBrowseProject =
    props.activeBrowseProjectId != null
      ? ((props.browseProjects ?? []).find(
          (project) => project.projectId === props.activeBrowseProjectId,
        ) ?? null)
      : null;
  const inboxTabClassName = cn(
    "relative h-10 min-w-10 rounded-md border border-transparent bg-transparent text-callout font-semibold",
    "transition-[width,padding,color,background-color,border-color] duration-200 ease-out",
    GHOST_HOVER_CLASSNAME,
    "data-[state=active]:justify-start data-[state=active]:gap-2 data-[state=active]:px-3",
    showUnreadInboxBadge ? "data-[state=active]:pr-6" : undefined,
    GHOST_ACTIVE_CLASSNAME,
    showUnreadInboxBadge
      ? "data-[state=inactive]:w-11 data-[state=inactive]:justify-center data-[state=inactive]:px-0"
      : "data-[state=inactive]:w-10 data-[state=inactive]:justify-center data-[state=inactive]:px-0",
    "data-[state=inactive]:text-label-secondary",
  );
  const browseMenuProjects = activeBrowseProject
    ? (props.browseProjects ?? []).filter(
        (project) => project.workspaceId === activeBrowseProject.workspaceId,
      )
    : (props.browseProjects ?? []);
  const isBrowseActive = props.value === "browse";
  const isInboxActive = props.value === "inbox";
  const isChatActive = props.value === "chat";
  const browseTabClassName = cn(
    "h-10 min-w-10 rounded-md border border-transparent bg-transparent text-callout font-semibold",
    "transition-[width,padding,color,background-color,border-color] duration-200 ease-out",
    GHOST_HOVER_CLASSNAME,
    "data-[state=active]:justify-start data-[state=active]:gap-2 data-[state=active]:px-3",
    GHOST_ACTIVE_CLASSNAME,
    "data-[state=inactive]:w-10 data-[state=inactive]:justify-center data-[state=inactive]:px-0 data-[state=inactive]:text-label-secondary",
    BROWSE_TAB_ACTIVE_MAX_WIDTH_CLASSNAME,
  );

  useEffect(() => {
    if (!isBrowseActive) {
      setBrowseMenuOpen(false);
    }
  }, [isBrowseActive]);

  const handleBrowseMenuOpenChange = (nextOpen: boolean) => {
    if (!isBrowseActive && nextOpen) return;
    setBrowseMenuOpen(nextOpen);
  };

  const handleProjectSelect = (projectId: string) => {
    void navigate({ to: projectHomePath(projectId) as never });
  };

  const handleHomeSelect = () => {
    void navigate({ to: "/" as never });
  };

  const handleAllProjectsSelect = () => {
    void navigate({ to: projectsHomePath() as never });
  };

  if (!showExpandedHeaderRows) {
    return null;
  }

  const browseTabContent = (
    <>
      <TooltipTrigger asChild focusTrigger={false}>
        <span className="inline-flex items-center justify-center">
          <PanelsTopLeft className="size-4 shrink-0" aria-hidden="true" />
        </span>
      </TooltipTrigger>
      <span className={cn("min-w-0 truncate", isBrowseActive ? "inline" : "hidden")}>
        {browseLabel}
      </span>
    </>
  );

  const renderActivePillFrame = (children: React.ReactNode) => (
    <ButtonPrimitive asChild tapScale={ACTIVE_PILL_TAP_SCALE}>
      <div data-slot="button" data-active-pill-button="" className="min-w-0">
        {children}
      </div>
    </ButtonPrimitive>
  );

  return (
    <div className="px-2 py-2 pr-3">
      <div className="flex items-center gap-2">
        <Tabs value={props.value} onValueChange={handleTabChange} className="min-w-0 flex-1">
          <TabsList
            aria-label={t("common:SIDEBAR_TOP_TABS_LABEL")}
            className={cn(
              "h-10 w-full justify-start gap-1 rounded-md bg-transparent p-0 text-label-secondary",
            )}
          >
            {isBrowseActive ? (
              <DropdownMenu open={browseMenuOpen} onOpenChange={handleBrowseMenuOpenChange}>
                <Tooltip>
                  <DropdownMenuTrigger asChild>
                    {renderActivePillFrame(
                      <TabsTrigger value="browse" className={browseTabClassName}>
                        {browseTabContent}
                      </TabsTrigger>,
                    )}
                  </DropdownMenuTrigger>
                  <TooltipContent hidden={isBrowseActive}>{browseLabel}</TooltipContent>
                </Tooltip>
                <DropdownMenuContent
                  align="start"
                  side="bottom"
                  sideOffset={8}
                  className="w-[calc(100vw-2rem)] max-w-[16rem]"
                >
                  <ProjectBrowseMenuContent
                    projects={browseMenuProjects}
                    activeProjectId={props.activeBrowseProjectId}
                    descriptionFallback={t("common:SIDEBAR_BROWSE_PROJECT_DESCRIPTION_FALLBACK")}
                    allProjectsLabel={t("nav:NAV_ALL_PROJECTS")}
                    homeLabel={t("nav:NAV_HOME")}
                    onProjectSelect={handleProjectSelect}
                    onAllProjectsSelect={handleAllProjectsSelect}
                    onHomeSelect={handleHomeSelect}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Tooltip>
                <TabsTrigger value="browse" className={browseTabClassName}>
                  {browseTabContent}
                </TabsTrigger>
                <TooltipContent hidden={isBrowseActive}>{browseLabel}</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              {props.value === "inbox" ? (
                renderActivePillFrame(
                  <TabsTrigger value="inbox" className={inboxTabClassName}>
                    <TooltipTrigger asChild focusTrigger={false}>
                      <span className="inline-flex items-center justify-center">
                        <Inbox className="size-4 shrink-0" aria-hidden="true" />
                      </span>
                    </TooltipTrigger>
                    {showUnreadInboxBadge ? (
                      props.value === "inbox" ? (
                        <span
                          data-testid="sidebar-inbox-count-badge"
                          className="absolute right-2 top-1.5 inline-flex h-3 min-w-3 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-semibold text-white"
                          aria-hidden="true"
                        >
                          {unreadInboxCountLabel}
                        </span>
                      ) : (
                        <span
                          data-testid="sidebar-inbox-dot"
                          className="absolute right-1.5 top-1.5 size-2 rounded-full bg-red-500"
                          aria-hidden="true"
                        />
                      )
                    ) : null}
                    <span className={cn("truncate", isInboxActive ? "inline" : "hidden")}>
                      {inboxLabel}
                    </span>
                  </TabsTrigger>,
                )
              ) : (
                <TabsTrigger value="inbox" className={inboxTabClassName}>
                  <TooltipTrigger asChild focusTrigger={false}>
                    <span className="inline-flex items-center justify-center">
                      <Inbox className="size-4 shrink-0" aria-hidden="true" />
                    </span>
                  </TooltipTrigger>
                  {showUnreadInboxBadge ? (
                    isInboxActive ? (
                      <span
                        data-testid="sidebar-inbox-count-badge"
                        className="absolute right-2 top-1.5 inline-flex h-3 min-w-3 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-semibold text-white"
                        aria-hidden="true"
                      >
                        {unreadInboxCountLabel}
                      </span>
                    ) : (
                      <span
                        data-testid="sidebar-inbox-dot"
                        className="absolute right-1.5 top-1.5 size-2 rounded-full bg-red-500"
                        aria-hidden="true"
                      />
                    )
                  ) : null}
                  <span className={cn("truncate", isInboxActive ? "inline" : "hidden")}>
                    {inboxLabel}
                  </span>
                </TabsTrigger>
              )}
              <TooltipContent hidden={isInboxActive}>{inboxLabel}</TooltipContent>
            </Tooltip>
            <Tooltip>
              {isChatActive ? (
                renderActivePillFrame(
                  <TabsTrigger
                    value="chat"
                    className={cn(
                      "h-10 min-w-10 rounded-md border border-transparent bg-transparent text-callout font-semibold",
                      "transition-[width,padding,color,background-color,border-color] duration-200 ease-out",
                      GHOST_HOVER_CLASSNAME,
                      "data-[state=active]:justify-start data-[state=active]:gap-2 data-[state=active]:px-3",
                      GHOST_ACTIVE_CLASSNAME,
                      "data-[state=inactive]:w-10 data-[state=inactive]:justify-center data-[state=inactive]:px-0 data-[state=inactive]:text-label-secondary",
                    )}
                  >
                    <TooltipTrigger asChild focusTrigger={false}>
                      <span className="inline-flex items-center justify-center">
                        <MessageCircle className="size-4 shrink-0" aria-hidden="true" />
                      </span>
                    </TooltipTrigger>
                    <span className={cn("truncate", isChatActive ? "inline" : "hidden")}>
                      {chatLabel}
                    </span>
                  </TabsTrigger>,
                )
              ) : (
                <TabsTrigger
                  value="chat"
                  className={cn(
                    "h-10 min-w-10 rounded-md border border-transparent bg-transparent text-callout font-semibold",
                    "transition-[width,padding,color,background-color,border-color] duration-200 ease-out",
                    GHOST_HOVER_CLASSNAME,
                    "data-[state=active]:justify-start data-[state=active]:gap-2 data-[state=active]:px-3",
                    GHOST_ACTIVE_CLASSNAME,
                    "data-[state=inactive]:w-10 data-[state=inactive]:justify-center data-[state=inactive]:px-0 data-[state=inactive]:text-label-secondary",
                  )}
                >
                  <TooltipTrigger asChild focusTrigger={false}>
                    <span className="inline-flex items-center justify-center">
                      <MessageCircle className="size-4 shrink-0" aria-hidden="true" />
                    </span>
                  </TooltipTrigger>
                  <span className={cn("truncate", isChatActive ? "inline" : "hidden")}>
                    {chatLabel}
                  </span>
                </TabsTrigger>
              )}
              <TooltipContent hidden={isChatActive}>{chatLabel}</TooltipContent>
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
          className="h-10 w-10 shrink-0 rounded-xl"
        />
      </div>
    </div>
  );
}

function AdminSidebarContentArea(props: {
  activeTab: AdminSidebarTopTab;
  assistantAvailable: boolean;
  showMenuSkeleton: boolean;
  mainItems: readonly AdminNavItem[];
  browseProjects?: readonly SidebarBrowseProject[];
  favoriteWorkspaceBase?: string | null;
  favoriteDynamicLabels?: FavoriteDynamicLabelIndex;
  resolvePermissionName?: (code: string) => string | null;
  pathnameOverride?: string;
}) {
  const { t } = useTranslation("common");
  const showExpandedContent = useSidebarExpandedHeaderRows();
  const menuTreeKey = useMemo(
    () =>
      props.showMenuSkeleton
        ? "skeleton"
        : props.mainItems.map(getSidebarMenuTreeItemKey).join("|"),
    [props.mainItems, props.showMenuSkeleton],
  );
  const mainMenu = props.showMenuSkeleton ? (
    <AdminSidebarMainMenuSkeleton />
  ) : (
    <AdminSiderNav
      items={props.mainItems}
      favoriteWorkspaceBase={props.favoriteWorkspaceBase}
      favoriteDynamicLabels={props.favoriteDynamicLabels}
      showFavorites
      resolvePermissionName={props.resolvePermissionName}
      pathnameOverride={props.pathnameOverride}
    />
  );

  const browseContent = (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={menuTreeKey}
            data-testid="sidebar-menu-tree"
            data-menu-tree-key={menuTreeKey}
            className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-auto scrollbar-none"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={SIDEBAR_CONTENT_TRANSITION}
          >
            {mainMenu}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );

  const chatContent = props.assistantAvailable ? (
    <AgentThreadSidebar projects={props.browseProjects} />
  ) : (
    <Empty className="min-h-0 flex-1 px-4 py-8">
      <EmptyHeader className="max-w-[14rem] gap-0">
        <EmptyMedia variant="icon" className="mb-4 text-label-secondary">
          <MessageCircle className="size-5" aria-hidden="true" />
        </EmptyMedia>
        <h3>
          <EmptyTitle className="text-callout font-semibold text-label-primary">
            {t("common:SIDEBAR_CHAT_EMPTY_TITLE")}
          </EmptyTitle>
        </h3>
        <EmptyDescription className="mt-2 text-footnote">
          {t("common:SIDEBAR_CHAT_EMPTY_DESC")}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
  const visibleTab = showExpandedContent ? props.activeTab : "browse";

  const activeContent =
    visibleTab === "browse" ? (
      browseContent
    ) : visibleTab === "inbox" ? (
      <AdminSidebarInbox />
    ) : (
      chatContent
    );

  return (
    <SidebarContent className="relative z-10 overflow-hidden px-2 scrollbar-none">
      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={visibleTab}
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
  showInboxBadge,
  unreadInboxCount,
  commandScope,
  browseProjects,
  activeBrowseProjectId,
  favoriteWorkspaceBase,
  favoriteDynamicLabels,
  resolvePermissionName,
  pathnameOverride,
  collapsible = "icon",
  railAriaLabel,
  className,
  assistantAvailable = false,
}: AdminSidebarShellProps) {
  const { t } = useTranslation("common");
  const showFailureSkeleton = showOrgNavErrorOverlay;
  const showMenuSkeleton = showNavSkeleton || showFailureSkeleton;
  const [activeTab, setActiveTab] = useState<AdminSidebarTopTab>("browse");

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
        showInboxBadge={showInboxBadge}
        unreadInboxCount={unreadInboxCount}
        commandScope={commandScope}
        browseProjects={browseProjects}
        activeBrowseProjectId={activeBrowseProjectId}
      />
      <AdminSidebarContentArea
        activeTab={activeTab}
        assistantAvailable={assistantAvailable}
        showMenuSkeleton={showMenuSkeleton}
        mainItems={mainItems}
        browseProjects={browseProjects}
        favoriteWorkspaceBase={favoriteWorkspaceBase}
        favoriteDynamicLabels={favoriteDynamicLabels}
        resolvePermissionName={resolvePermissionName}
        pathnameOverride={pathnameOverride}
      />
      {collapsible !== "none" ? (
        <SidebarRail aria-label={railAriaLabel ?? t("common:SIDEBAR_RESIZE")} />
      ) : null}
    </Sidebar>
  );
}
