import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useRouterState } from "@tanstack/react-router";

import type { AdminNavItem } from "@/types/admin-nav";
import { cn } from "@celestial/lib/utils";
import { useFavoritesStore } from "@/stores/use-favorites-store";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@celestial/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@celestial/ui/tooltip";
import {
  NAV_ITEM_HEIGHT_CLASSNAME,
  buildNavIndex,
  findActiveTrail,
  isExactMatch,
  normalizePath,
  type OpenByParent,
} from "./nav-utils";
import { NavNode } from "./nav-node";
import { useCollapsedDropdownController } from "./collapsed-dropdown";
import { CollapsedNavButton } from "./collapsed-nav-button";
import {
  NAV_ITEM_COLLAPSE_HIDE_CLASSNAME,
  NAV_ITEM_INTERACTIVE_BG_CLASSNAME,
  NAV_ITEM_INTERACTIVE_TEXT_CLASSNAME,
} from "./nav-node-styles";

const FAVORITE_MENU_BUTTON_CLASSNAME = cn(
  "relative z-10",
  NAV_ITEM_HEIGHT_CLASSNAME,
  "rounded-lg",
  "transition-[color,background-color,transform,box-shadow] duration-200 ease-out motion-reduce:transition-none",
  NAV_ITEM_INTERACTIVE_TEXT_CLASSNAME,
  NAV_ITEM_INTERACTIVE_BG_CLASSNAME,
  "pl-5",
  "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0",
);

const SIDEBAR_COLLAPSE_TRANSITION_MS = 400;

function useCollapsedRenderMode(isCollapsed: boolean): boolean {
  const [renderCollapsed, setRenderCollapsed] = useState(isCollapsed);

  useEffect(() => {
    if (!isCollapsed) {
      setRenderCollapsed(false);
      return undefined;
    }
    if (renderCollapsed) return undefined;

    const timer = window.setTimeout(() => setRenderCollapsed(true), SIDEBAR_COLLAPSE_TRANSITION_MS);
    return () => window.clearTimeout(timer);
  }, [isCollapsed, renderCollapsed]);

  return renderCollapsed;
}

function findNavItemByPath(items: readonly AdminNavItem[], path: string): AdminNavItem | null {
  for (const item of items) {
    if (item.to && normalizePath(item.to) === normalizePath(path)) return item;
    if (item.children) {
      const found = findNavItemByPath(item.children, path);
      if (found) return found;
    }
  }
  return null;
}

type AdminSiderNavProps = {
  items: readonly AdminNavItem[];
  resolvePermissionName?: (code: string) => string | null;
  className?: string;
};

type FavoriteItem = { path: string; label: string; Icon: AdminNavItem["icon"] };

function useOpenChain(navIndex: Map<string, { parentKey: string; isGroup: boolean }>) {
  const [openByParent, setOpenByParent] = useState<OpenByParent>({});

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
          const e = navIndex.get(current);
          if (!e) break;
          if (e.isGroup) next[e.parentKey] = current;
          if (e.parentKey === "__root__") break;
          current = e.parentKey;
        }
        return next;
      });
    },
    [navIndex],
  );

  return { openByParent, openChainForKey };
}

function useFavoriteItems(
  items: readonly AdminNavItem[],
  favoritePaths: readonly string[],
  t: (key: string) => string,
): FavoriteItem[] {
  return useMemo(() => {
    const resolved: FavoriteItem[] = [];
    for (const path of favoritePaths) {
      const item = findNavItemByPath(items, path);
      if (!item) continue;
      resolved.push({
        path,
        label: item.labelKey ? t(item.labelKey) : item.label,
        Icon: item.icon,
      });
    }
    return resolved;
  }, [favoritePaths, items, t]);
}

function FavoritesSection(props: {
  items: readonly FavoriteItem[];
  pathname: string;
  isCollapsed: boolean;
  onNavigate: (to: string) => void;
}) {
  if (props.items.length === 0) return null;
  return (
    <>
      <SidebarGroup className="p-0 pb-0">
        <SidebarGroupContent>
          <SidebarMenu className={cn("mb-0! px-0", props.isCollapsed ? "gap-2" : "gap-0")}>
            {props.items.map((fav) => {
              const isSelected = isExactMatch(fav.path, props.pathname);
              const Icon = fav.Icon;
              if (props.isCollapsed) {
                return (
                  <SidebarMenuItem key={fav.path}>
                    <Tooltip side="right" align="center">
                      <TooltipTrigger asChild>
                        <CollapsedNavButton
                          label={fav.label}
                          Icon={Icon}
                          isActive={isSelected}
                          isDisabled={false}
                          onClick={() => props.onNavigate(fav.path)}
                        />
                      </TooltipTrigger>
                      <TooltipContent>{fav.label}</TooltipContent>
                    </Tooltip>
                  </SidebarMenuItem>
                );
              }
              return (
                <SidebarMenuItem key={fav.path}>
                  <SidebarMenuButton
                    isActive={isSelected}
                    tooltip={fav.label}
                    className={FAVORITE_MENU_BUTTON_CLASSNAME}
                    onClick={() => props.onNavigate(fav.path)}
                  >
                    {Icon ? (
                      <span
                        className="size-5 shrink-0 inline-flex items-center justify-center"
                        aria-hidden="true"
                      >
                        <Icon className="size-full" />
                      </span>
                    ) : (
                      <span className="size-5 shrink-0" aria-hidden="true" />
                    )}
                    <span
                      className={cn("min-w-0 flex-1 truncate", NAV_ITEM_COLLAPSE_HIDE_CLASSNAME)}
                    >
                      {fav.label}
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarSeparator className="mx-5 my-2" />
    </>
  );
}

function ItemsSection(props: {
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
        <SidebarMenu className={cn("px-0", props.isCollapsed ? "gap-2" : "gap-0.5")}>
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
              {item.dividerAfter ? <SidebarSeparator className="mx-5 my-1" /> : null}
            </Fragment>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AdminSiderNav(props: AdminSiderNavProps) {
  const { t } = useTranslation(["admin_menu"]);
  const navigate = useNavigate();
  const { state: sidebarState, isMobile } = useSidebar();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const favoritePaths = useFavoritesStore((s) => s.paths);
  const navIndex = useMemo(() => buildNavIndex(props.items), [props.items]);

  const isCollapsed = sidebarState === "collapsed" && !isMobile;
  const collapsedMode = useCollapsedRenderMode(isCollapsed);

  const activeTrail = useMemo(
    () => findActiveTrail(props.items, pathname),
    [props.items, pathname],
  );
  const activeKeys = useMemo(() => new Set(activeTrail), [activeTrail]);

  const { openByParent, openChainForKey } = useOpenChain(navIndex);
  const favoriteItems = useFavoriteItems(props.items, favoritePaths, t);
  const onNavigate = useCallback((to: string) => void navigate({ to: to as never }), [navigate]);

  return (
    <nav className={cn("mt-4 mb-8", props.className)}>
      <FavoritesSection
        items={favoriteItems}
        pathname={pathname}
        isCollapsed={collapsedMode}
        onNavigate={onNavigate}
      />
      <ItemsSection
        items={props.items}
        pathname={pathname}
        activeKeys={activeKeys}
        openByParent={openByParent}
        openChainForKey={openChainForKey}
        resolvePermissionName={props.resolvePermissionName}
        isCollapsed={collapsedMode}
      />
    </nav>
  );
}
