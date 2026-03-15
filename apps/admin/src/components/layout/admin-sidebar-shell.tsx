import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";

import type { AdminNavItem } from "@/types/admin-nav";
import { AdminSiderNav } from "@/components/layout/admin-side-nav";
import { AdminWorkspaceSwitcher } from "@/components/layout/admin-workspace-switcher";
import {
  AdminSidebarFooterMenuSkeleton,
  AdminSidebarHeaderSkeleton,
  AdminSidebarMainMenuSkeleton,
} from "@/components/layout/admin-sidebar-skeleton";
import GradualBlur from "@/components/ui/gradual-blur";
import { Sidebar, SidebarContent, SidebarHeader } from "@celestial/ui/sidebar";
import { cn } from "@celestial/lib/utils";

export type AdminSidebarShellProps = {
  showNavSkeleton: boolean;
  showOrgNavErrorOverlay: boolean;
  mainItems: readonly AdminNavItem[];
  footerItems: readonly AdminNavItem[];
  resolvePermissionName?: (code: string) => string | null;
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

function AdminSidebarHeaderArea(props: { showFailureSkeleton: boolean }) {
  return (
    <SidebarHeader
      className={cn(
        "relative z-10 flex w-full items-center gap-2 px-2.5 py-2",
        "h-14 justify-start",
        "transition-[padding] duration-400 ease-[cubic-bezier(0.75,0,0.25,1)] motion-reduce:transition-none",
      )}
    >
      {props.showFailureSkeleton ? (
        <AdminSidebarHeaderSkeleton />
      ) : (
        <AdminWorkspaceSwitcher
          className="min-w-0 flex-1 group-data-[collapsible=icon]:flex-none"
          showSidebarToggle={false}
        />
      )}
    </SidebarHeader>
  );
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
  footerItems: readonly AdminNavItem[];
  resolvePermissionName?: (code: string) => string | null;
}) {
  const bottomBlur = useSidebarBottomBlurState({
    showMenuSkeleton: props.showMenuSkeleton,
    mainItemCount: props.mainItems.length,
    footerItemCount: props.footerItems.length,
  });

  const mainMenu = props.showMenuSkeleton ? (
    <AdminSidebarMainMenuSkeleton />
  ) : (
    <AdminSiderNav items={props.mainItems} resolvePermissionName={props.resolvePermissionName} />
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
  footerItems,
  resolvePermissionName,
  className,
}: AdminSidebarShellProps) {
  const showFailureSkeleton = showOrgNavErrorOverlay;
  const showMenuSkeleton = showNavSkeleton || showFailureSkeleton;

  return (
    <Sidebar
      collapsible="icon"
      animateOnHover={false}
      className={cn("relative isolate z-40", className)}
    >
      <AdminSidebarHeaderArea showFailureSkeleton={showFailureSkeleton} />
      <AdminSidebarContentArea
        showMenuSkeleton={showMenuSkeleton}
        showFailureSkeleton={showFailureSkeleton}
        mainItems={mainItems}
        footerItems={footerItems}
        resolvePermissionName={resolvePermissionName}
      />
    </Sidebar>
  );
}
