import { Fragment, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import ChevronRightIcon from "@arclayer/ui/icons/chevron-right";
import { Button as ButtonPrimitive } from "@arclayer/ui/button-primitive";

import type { AdminNavItem, AdminNavSection } from "@/types/admin-nav";
import { cn } from "@arclayer/lib/utils";
import { useFavoritesStore } from "@/stores/use-favorites-store";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@arclayer/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarSeparator,
  useSidebar,
} from "@arclayer/ui/sidebar";
import { buildNavIndex, findActiveTrail, type OpenByParent } from "./nav-utils";
import { resolveFavoriteNavItems } from "./favorite-nav-items";
import { NavNode } from "./nav-node";
import { StarredNavSection } from "./starred-nav-section";
import { useCollapsedDropdownController } from "./collapsed-dropdown";
import { NAV_ITEM_COLLAPSE_HIDE_CLASSNAME } from "./nav-node-styles";
import {
  NAV_SECTION_DIVIDER_CLASSNAME,
  NAV_DIVIDER_CLASSNAME,
  NAV_ROOT_MENU_GAP_CLASSNAME,
  NAV_SECTION_CONTENT_PADDING_CLASSNAME,
  NAV_SECTION_LABEL_CLASSNAME,
  NAV_SECTION_LABEL_SHELL_CLASSNAME,
  NAV_SECTION_TRIGGER_CLASSNAME,
} from "./nav-utils";

const SECTION_COLLAPSIBLE_CONTENT_CLASSNAME = cn(
  "overflow-hidden",
  "motion-reduce:animate-none",
  "data-[state=open]:animate-[arclayer-collapsible-down_180ms_ease-out]",
  "data-[state=closed]:animate-[arclayer-collapsible-up_160ms_ease-in]",
);

function flattenStructuredItems(params: {
  homeItem?: AdminNavItem | null;
  items?: readonly AdminNavItem[];
  sections?: readonly AdminNavSection[];
}): AdminNavItem[] {
  if (params.homeItem || params.sections?.length) {
    return [
      params.homeItem,
      ...(params.sections?.flatMap((section) => section.items) ?? []),
    ].filter((item): item is AdminNavItem => Boolean(item));
  }

  return [...(params.items ?? [])];
}

type AdminSiderNavProps = {
  items?: readonly AdminNavItem[];
  homeItem?: AdminNavItem | null;
  sections?: readonly AdminNavSection[];
  favoriteWorkspaceBase?: string | null;
  resolvePermissionName?: (code: string) => string | null;
  className?: string;
};

type AdminSiderNavState = {
  pathname: string;
  allItems: AdminNavItem[];
  activeKeys: ReadonlySet<string>;
  openByParent: OpenByParent;
  openChainForKey: (key: string) => void;
  collapsedMode: boolean;
  favoriteItems: ReturnType<typeof resolveFavoriteNavItems>;
};

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

function useAdminSiderNavState(props: AdminSiderNavProps): AdminSiderNavState {
  const { t, i18n } = useTranslation();
  const { state: sidebarState, isMobile } = useSidebar();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const favoritePaths = useFavoritesStore((state) => state.paths);
  const allItems = useMemo(
    () =>
      flattenStructuredItems({
        homeItem: props.homeItem,
        items: props.items,
        sections: props.sections,
      }),
    [props.homeItem, props.items, props.sections],
  );
  const navIndex = useMemo(() => buildNavIndex(allItems), [allItems]);
  const isCollapsed = sidebarState === "collapsed" && !isMobile;
  const activeTrail = useMemo(() => findActiveTrail(allItems, pathname), [allItems, pathname]);
  const activeKeys = useMemo(() => new Set(activeTrail), [activeTrail]);
  const { openByParent, openChainForKey } = useOpenChain(navIndex);
  const favoriteItems = useMemo(
    () =>
      resolveFavoriteNavItems({
        favoritePaths,
        homeItem: props.homeItem,
        items: props.items,
        sections: props.sections,
        t,
        workspaceBase: props.favoriteWorkspaceBase,
      }),
    [
      favoritePaths,
      props.favoriteWorkspaceBase,
      props.homeItem,
      props.items,
      props.sections,
      i18n.language,
      i18n.resolvedLanguage,
      t,
    ],
  );

  return {
    pathname,
    allItems,
    activeKeys,
    openByParent,
    openChainForKey,
    collapsedMode: isCollapsed,
    favoriteItems,
  };
}

