import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouterState } from "@tanstack/react-router";
import { Star } from "lucide-react";

import type { AdminNavItem } from "@/types/admin-nav";
import type { FavoriteNode } from "@/types/stores/favorites";
import { cn } from "@arclayer/lib/utils";
import { useFavoritesStore } from "@/stores/use-favorites-store";
import { usePreferencesStore } from "@/stores/use-preference-store";
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
import { NavNode } from "./nav-node";
import { NAV_ROOT_MENU_GAP_CLASSNAME } from "./nav-utils";
import { NavDivider, NavGroupMarker, resolveLeadingLabel } from "./nav-markers";
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
  const initializedDefaultGroupKeysRef = useRef<Set<string>>(new Set(defaultExpandedGroupKeys));
  const [openGroupKeys, setOpenGroupKeys] = useState<Set<string>>(
    () => new Set(defaultExpandedGroupKeys),
  );

  useEffect(() => {
    setOpenGroupKeys((prev) => {
      const next = new Set<string>();
      for (const key of prev) {
        if (allGroupKeys.has(key)) next.add(key);
      }
      for (const key of defaultExpandedGroupKeys) {
        if (initializedDefaultGroupKeysRef.current.has(key)) continue;
        next.add(key);
      }

      initializedDefaultGroupKeysRef.current = new Set(
        [...initializedDefaultGroupKeysRef.current, ...defaultExpandedGroupKeys].filter((key) =>
          allGroupKeys.has(key),
        ),
      );

      if (next.size === prev.size) {
        let changed = false;
        for (const key of prev) {
          if (!next.has(key)) {
            changed = true;
            break;
          }
        }
        if (!changed) return prev;
      }
      return next;
    });
  }, [allGroupKeys, defaultExpandedGroupKeys]);

  const openChainForKey = useCallback(
    (key: string) => {
      setOpenGroupKeys((prev) => {
        const entry = navIndex.get(key);
        if (!entry) return prev;

        if (entry.isGroup) {
          const next = new Set(prev);
          if (next.has(entry.key)) next.delete(entry.key);
          else next.add(entry.key);
          return next;
        }

        const next = new Set(prev);
        let currentParent = entry.parentKey;

        while (currentParent !== "__root__") {
          next.add(currentParent);
          const parentEntry = navIndex.get(currentParent);
          if (!parentEntry) break;
          currentParent = parentEntry.parentKey;
        }

        return next;
      });
    },
    [navIndex],
  );

  return { openGroupKeys, openChainForKey };
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
  const { openGroupKeys, openChainForKey } = useOpenChain(displayItems);
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
  selectActiveSource: (source: ActiveSource, targetPath?: string) => void;
  resolvePermissionName?: (code: string) => string | null;
  isCollapsed: boolean;
}) {
  const { t } = useTranslation();

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
              {resolveLeadingLabel(item, t) ? (
                <NavGroupMarker label={resolveLeadingLabel(item, t) as string} />
              ) : null}
              {item.dividerBefore ? <NavDivider /> : null}
              <NavNode
                item={item}
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
                selectActiveSource={props.selectActiveSource}
                resolvePermissionName={props.resolvePermissionName}
                isCollapsed={props.isCollapsed}
                hoverDropdown={null}
              />
              {item.dividerAfter ? <NavDivider /> : null}
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
        commandNavItems={state.commandNavItems}
        pathname={state.pathname}
        activeSource={state.activeSource}
        activeKeys={state.activeKeys}
        baseActiveKeys={state.baseActiveKeys}
        starredActiveKeys={state.starredActiveKeys}
        suppressedKeys={state.suppressedKeys}
        openGroupKeys={state.openGroupKeys}
        openChainForKey={state.openChainForKey}
        selectActiveSource={state.selectActiveSource}
        resolvePermissionName={props.resolvePermissionName}
        isCollapsed={state.collapsedMode}
      />
    </nav>
  );
}
