import { useMemo, useState } from "react";
import { Star } from "@arclayer/ui/icons/lucide-animated";
import { useTranslation } from "react-i18next";

import { Collapsible, CollapsibleContent } from "@arclayer/ui/collapsible";
import ChevronRightIcon from "@arclayer/ui/icons/chevron-right";
import { cn } from "@arclayer/lib/utils";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
} from "@arclayer/ui/sidebar";

import { useCollapsedDropdownController } from "./collapsed-dropdown";
import type { FavoriteNavItem } from "./favorite-nav-items";
import { iconSlot } from "./nav-icon-slot";
import { NavNode } from "./nav-node";
import {
  INTERACTIVE_TRANSITION_CLASSNAME,
  NAV_ITEM_COLLAPSE_HIDE_CLASSNAME,
  NAV_ITEM_INTERACTIVE_BG_CLASSNAME,
  NAV_ITEM_INTERACTIVE_TEXT_CLASSNAME,
} from "./nav-node-styles";
import { NodeCollapsedGroup, type ResolvedChildItem } from "./node-collapsed-group";
import {
  isExactMatch,
  NAV_ITEM_COLLAPSED_BUTTON_CLASSNAME,
  NAV_ITEM_HEIGHT_CLASSNAME,
  NAV_ITEM_ROOT_INSET_CLASSNAME,
  NAV_ROOT_MENU_GAP_CLASSNAME,
  NAV_SUBTREE_CLASSNAME,
} from "./nav-utils";
import type { AdminNavItem } from "@/types/admin-nav";

const STARRED_COLLAPSIBLE_CONTENT_CLASSNAME = cn(
  "pt-1 overflow-hidden",
  "motion-reduce:animate-none",
  "data-[state=open]:animate-[arclayer-collapsible-down_180ms_ease-out]",
  "data-[state=closed]:animate-[arclayer-collapsible-up_160ms_ease-in]",
);

function buildFavoriteLeafItems(items: readonly FavoriteNavItem[]): AdminNavItem[] {
  return items.map((item) => ({
    key: item.key,
    label: item.label,
    icon: item.Icon,
    to: item.path,
  }));
}

function StarredTriggerButton(props: {
  hasActiveItem: boolean;
  isOpen: boolean;
  label: string;
  onToggle: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={props.hasActiveItem}
        tooltip={props.label}
        className={cn(
          "relative z-10 rounded-lg group-data-[collapsible=icon]:gap-0",
          NAV_ITEM_HEIGHT_CLASSNAME,
          INTERACTIVE_TRANSITION_CLASSNAME,
          NAV_ITEM_INTERACTIVE_TEXT_CLASSNAME,
          NAV_ITEM_INTERACTIVE_BG_CLASSNAME,
          NAV_ITEM_COLLAPSED_BUTTON_CLASSNAME,
          NAV_ITEM_ROOT_INSET_CLASSNAME,
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={props.onToggle}
      >
        {iconSlot(0, Star, { isActive: props.hasActiveItem, isHovered, collapseMotion: "shift" })}
        <span className={cn("min-w-0 flex-1 truncate", NAV_ITEM_COLLAPSE_HIDE_CLASSNAME)}>
          {props.label}
        </span>
        <span className={cn("ml-auto shrink-0", NAV_ITEM_COLLAPSE_HIDE_CLASSNAME)}>
          <ChevronRightIcon
            size={16}
            expanded={props.isOpen}
            isHovered={isHovered}
            className="shrink-0 text-label-secondary"
            aria-hidden="true"
          />
        </span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function StarredLeafNodes(props: {
  items: readonly AdminNavItem[];
  pathname: string;
  activeKeys: ReadonlySet<string>;
  isCollapsed: boolean;
}) {
  return (
    <SidebarMenuSub className={NAV_SUBTREE_CLASSNAME}>
      {props.items.map((item) => (
        <NavNode
          key={item.key}
          item={item}
          depth={1}
          parentKey="starred"
          pathname={props.pathname}
          activeKeys={props.activeKeys}
          openByParent={{}}
          openChainForKey={() => undefined}
          isCollapsed={props.isCollapsed}
          hoverDropdown={null}
        />
      ))}
    </SidebarMenuSub>
  );
}

function buildCollapsedItems(
  items: readonly FavoriteNavItem[],
  pathname: string,
): ResolvedChildItem[] {
  return items.map((item) => ({
    key: item.key,
    label: item.label,
    to: item.path,
    disabled: false,
    isActive: isExactMatch(item.path, pathname),
    Icon: item.Icon,
  }));
}

function StarredExpandedSection(props: {
  items: readonly FavoriteNavItem[];
  isCollapsed: boolean;
  pathname: string;
}) {
  const { t } = useTranslation("nav");
  const [open, setOpen] = useState(true);
  const leafItems = useMemo(() => buildFavoriteLeafItems(props.items), [props.items]);
  const activeKeys = useMemo(
    () =>
      new Set(
        leafItems
          .filter((item) => item.to && isExactMatch(item.to, props.pathname))
          .map((item) => item.key),
      ),
    [leafItems, props.pathname],
  );

  return (
    <SidebarGroup className="p-0">
      <SidebarGroupContent>
        <SidebarMenu
          className={cn(
            "px-0",
            NAV_ROOT_MENU_GAP_CLASSNAME,
            "transition-[gap] duration-400 ease-[cubic-bezier(0.75,0,0.25,1)] motion-reduce:transition-none",
          )}
        >
          <StarredTriggerButton
            hasActiveItem={activeKeys.size > 0}
            isOpen={open}
            label={t("NAV_STARRED")}
            onToggle={() => setOpen((value) => !value)}
          />
        </SidebarMenu>
        <Collapsible open={open}>
          <CollapsibleContent className={STARRED_COLLAPSIBLE_CONTENT_CLASSNAME}>
            <StarredLeafNodes
              items={leafItems}
              pathname={props.pathname}
              activeKeys={activeKeys}
              isCollapsed={props.isCollapsed}
            />
          </CollapsibleContent>
        </Collapsible>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function StarredNavSection(props: {
  items: readonly FavoriteNavItem[];
  pathname: string;
  onNavigate: (to: string) => void;
  isCollapsed: boolean;
}) {
  const { t } = useTranslation("nav");
  const hoverDropdown = useCollapsedDropdownController();

  if (!props.isCollapsed) {
    return (
      <StarredExpandedSection
        items={props.items}
        isCollapsed={props.isCollapsed}
        pathname={props.pathname}
      />
    );
  }

  const collapsedItems = buildCollapsedItems(props.items, props.pathname);

  return (
    <SidebarGroup className="p-0">
      <SidebarGroupContent>
        <SidebarMenu
          className={cn(
            "px-0",
            NAV_ROOT_MENU_GAP_CLASSNAME,
            "transition-[gap] duration-400 ease-[cubic-bezier(0.75,0,0.25,1)] motion-reduce:transition-none",
          )}
        >
          <NodeCollapsedGroup
            itemKey="starred"
            label={t("NAV_STARRED")}
            Icon={Star}
            isTrailActive={props.items.some((item) => isExactMatch(item.path, props.pathname))}
            isDisabled={false}
            blockedTooltip={null}
            children={collapsedItems}
            hoverDropdown={hoverDropdown}
            onNavigate={props.onNavigate}
          />
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
