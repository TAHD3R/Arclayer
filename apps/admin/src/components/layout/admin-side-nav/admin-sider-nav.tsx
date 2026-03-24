import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouterState } from "@tanstack/react-router";
import { Star } from "@arclayer/ui/icons/lucide-animated";

import type { AdminNavItem } from "@/types/admin-nav";
import { cn } from "@arclayer/lib/utils";
import { useFavoritesStore } from "@/stores/use-favorites-store";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarSeparator,
  useSidebar,
} from "@arclayer/ui/sidebar";
import { buildNavIndex, findActiveTrail, isExactMatch, type OpenByParent } from "./nav-utils";
import { resolveFavoriteNavItems } from "./favorite-nav-items";
import { NavNode } from "./nav-node";
import { useCollapsedDropdownController } from "./collapsed-dropdown";
import { NAV_DIVIDER_CLASSNAME, NAV_ROOT_MENU_GAP_CLASSNAME } from "./nav-utils";

type AdminSiderNavProps = {
  items?: readonly AdminNavItem[];
  favoriteWorkspaceBase?: string | null;
  resolvePermissionName?: (code: string) => string | null;
  className?: string;
};

type AdminSiderNavState = {
  pathname: string;
  items: readonly AdminNavItem[];
  activeKeys: ReadonlySet<string>;
  openByParent: OpenByParent;
  openChainForKey: (key: string) => void;
  collapsedMode: boolean;
};

function deriveOpenByParent(activeTrail: readonly string[], items: readonly AdminNavItem[]) {
  const navIndex = buildNavIndex(items);
  const next: OpenByParent = {};

  for (const key of activeTrail) {
    const entry = navIndex.get(key);
    if (!entry?.isGroup) continue;
    next[entry.parentKey] = key;
  }

  return next;
}

function buildStarredItem(
  items: ReturnType<typeof resolveFavoriteNavItems>,
  pathname: string,
): AdminNavItem {
  return {
    key: "starred",
    label: "Starred",
    labelKey: "nav:NAV_STARRED",
    icon: Star,
    isActive: items.some((item) => isExactMatch(item.path, pathname)),
    children: items.map((item) => ({
      key: item.key,
      label: item.label,
      icon: item.Icon,
      to: item.path,
      isActive: isExactMatch(item.path, pathname),
    })),
  };
}

function injectStarredItem(
  items: readonly AdminNavItem[],
  starredItem: AdminNavItem | null,
): AdminNavItem[] {
  if (!starredItem) return [...items];
  const [firstItem, ...rest] = items;
  if (firstItem && !firstItem.children?.length) {
    return [firstItem, starredItem, ...rest];
  }
  return [starredItem, ...items];
}

function useOpenChain(activeTrail: readonly string[], items: readonly AdminNavItem[]) {
  const defaultOpenByParent = useMemo(
    () => deriveOpenByParent(activeTrail, items),
    [activeTrail, items],
  );
  const navIndex = useMemo(() => buildNavIndex(items), [items]);
  const [openByParent, setOpenByParent] = useState<OpenByParent>(defaultOpenByParent);

  useEffect(() => {
    setOpenByParent(defaultOpenByParent);
  }, [defaultOpenByParent]);

  const openChainForKey = useCallback(
    (key: string) => {
      setOpenByParent((prev) => {
        const entry = navIndex.get(key);
        if (!entry) return prev;
        if (entry.isGroup && prev[entry.parentKey] === key) {
          const next = { ...prev };
          delete next[entry.parentKey];
          return next;
        }
        const next: OpenByParent = {};
        let current = key;
        for (;;) {
          const found = navIndex.get(current);
          if (!found) break;
          if (found.isGroup) next[found.parentKey] = current;
          if (found.parentKey === "__root__") break;
          current = found.parentKey;
        }
        return next;
      });
    },
    [navIndex],
  );

  return { openByParent, openChainForKey };
}

function useDisplayItems(
  props: Pick<AdminSiderNavProps, "items" | "favoriteWorkspaceBase">,
  pathname: string,
) {
  const { t, i18n } = useTranslation();
  const favoritePaths = useFavoritesStore((state) => state.paths);
  const baseItems = props.items ?? [];
  const favoriteItems = useMemo(
    () =>
      resolveFavoriteNavItems({
        favoritePaths,
        items: baseItems,
        t,
        workspaceBase: props.favoriteWorkspaceBase,
      }),
    [
      favoritePaths,
      baseItems,
      props.favoriteWorkspaceBase,
      i18n.language,
      i18n.resolvedLanguage,
      t,
    ],
  );
  const starredItem = useMemo(
    () => (favoriteItems.length > 0 ? buildStarredItem(favoriteItems, pathname) : null),
    [favoriteItems, pathname],
  );
  const displayItems = useMemo(
    () => injectStarredItem(baseItems, starredItem),
    [baseItems, starredItem],
  );

  return {
    baseItems,
    displayItems,
  };
}

function useAdminSiderNavState(props: AdminSiderNavProps): AdminSiderNavState {
  const { state: sidebarState, isMobile } = useSidebar();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { baseItems, displayItems } = useDisplayItems(props, pathname);
  const activeTrail = useMemo(() => findActiveTrail(baseItems, pathname), [baseItems, pathname]);
  const activeKeys = useMemo(() => new Set(activeTrail), [activeTrail]);
  const { openByParent, openChainForKey } = useOpenChain(activeTrail, displayItems);
  const isCollapsed = sidebarState === "collapsed" && !isMobile;

  return {
    pathname,
    items: displayItems,
    activeKeys,
    openByParent,
    openChainForKey,
    collapsedMode: isCollapsed,
  };
}

function NavItemsTree(props: {
  items: readonly AdminNavItem[];
  pathname: string;
  activeKeys: ReadonlySet<string>;
  openByParent: OpenByParent;
  openChainForKey: (key: string) => void;
  resolvePermissionName?: (code: string) => string | null;
  isCollapsed: boolean;
}) {
  const hoverDropdown = useCollapsedDropdownController();

  return (
    <SidebarGroup className="p-0">
      <SidebarGroupContent>
        <SidebarMenu
          className={cn(
            "px-0",
            NAV_ROOT_MENU_GAP_CLASSNAME,
            "transition-[gap] duration-320 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          )}
        >
          {props.items.map((item) => (
            <Fragment key={item.key}>
              <NavNode
                item={item}
                depth={0}
                parentKey="__root__"
                pathname={props.pathname}
                activeKeys={props.activeKeys}
                openByParent={props.openByParent}
                openChainForKey={props.openChainForKey}
                resolvePermissionName={props.resolvePermissionName}
                isCollapsed={props.isCollapsed}
                hoverDropdown={props.isCollapsed ? hoverDropdown : null}
              />
              {item.dividerAfter ? <SidebarSeparator className={NAV_DIVIDER_CLASSNAME} /> : null}
            </Fragment>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AdminSiderNav(props: AdminSiderNavProps) {
  const state = useAdminSiderNavState(props);

  return (
    <nav className={cn("mt-4 mb-8", props.className)}>
      <NavItemsTree
        items={state.items}
        pathname={state.pathname}
        activeKeys={state.activeKeys}
        openByParent={state.openByParent}
        openChainForKey={state.openChainForKey}
        resolvePermissionName={props.resolvePermissionName}
        isCollapsed={state.collapsedMode}
      />
    </nav>
  );
}
