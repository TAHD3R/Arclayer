import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouterState } from "@tanstack/react-router";
import { Star } from "lucide-react";

import type { AdminNavItem } from "@/types/admin-nav";
import type { FavoriteNode } from "@/types/stores/favorites";
import { cn } from "@arclayer/lib/utils";
import { useFavoritesStore } from "@/stores/use-favorites-store";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { navGroupCollapseKey, useSidebarNavStore } from "@/stores/use-sidebar-nav-store";
import { SidebarGroup, SidebarGroupContent, SidebarMenu, useSidebar } from "@arclayer/ui/sidebar";
import {
  buildNavIndex,
  collectDefaultExpandedGroupKeys,
  collectGroupKeys,
  findActiveTrail,
  isExactMatch,
  isPrefixMatch,
  normalizePath,
  type OpenGroupKeys,
} from "./nav-utils";
import { resolveFavoriteNavItems } from "./favorite-nav-items";
import { NavNodeList } from "./nav-node";
import { NAV_ROOT_MENU_GAP_CLASSNAME } from "./nav-utils";
import {
  buildFavoriteAdminChildren,
  favoriteNavItemMatchesPath,
  flattenFavoriteNavItems,
  type FavoriteDynamicLabelIndex,
  type FavoriteNavNode,
} from "./favorite-nav-items";

type AdminSiderNavProps = {
  items?: readonly AdminNavItem[];
  favoriteWorkspaceBase?: string | null;
  favoriteDynamicLabels?: FavoriteDynamicLabelIndex;
  showFavorites?: boolean;
  resolvePermissionName?: (code: string) => string | null;
  pathnameOverride?: string;
  className?: string;
};

type AdminSiderNavState = {
  pathname: string;
  items: readonly AdminNavItem[];
  commandNavItems: readonly AdminNavItem[];
  activeSource: ActiveSource;
  activeKeys: ReadonlySet<string>;
  baseActiveKeys: ReadonlySet<string>;
  starredActiveKeys: ReadonlySet<string>;
  suppressedKeys: ReadonlySet<string>;
  openGroupKeys: OpenGroupKeys;
  openChainForKey: (key: string) => void;
  collapsedNavKeys: ReadonlySet<string>;
  toggleSection: (key: string) => void;
  selectActiveSource: (source: "base" | "starred", targetPath?: string) => void;
  collapsedMode: boolean;
};

type ActiveSource = "base" | "starred";

function buildStarredItem(items: FavoriteNavNode[], pathname: string): AdminNavItem {
  return {
    key: "favorites",
    label: "Favorites",
    labelKey: "nav:NAV_FAVORITES",
    icon: Star,
    isActive: flattenFavoriteNavItems(items).some((item) =>
      favoriteNavItemMatchesPath(item, pathname),
    ),
    children: buildFavoriteAdminChildren(items, pathname),
  };
}

function injectStarredItem(
  items: readonly AdminNavItem[],
  starredItem: AdminNavItem | null,
): AdminNavItem[] {
  if (!starredItem) return [...items];
  const explicitAnchorIndex = items.findIndex((item) => item.insertStarredAfter);
  if (explicitAnchorIndex >= 0) {
    return [
      ...items.slice(0, explicitAnchorIndex + 1),
      starredItem,
      ...items.slice(explicitAnchorIndex + 1),
    ];
  }
  const [firstItem, ...rest] = items;
  if (firstItem && !firstItem.children?.length) {
    return [firstItem, starredItem, ...rest];
  }
  return [starredItem, ...items];
}

function hasExactNavMatch(items: readonly AdminNavItem[], pathname: string): boolean {
  const walk = (nodes: readonly AdminNavItem[]): boolean => {
    for (const item of nodes) {
      const candidates = [item.to, ...(item.activeMatchPaths ?? [])].filter(
        (value): value is string => Boolean(value),
      );
      if (candidates.some((candidate) => isExactMatch(candidate, pathname))) return true;
      if (item.children?.length && walk(item.children)) return true;
    }
    return false;
  };
  return walk(items);
}

