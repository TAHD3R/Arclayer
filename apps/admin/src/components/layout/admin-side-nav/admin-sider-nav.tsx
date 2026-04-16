import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouterState } from "@tanstack/react-router";
import { Star } from "lucide-react";

import type { AdminNavItem } from "@/types/admin-nav";
import type { FavoriteNode } from "@/types/stores/favorites";
import { cn } from "@arclayer/lib/utils";
import { useFavoritesStore } from "@/stores/use-favorites-store";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarSeparator,
  useSidebar,
} from "@arclayer/ui/sidebar";
import {
  buildNavIndex,
  collectGroupKeys,
  findActiveTrail,
  isExactMatch,
  isPrefixMatch,
  normalizePath,
  type OpenGroupKeys,
} from "./nav-utils";
import { resolveFavoriteNavItems } from "./favorite-nav-items";
import { NavNode } from "./nav-node";
import { useCollapsedDropdownController } from "./collapsed-dropdown";
import { NAV_DIVIDER_CLASSNAME, NAV_ROOT_MENU_GAP_CLASSNAME } from "./nav-utils";
import {
  buildFavoriteAdminChildren,
  flattenFavoriteNavItems,
  type FavoriteNavNode,
} from "./favorite-nav-items";

type AdminSiderNavProps = {
  items?: readonly AdminNavItem[];
  favoriteWorkspaceBase?: string | null;
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
  hoverIntent: boolean;
};

function resolveLeadingLabel(item: AdminNavItem, t: (key: string) => string): string | null {
  if (item.groupLabelBeforeKey) return t(item.groupLabelBeforeKey);
  return item.groupLabelBefore ?? null;
}

function NavGroupMarker(props: { label: string }) {
  return (
    <div
      data-slot="admin-side-nav-group-marker"
      className="relative w-full py-1.5"
      aria-hidden="true"
    >
      <SidebarGroupLabel
        data-slot="admin-side-nav-group-label"
        className={cn(
          "h-auto origin-left px-3 py-0 text-[11px] font-medium tracking-[0.08em] text-label-tertiary transition-[opacity,transform] duration-420 ease-[cubic-bezier(0.18,0.9,0.32,1)] motion-reduce:transition-none",
          "group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:translate-y-1 group-data-[collapsible=icon]:opacity-0",
        )}
      >
        {props.label}
      </SidebarGroupLabel>
      <div
        data-slot="admin-side-nav-group-divider"
        className={cn(
          "bg-sidebar-border pointer-events-none absolute inset-x-3 top-1/2 h-px -translate-y-1/2 origin-left scale-x-75 opacity-0 transition-[opacity,transform] duration-420 ease-[cubic-bezier(0.18,0.9,0.32,1)] motion-reduce:transition-none group-data-[collapsible=icon]:inset-x-1.5",
          "group-data-[collapsible=icon]:scale-x-100 group-data-[collapsible=icon]:opacity-100",
        )}
      />
    </div>
  );
}

type ActiveSource = "base" | "starred";

function buildStarredItem(items: FavoriteNavNode[], pathname: string): AdminNavItem {
  return {
    key: "favorites",
    label: "Favorites",
    labelKey: "nav:NAV_FAVORITES",
    icon: Star,
    isActive: flattenFavoriteNavItems(items).some((item) => isExactMatch(item.path, pathname)),
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

function useOpenChain(items: readonly AdminNavItem[]) {
  const allGroupKeys = useMemo(() => collectGroupKeys(items), [items]);
  const navIndex = useMemo(() => buildNavIndex(items), [items]);
  const [openGroupKeys, setOpenGroupKeys] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setOpenGroupKeys((prev) => {
      const next = new Set<string>();
      for (const key of prev) {
        if (allGroupKeys.has(key)) next.add(key);
      }
      return next;
    });
  }, [allGroupKeys]);

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
  props: Pick<AdminSiderNavProps, "items" | "favoriteWorkspaceBase" | "showFavorites">,
  pathname: string,
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
  const favoriteItems = useMemo(
    () =>
      resolveFavoriteNavItems({
        favorites: favoriteTree,
        items: baseItems,
        t,
        workspaceBase: props.favoriteWorkspaceBase,
      }),
    [favoriteTree, baseItems, props.favoriteWorkspaceBase, i18n.language, i18n.resolvedLanguage, t],
  );
  const starredItem = useMemo(
    () => (props.showFavorites ? buildStarredItem(favoriteItems, pathname) : null),
    [favoriteItems, pathname, props.showFavorites],
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
  const { state: sidebarState, isMobile, hoverIntent } = useSidebar();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const activePathname = props.pathnameOverride ?? pathname;
  const { baseItems, favoriteItems, starredItem, displayItems } = useDisplayItems(
    props,
    activePathname,
  );
  const baseActiveTrail = useMemo(
    () => findActiveTrail(baseItems, activePathname),
    [activePathname, baseItems],
  );
  const baseActiveKeys = useMemo(() => new Set(baseActiveTrail), [baseActiveTrail]);
  const starredActive = useMemo(
    () =>
      flattenFavoriteNavItems(favoriteItems).some((item) =>
        isExactMatch(item.path, activePathname),
      ),
    [activePathname, favoriteItems],
  );
  const starredActiveTrail = useMemo(
    () => (starredItem && starredActive ? findActiveTrail([starredItem], activePathname) : []),
    [activePathname, starredActive, starredItem],
  );
  const starredActiveKeys = useMemo(() => new Set(starredActiveTrail), [starredActiveTrail]);
  const [sourcePreference, setSourcePreference] = useState<{
    targetPath: string;
    source: ActiveSource;
  } | null>(null);
  const activeSource: ActiveSource =
    sourcePreference && isPrefixMatch(sourcePreference.targetPath, activePathname)
      ? sourcePreference.source
      : starredActive
        ? "starred"
        : "base";
  const activeTrail = activeSource === "starred" ? starredActiveTrail : baseActiveTrail;
  const activeKeys = useMemo(() => new Set(activeTrail), [activeTrail]);
  const suppressedKeys = useMemo(
    () =>
      new Set(
        !starredActive ? [] : activeSource === "starred" ? baseActiveTrail : starredActiveTrail,
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
    hoverIntent,
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
  hoverIntent: boolean;
}) {
  const { t } = useTranslation();
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
              {resolveLeadingLabel(item, t) ? (
                <NavGroupMarker label={resolveLeadingLabel(item, t) as string} />
              ) : null}
              {item.dividerBefore ? <SidebarSeparator className={NAV_DIVIDER_CLASSNAME} /> : null}
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
                hoverDropdown={props.isCollapsed && !props.hoverIntent ? hoverDropdown : null}
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
        hoverIntent={state.hoverIntent}
      />
    </nav>
  );
}
