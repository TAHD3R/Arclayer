import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";

import { useTranslation } from "react-i18next";
import type { AdminNavItem } from "@/types/admin-nav";
import { AdminSiderNav } from "@/components/layout/admin-side-nav";
import {
  AdminSidebarFooterMenuSkeleton,
  AdminSidebarMainMenuSkeleton,
} from "@/components/layout/admin-sidebar-skeleton";
import GradualBlur from "@/components/ui/gradual-blur";
import { Sidebar, SidebarContent, SidebarRail, useSidebar } from "@arclayer/ui/sidebar";
import { cn } from "@arclayer/lib/utils";

export type AdminSidebarShellProps = {
  showNavSkeleton: boolean;
  showOrgNavErrorOverlay: boolean;
  mainItems: readonly AdminNavItem[];
  favoriteWorkspaceBase?: string | null;
  footerItems: readonly AdminNavItem[];
  resolvePermissionName?: (code: string) => string | null;
  pathnameOverride?: string;
  collapsible?: "icon" | "none";
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

function useSidebarBottomBlurState(args: {
  showMenuSkeleton: boolean;
  mainItemCount: number;
  footerItemCount: number;
}) {
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
  }, [args.showMenuSkeleton, args.mainItemCount, args.footerItemCount]);

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

function AdminSidebarFooterMenuArea(props: {
  showFailureSkeleton: boolean;
  footerItems: readonly AdminNavItem[];
  resolvePermissionName?: (code: string) => string | null;
}) {
  if (props.footerItems.length === 0) return null;

  return (
    <div className="shrink-0 flex flex-col pb-2">
      {props.showFailureSkeleton ? (
        <AdminSidebarFooterMenuSkeleton />
      ) : (
        <AdminSiderNav
          items={props.footerItems}
          showFavorites={false}
          resolvePermissionName={props.resolvePermissionName}
          className="mt-0 mb-0"
        />
      )}
    </div>
  );
}

function AdminSidebarContentArea(props: {
  showMenuSkeleton: boolean;
  showFailureSkeleton: boolean;
  mainItems: readonly AdminNavItem[];
  favoriteWorkspaceBase?: string | null;
  footerItems: readonly AdminNavItem[];
  resolvePermissionName?: (code: string) => string | null;
  pathnameOverride?: string;
}) {
  const { state: sidebarState, isMobile } = useSidebar();
  const collapsedMenuMode = sidebarState === "collapsed" && !isMobile;
  const bottomBlur = useSidebarBottomBlurState({
    showMenuSkeleton: props.showMenuSkeleton,
    mainItemCount: props.mainItems.length,
    footerItemCount: props.footerItems.length,
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
    <SidebarContent
      inert={collapsedMenuMode ? true : undefined}
      aria-hidden={collapsedMenuMode ? "true" : undefined}
      className="relative z-10 px-2 overflow-hidden scrollbar-none"
    >
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
      <AdminSidebarFooterMenuArea
        showFailureSkeleton={props.showFailureSkeleton}
        footerItems={props.footerItems}
        resolvePermissionName={props.resolvePermissionName}
      />
    </SidebarContent>
  );
}

export function AdminSidebarShell({
  showNavSkeleton,
  showOrgNavErrorOverlay,
  mainItems,
  favoriteWorkspaceBase,
  footerItems,
  resolvePermissionName,
  pathnameOverride,
  collapsible = "icon",
  className,
}: AdminSidebarShellProps) {
  const { t } = useTranslation("common");
  const showFailureSkeleton = showOrgNavErrorOverlay;
  const showMenuSkeleton = showNavSkeleton || showFailureSkeleton;

  return (
    <Sidebar
      collapsible={collapsible}
      animateOnHover={false}
      className={cn("relative isolate z-40", className)}
    >
      <AdminSidebarContentArea
        showMenuSkeleton={showMenuSkeleton}
        showFailureSkeleton={showFailureSkeleton}
        mainItems={mainItems}
        favoriteWorkspaceBase={favoriteWorkspaceBase}
        footerItems={footerItems}
        resolvePermissionName={resolvePermissionName}
        pathnameOverride={pathnameOverride}
      />
      {collapsible !== "none" ? <SidebarRail aria-label={t("common:SIDEBAR_TOGGLE")} /> : null}
    </Sidebar>
  );
}
