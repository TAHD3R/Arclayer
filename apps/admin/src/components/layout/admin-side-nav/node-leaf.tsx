import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { cn } from "@arclayer/lib/utils";
import { Button as ButtonPrimitive } from "@arclayer/ui/button-primitive";
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@arclayer/ui/sidebar";

import type { AdminNavItem } from "@/types/admin-nav";
import type { CollapsedDropdownController } from "./collapsed-dropdown";
import { WithBlockedTooltip } from "./blocked-tooltip";
import {
  isExactMatch,
  NAV_ITEM_COLLAPSED_BUTTON_CLASSNAME,
  NAV_ITEM_HEIGHT_CLASSNAME,
} from "./nav-utils";
import {
  DISABLED_ITEM_CLASSNAME,
  INTERACTIVE_TRANSITION_CLASSNAME,
  NAV_ITEM_COLLAPSE_HIDE_CLASSNAME,
  NAV_ITEM_INTERACTIVE_BG_CLASSNAME,
  NAV_ITEM_INTERACTIVE_TEXT_CLASSNAME,
} from "./nav-node-styles";
import { iconSlot } from "./nav-icon-slot";

type NodeLeafProps = {
  item: AdminNavItem;
  depth: number;
  isCollapsed: boolean;
  label: string;
  pathname: string;
  isSelected: boolean;
  blockedTooltip: string | null;
  openChainForKey: (key: string) => void;
  hoverDropdown: CollapsedDropdownController | null;
};

function NodeLeafSub({
  item,
  label,
  pathname,
  isSelected,
  blockedTooltip,
  openChainForKey,
  onNavigate,
}: Omit<NodeLeafProps, "depth" | "hoverDropdown"> & { onNavigate: (to: string) => void }) {
  return (
    <SidebarMenuSubItem className="group/nav-item">
      <WithBlockedTooltip tooltip={blockedTooltip}>
        <SidebarMenuSubButton
          asChild
          isActive={isSelected}
          aria-disabled={item.disabled ? "true" : undefined}
          className={cn(
            "relative z-10",
            NAV_ITEM_HEIGHT_CLASSNAME,
            "rounded-lg",
            INTERACTIVE_TRANSITION_CLASSNAME,
            "text-callout",
            NAV_ITEM_INTERACTIVE_TEXT_CLASSNAME,
            NAV_ITEM_INTERACTIVE_BG_CLASSNAME,
            item.disabled ? DISABLED_ITEM_CLASSNAME : null,
          )}
        >
          <ButtonPrimitive
            type="button"
            tapScale={1}
            aria-current={item.to && isExactMatch(item.to, pathname) ? "page" : undefined}
            onClick={() => {
              openChainForKey(item.key);
              if (!item.to || item.disabled) return;
              onNavigate(item.to);
            }}
            className="flex w-full items-center justify-start text-left"
          >
            <span className="min-w-0 flex-1 truncate">{label}</span>
          </ButtonPrimitive>
        </SidebarMenuSubButton>
      </WithBlockedTooltip>
    </SidebarMenuSubItem>
  );
}

function NodeLeafRoot({
  item,
  depth,
  label,
  isSelected,
  blockedTooltip,
  openChainForKey,
  hoverDropdown,
  onNavigate,
}: NodeLeafProps & { onNavigate: (to: string) => void }) {
  const Icon = item.icon;
  const [isHovered, setIsHovered] = useState(false);

  return (
    <SidebarMenuItem
      className="group/nav-item"
      onPointerEnter={() => {
        setIsHovered(true);
        if (!hoverDropdown || !item.to || item.disabled) return;
        hoverDropdown.close();
      }}
      onPointerLeave={() => setIsHovered(false)}
      onFocusCapture={() => {
        if (!hoverDropdown || !item.to || item.disabled) return;
        hoverDropdown.close();
      }}
    >
      <WithBlockedTooltip tooltip={blockedTooltip}>
        <SidebarMenuButton
          isActive={isSelected}
          tooltip={label}
          aria-disabled={item.disabled ? "true" : undefined}
          className={cn(
            "relative z-10",
            NAV_ITEM_HEIGHT_CLASSNAME,
            "rounded-lg",
            INTERACTIVE_TRANSITION_CLASSNAME,
            NAV_ITEM_INTERACTIVE_TEXT_CLASSNAME,
            NAV_ITEM_INTERACTIVE_BG_CLASSNAME,
            NAV_ITEM_COLLAPSED_BUTTON_CLASSNAME,
            "pl-5",
            "group-data-[collapsible=icon]:gap-0",
            item.disabled ? DISABLED_ITEM_CLASSNAME : "hover:cursor-pointer",
          )}
          onClick={() => {
            openChainForKey(item.key);
            if (!item.to || item.disabled) return;
            onNavigate(item.to);
          }}
        >
          {iconSlot(depth, Icon, { isActive: isSelected, isHovered, collapseMotion: "shift" })}
          <span className={cn("min-w-0 flex-1 truncate", NAV_ITEM_COLLAPSE_HIDE_CLASSNAME)}>
            {label}
          </span>
        </SidebarMenuButton>
      </WithBlockedTooltip>
    </SidebarMenuItem>
  );
}

export function NodeLeaf(props: NodeLeafProps) {
  const navigate = useNavigate();
  const onNavigate = (to: string) => void navigate({ to: to as never });
  if (props.depth > 0) {
    return (
      <NodeLeafSub
        item={props.item}
        isCollapsed={props.isCollapsed}
        label={props.label}
        pathname={props.pathname}
        isSelected={props.isSelected}
        blockedTooltip={props.blockedTooltip}
        openChainForKey={props.openChainForKey}
        onNavigate={onNavigate}
      />
    );
  }
  return <NodeLeafRoot {...props} onNavigate={onNavigate} />;
}