function useOpenChain(items: readonly AdminNavItem[]) {
  const allGroupKeys = useMemo(() => collectGroupKeys(items), [items]);
  const defaultExpandedGroupKeys = useMemo(() => collectDefaultExpandedGroupKeys(items), [items]);
  const navIndex = useMemo(() => buildNavIndex(items), [items]);
  const collapsedKeys = useSidebarNavStore((state) => state.collapsedKeys);
  const toggleCollapsed = useSidebarNavStore((state) => state.toggleCollapsed);
  const expand = useSidebarNavStore((state) => state.expand);
  const collapsedNavKeys = useMemo(() => new Set(collapsedKeys), [collapsedKeys]);
  const openGroupKeys = useMemo(
    () =>
      new Set(
        [...defaultExpandedGroupKeys].filter(
          (key) => !collapsedNavKeys.has(navGroupCollapseKey(key)),
        ),
      ),
    [collapsedNavKeys, defaultExpandedGroupKeys],
  );

  const openChainForKey = useCallback(
    (key: string) => {
      const entry = navIndex.get(key);
      if (!entry) return;

      if (entry.isGroup) {
        toggleCollapsed(navGroupCollapseKey(entry.key));
        return;
      }

      const parentCollapseKeys: string[] = [];
      let currentParent = entry.parentKey;
      while (currentParent !== "__root__") {
        if (!allGroupKeys.has(currentParent)) break;
        parentCollapseKeys.push(navGroupCollapseKey(currentParent));
        const parentEntry = navIndex.get(currentParent);
        if (!parentEntry) break;
        currentParent = parentEntry.parentKey;
      }
      expand(parentCollapseKeys);
    },
    [allGroupKeys, expand, navIndex, toggleCollapsed],
  );

  return { collapsedNavKeys, openGroupKeys, openChainForKey, toggleSection: toggleCollapsed };
}

function useDisplayItems(
  props: Pick<
    AdminSiderNavProps,
    "items" | "favoriteWorkspaceBase" | "favoriteDynamicLabels" | "showFavorites"
  >,
  currentPath: string,
) {
  const { t, i18n } = useTranslation();
  const storedFavoriteTree = useFavoritesStore((state) => state.items);
  const favoritePaths = useFavoritesStore((state) => state.paths);
  const favoriteTree = useMemo(
    () =>
      storedFavoriteTree.length > 0
        ? storedFavoriteTree
        : favoritePaths.map(
            (path) =>
              ({
                id: `item:${normalizePath(path)}`,
                type: "item",
                path: normalizePath(path),
              }) satisfies FavoriteNode,
          ),
    [favoritePaths, storedFavoriteTree],
  );
  const baseItems = props.items ?? [];
  const sidebarItemVisibility = usePreferencesStore((state) => state.sidebarItemVisibility);
  const favoriteItems = useMemo(
    () =>
      resolveFavoriteNavItems({
        favorites: favoriteTree,
        items: baseItems,
        t,
        workspaceBase: props.favoriteWorkspaceBase,
        dynamicLabels: props.favoriteDynamicLabels,
      }),
    [
      favoriteTree,
      baseItems,
      props.favoriteWorkspaceBase,
      props.favoriteDynamicLabels,
      i18n.language,
      i18n.resolvedLanguage,
      t,
    ],
  );
  const starredItem = useMemo(
    () =>
      props.showFavorites && sidebarItemVisibility.favorites
        ? buildStarredItem(favoriteItems, currentPath)
        : null,
    [currentPath, favoriteItems, props.showFavorites, sidebarItemVisibility.favorites],
  );
  const displayItems = useMemo(
    () => injectStarredItem(baseItems, starredItem),
    [baseItems, starredItem],
  );

  return {
    baseItems,
    favoriteItems,
    starredItem,
    displayItems,
  };
}

