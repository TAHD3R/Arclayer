import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";

import { MessageCircle, PanelLeft as PanelLeftIcon, PanelsTopLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AdminNavItem } from "@/types/admin-nav";
import { AdminCommandTrigger } from "@/components/layout/admin-command-trigger";
import { AdminFullLogo } from "@/components/layout/admin-logo";
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

export type AdminSidebarShellProps = {
  showNavSkeleton: boolean;
  showOrgNavErrorOverlay: boolean;
  mainItems: readonly AdminNavItem[];
  commandScope?: CommandScope;
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

type SidebarTopTab = "browse" | "chat";

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
        <AdminFullLogo
          to="/"
          ariaLabel="Arclayer"
          width={108}
          className="h-8 justify-start"
          imgClassName="h-8 w-auto object-contain"
        />
        <button
          type="button"
          aria-label={t("common:SIDEBAR_TOGGLE")}
          onClick={toggleSidebar}
          className={cn(
            "ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-transparent text-label-secondary",
            "transition-[background-color,color,border-color] duration-200",
            "hover:bg-accent/60 hover:text-label-primary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <PanelLeftIcon className="size-4" aria-hidden="true" />
        </button>
      </div>
      {showExpandedHeaderRows ? (
        <div className="px-2 pt-2">
          <AdminWorkspaceSwitcher
            variant="header"
            showSidebarToggle={false}
            className="flex w-full min-w-0"
          />
        </div>
      ) : null}
    </SidebarHeader>
  );
}

function AdminSidebarTopTabs(props: {
  navItems: readonly AdminNavItem[];
  commandScope?: CommandScope;
}) {
  const { t } = useTranslation("common");
  const showExpandedHeaderRows = useSidebarExpandedHeaderRows();
  const [tab, setTab] = useState<SidebarTopTab>("browse");
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
    if (next === "browse" || next === "chat") {
      setTab(next);
    }
  };

  if (!showExpandedHeaderRows) {
    return null;
  }

  const browseLabel = t("common:SIDEBAR_TOP_TAB_BROWSE");
  const chatLabel = t("common:SIDEBAR_TOP_TAB_CHAT");

  return (
    <div className="px-2 py-2 pr-3">
      <div className="flex items-center gap-2">
        <Tabs value={tab} onValueChange={handleTabChange} className="min-w-0 flex-1">
          <TabsList
            aria-label={t("common:SIDEBAR_TOP_TABS_LABEL")}
            className={cn(
              "h-9 w-full justify-start gap-1 rounded-xl bg-transparent p-0 text-label-secondary",
            )}
          >
            <Tooltip>
              <TabsTrigger
                value="browse"
                className={cn(
                  "h-9 min-w-9 rounded-xl border border-transparent bg-transparent text-callout font-semibold",
                  "transition-[width,padding,color,background-color,border-color] duration-200 ease-out",
                  "data-[state=active]:justify-start data-[state=active]:gap-2 data-[state=active]:bg-accent/70 data-[state=active]:px-3 data-[state=active]:text-label-primary data-[state=active]:shadow-sm",
                  "data-[state=inactive]:w-9 data-[state=inactive]:justify-center data-[state=inactive]:px-0 data-[state=inactive]:text-label-secondary",
                )}
              >
                <TooltipTrigger asChild focusTrigger={false}>
                  <span className="inline-flex items-center justify-center">
                    <PanelsTopLeft className="size-4 shrink-0" aria-hidden="true" />
                  </span>
                </TooltipTrigger>
                <span className={cn("truncate", tab === "browse" ? "inline" : "hidden")}>
                  {browseLabel}
                </span>
              </TabsTrigger>
              <TooltipContent hidden={tab === "browse"}>{browseLabel}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TabsTrigger
                value="chat"
                className={cn(
                  "h-9 min-w-9 rounded-xl border border-transparent bg-transparent text-callout font-semibold",
                  "transition-[width,padding,color,background-color,border-color] duration-200 ease-out",
                  "data-[state=active]:justify-start data-[state=active]:gap-2 data-[state=active]:bg-accent/70 data-[state=active]:px-3 data-[state=active]:text-label-primary data-[state=active]:shadow-sm",
                  "data-[state=inactive]:w-9 data-[state=inactive]:justify-center data-[state=inactive]:px-0 data-[state=inactive]:text-label-secondary",
                )}
              >
                <TooltipTrigger asChild focusTrigger={false}>
                  <span className="inline-flex items-center justify-center">
                    <MessageCircle className="size-4 shrink-0" aria-hidden="true" />
                  </span>
                </TooltipTrigger>
                <span className={cn("truncate", tab === "chat" ? "inline" : "hidden")}>
                  {chatLabel}
                </span>
              </TabsTrigger>
              <TooltipContent hidden={tab === "chat"}>{chatLabel}</TooltipContent>
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
  showMenuSkeleton: boolean;
  mainItems: readonly AdminNavItem[];
  favoriteWorkspaceBase?: string | null;
  resolvePermissionName?: (code: string) => string | null;
  pathnameOverride?: string;
}) {
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

  return (
    <SidebarContent className="relative z-10 px-2 overflow-hidden scrollbar-none">
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
    </SidebarContent>
  );
}

export function AdminSidebarShell({
  showNavSkeleton,
  showOrgNavErrorOverlay,
  mainItems,
  commandScope,
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

  return (
    <Sidebar
      collapsible={collapsible}
      animateOnHover={false}
      className={cn("relative isolate z-40 h-screen", className)}
    >
      <AdminSidebarBranding />
      <AdminSidebarTopTabs navItems={mainItems} commandScope={commandScope} />
      <AdminSidebarContentArea
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