function ItemsSection(props: {
  items: readonly AdminNavItem[];
  title?: string;
  pathname: string;
  activeKeys: ReadonlySet<string>;
  openByParent: OpenByParent;
  openChainForKey: (key: string) => void;
  resolvePermissionName?: (code: string) => string | null;
  isCollapsed: boolean;
}) {
  const hoverDropdown = useCollapsedDropdownController();
  const [open, setOpen] = useState(true);
  const effectiveOpen = props.isCollapsed ? true : open;
  const contentClassName = props.title ? NAV_SECTION_CONTENT_PADDING_CLASSNAME : undefined;

  const content = (
    <SidebarGroupContent className={contentClassName}>
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
  );

  if (!props.title) {
    return <SidebarGroup className="p-0">{content}</SidebarGroup>;
  }

  return (
    <Collapsible open={effectiveOpen} onOpenChange={setOpen}>
      <SidebarGroup className="p-0">
        <div className={NAV_SECTION_LABEL_SHELL_CLASSNAME}>
          <div aria-hidden="true" className={NAV_SECTION_DIVIDER_CLASSNAME} />
          <CollapsibleTrigger asChild>
            <SidebarGroupLabel asChild className={NAV_SECTION_LABEL_CLASSNAME}>
              <ButtonPrimitive type="button" tapScale={1} className={NAV_SECTION_TRIGGER_CLASSNAME}>
                <span className="min-w-0 flex-1 truncate">{props.title}</span>
                <span className={cn("mr-0.5 shrink-0", NAV_ITEM_COLLAPSE_HIDE_CLASSNAME)}>
                  <ChevronRightIcon
                    size={16}
                    expanded={effectiveOpen}
                    isHovered={false}
                    className="shrink-0 text-label-secondary"
                    aria-hidden="true"
                  />
                </span>
              </ButtonPrimitive>
            </SidebarGroupLabel>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className={SECTION_COLLAPSIBLE_CONTENT_CLASSNAME}>
          {content}
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

function StructuredNavContent(props: {
  homeItem?: AdminNavItem | null;
  sections?: readonly AdminNavSection[];
  resolvePermissionName?: (code: string) => string | null;
  state: AdminSiderNavState;
  onNavigate: (to: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col">
      {props.homeItem ? (
        <ItemsSection
          items={[props.homeItem]}
          pathname={props.state.pathname}
          activeKeys={props.state.activeKeys}
          openByParent={props.state.openByParent}
          openChainForKey={props.state.openChainForKey}
          resolvePermissionName={props.resolvePermissionName}
          isCollapsed={props.state.collapsedMode}
        />
      ) : null}
      {props.state.favoriteItems.length > 0 ? (
        <StarredNavSection
          items={props.state.favoriteItems}
          pathname={props.state.pathname}
          onNavigate={props.onNavigate}
          isCollapsed={props.state.collapsedMode}
        />
      ) : null}
      {(props.sections ?? []).map((section) => (
        <ItemsSection
          key={section.key}
          title={section.titleKey ? t(section.titleKey) : section.title}
          items={section.items}
          pathname={props.state.pathname}
          activeKeys={props.state.activeKeys}
          openByParent={props.state.openByParent}
          openChainForKey={props.state.openChainForKey}
          resolvePermissionName={props.resolvePermissionName}
          isCollapsed={props.state.collapsedMode}
        />
      ))}
    </div>
  );
}

export function AdminSiderNav(props: AdminSiderNavProps) {
  const navigate = useNavigate();
  const state = useAdminSiderNavState(props);
  const sectionedMode = Boolean(props.homeItem || props.sections?.length);
  const onNavigate = useCallback((to: string) => void navigate({ to: to as never }), [navigate]);

  if (sectionedMode) {
    return (
      <nav className={cn("mt-4 mb-8", props.className)}>
        <StructuredNavContent
          homeItem={props.homeItem}
          sections={props.sections}
          resolvePermissionName={props.resolvePermissionName}
          state={state}
          onNavigate={onNavigate}
        />
      </nav>
    );
  }

  return (
    <nav className={cn("mt-4 mb-8", props.className)}>
      <ItemsSection
        items={state.allItems}
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