function useAdminSiderNavState(props: AdminSiderNavProps): AdminSiderNavState {
  const { state: sidebarState, isMobile } = useSidebar();
  const location = useRouterState({
    select: (state) => ({
      pathname: state.location.pathname,
      searchStr: state.location.searchStr,
    }),
    structuralSharing: true,
  });
  const pathname = location.pathname;
  const currentPath = `${location.pathname}${location.searchStr ?? ""}`;
  const activePathname = props.pathnameOverride ?? pathname;
  const activeFavoritePath = props.pathnameOverride ?? currentPath;
  const { baseItems, favoriteItems, starredItem, displayItems } = useDisplayItems(
    props,
    activeFavoritePath,
  );
  const baseActiveTrail = useMemo(
    () => findActiveTrail(baseItems, activePathname),
    [activePathname, baseItems],
  );
  const baseActiveKeys = useMemo(() => new Set(baseActiveTrail), [baseActiveTrail]);
  const starredActive = useMemo(
    () =>
      flattenFavoriteNavItems(favoriteItems).some((item) =>
        favoriteNavItemMatchesPath(item, activeFavoritePath),
      ),
    [activeFavoritePath, favoriteItems],
  );
  const starredActiveHasQuery = useMemo(
    () =>
      flattenFavoriteNavItems(favoriteItems).some(
        (item) => favoriteNavItemMatchesPath(item, activeFavoritePath) && /[?#]/.test(item.path),
      ),
    [activeFavoritePath, favoriteItems],
  );
  const starredActiveTrail = useMemo(
    () => (starredItem && starredActive ? findActiveTrail([starredItem], activeFavoritePath) : []),
    [activeFavoritePath, starredActive, starredItem],
  );
  const starredActiveKeys = useMemo(() => new Set(starredActiveTrail), [starredActiveTrail]);
  const baseHasExactMatch = useMemo(
    () => hasExactNavMatch(baseItems, activePathname),
    [activePathname, baseItems],
  );
  const [sourcePreference, setSourcePreference] = useState<{
    targetPath: string;
    source: ActiveSource;
  } | null>(null);
  const preferBasePrefixMatch =
    starredActive && baseActiveTrail.length > 0 && !baseHasExactMatch && !starredActiveHasQuery;
  const activeSource: ActiveSource =
    sourcePreference && isPrefixMatch(sourcePreference.targetPath, activePathname)
      ? sourcePreference.source
      : starredActive && !preferBasePrefixMatch
        ? "starred"
        : "base";
  const activeTrail = activeSource === "starred" ? starredActiveTrail : baseActiveTrail;
  const activeKeys = useMemo(() => new Set(activeTrail), [activeTrail]);
  const suppressedKeys = useMemo(
    () =>
      new Set(
        !starredActive
          ? []
          : activeSource === "starred"
            ? baseActiveTrail
            : starredActiveTrail.length > 0
              ? starredActiveTrail
              : ["favorites"],
      ),
    [activeSource, baseActiveTrail, starredActive, starredActiveTrail],
  );
  const { collapsedNavKeys, openGroupKeys, openChainForKey, toggleSection } =
    useOpenChain(displayItems);
  const isCollapsed = sidebarState === "collapsed" && !isMobile;
  const selectActiveSource = useCallback(
    (source: ActiveSource, targetPath?: string) =>
      setSourcePreference({ targetPath: normalizePath(targetPath ?? activePathname), source }),
    [activePathname],
  );

  return {
    pathname: activePathname,
    items: displayItems,
    commandNavItems: baseItems,
    activeSource,
    activeKeys,
    baseActiveKeys,
    starredActiveKeys,
    suppressedKeys,
    openGroupKeys,
    openChainForKey,
    collapsedNavKeys,
    toggleSection,
    selectActiveSource,
    collapsedMode: isCollapsed,
  };
}

function NavItemsTree(props: {
  items: readonly AdminNavItem[];
  commandNavItems: readonly AdminNavItem[];
  pathname: string;
  activeSource: ActiveSource;
  activeKeys: ReadonlySet<string>;
  baseActiveKeys: ReadonlySet<string>;
  starredActiveKeys: ReadonlySet<string>;
  suppressedKeys: ReadonlySet<string>;
  openGroupKeys: OpenGroupKeys;
  openChainForKey: (key: string) => void;
  collapsedNavKeys: ReadonlySet<string>;
  toggleSection: (key: string) => void;
  selectActiveSource: (source: ActiveSource, targetPath?: string) => void;
  resolvePermissionName?: (code: string) => string | null;
  isCollapsed: boolean;
}) {
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
          <NavNodeList
            items={props.items}
            commandNavItems={props.commandNavItems}
            depth={0}
            parentKey="__root__"
            pathname={props.pathname}
            activeSource={props.activeSource}
            activeKeys={props.activeKeys}
            baseActiveKeys={props.baseActiveKeys}
            starredActiveKeys={props.starredActiveKeys}
            suppressedKeys={props.suppressedKeys}
            openGroupKeys={props.openGroupKeys}
            openChainForKey={props.openChainForKey}
            collapsedNavKeys={props.collapsedNavKeys}
            onToggleSection={props.toggleSection}
            selectActiveSource={props.selectActiveSource}
            resolvePermissionName={props.resolvePermissionName}
            isCollapsed={props.isCollapsed}
            hoverDropdown={null}
          />
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
        commandNavItems={state.commandNavItems}
        pathname={state.pathname}
        activeSource={state.activeSource}
        activeKeys={state.activeKeys}
        baseActiveKeys={state.baseActiveKeys}
        starredActiveKeys={state.starredActiveKeys}
        suppressedKeys={state.suppressedKeys}
        openGroupKeys={state.openGroupKeys}
        openChainForKey={state.openChainForKey}
        collapsedNavKeys={state.collapsedNavKeys}
        toggleSection={state.toggleSection}
        selectActiveSource={state.selectActiveSource}
        resolvePermissionName={props.resolvePermissionName}
        isCollapsed={state.collapsedMode}
      />
    </nav>
  );
}
