import { useNavigate } from "@tanstack/react-router";
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
  NAV_ITEM_BUTTON_PADDING_CLASSNAME,
  isExactMatch,
  NAV_ITEM_COLLAPSED_BUTTON_CLASSNAME,
  NAV_ITEM_HEIGHT_CLASSNAME,
  NAV_ITEM_RADIUS_CLASSNAME,
  NAV_TRAILING_RAIL_CLASSNAME,
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
  onSelect: (targetPath?: string) => void;
  allowSamePathNavigate: boolean;
  hoverDropdown: CollapsedDropdownController | null;
};

function NodeLeafSub({
  item,
  label,
  pathname,
  isSelected,
  blockedTooltip,
  openChainForKey,
  onSelect,
  allowSamePathNavigate,
  onNavigate,
}: Omit<NodeLeafProps, "depth" | "hoverDropdown"> & {
  onNavigate: (to: string, search?: Record<string, unknown>) => void;
}) {
  const showAction = Boolean(item.actionRenderer);
  const labelContent = item.renderLabel ? (
    item.renderLabel(item)
  ) : (
    <span className="min-w-0 flex-1 truncate">{label}</span>
  );

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
            NAV_ITEM_BUTTON_PADDING_CLASSNAME,
            NAV_ITEM_RADIUS_CLASSNAME,
            INTERACTIVE_TRANSITION_CLASSNAME,
            NAV_ITEM_INTERACTIVE_TEXT_CLASSNAME,
            "text-callout",
            item.disabled
              ? cn(
                  DISABLED_ITEM_CLASSNAME,
                  "bg-transparent focus-visible:bg-transparent data-[active=true]:bg-transparent [&:not([data-highlight])]:hover:bg-transparent",
                )
              : "bg-transparent focus-visible:bg-transparent data-[active=true]:bg-transparent [&:not([data-highlight])]:hover:bg-transparent",
          )}
        >
          <ButtonPrimitive
            type="button"
            tapScale={1}
            aria-current={item.to && isExactMatch(item.to, pathname) ? "page" : undefined}
            onClick={() => {
              onSelect(item.to);
              openChainForKey(item.key);
              if (!item.to || item.disabled) return;
              if (!allowSamePathNavigate && isExactMatch(item.to, pathname)) return;
              onNavigate(item.to, item.search);
            }}
            className="flex w-full items-center justify-start gap-2 text-left"
          >
            {labelContent}
            {showAction && item.actionRenderer ? (
              <span
                className={NAV_TRAILING_RAIL_CLASSNAME}
                onClick={(event) => event.stopPropagation()}
              >
                {item.actionRenderer(item)}
              </span>
            ) : null}
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
  pathname,
  isSelected,
  blockedTooltip,
  openChainForKey,
  onSelect,
  allowSamePathNavigate,
  hoverDropdown,
  onNavigate,
}: NodeLeafProps & { onNavigate: (to: string, search?: Record<string, unknown>) => void }) {
  const Icon = item.icon;
  const labelContent = item.renderLabel ? item.renderLabel(item) : label;

  return (
    <SidebarMenuItem
      className="group/nav-item"
      onPointerEnter={() => {
        if (!hoverDropdown || !item.to || item.disabled) return;
        hoverDropdown.close();
      }}
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
            NAV_ITEM_RADIUS_CLASSNAME,
            INTERACTIVE_TRANSITION_CLASSNAME,
            NAV_ITEM_INTERACTIVE_TEXT_CLASSNAME,
            NAV_ITEM_INTERACTIVE_BG_CLASSNAME,
            NAV_ITEM_COLLAPSED_BUTTON_CLASSNAME,
            NAV_ITEM_BUTTON_PADDING_CLASSNAME,
            "group-data-[collapsible=icon]:gap-0",
            item.disabled ? DISABLED_ITEM_CLASSNAME : "hover:cursor-pointer",
          )}
          onClick={() => {
            onSelect(item.to);
            openChainForKey(item.key);
            if (!item.to || item.disabled) return;
            if (!allowSamePathNavigate && isExactMatch(item.to, pathname)) return;
            onNavigate(item.to, item.search);
          }}
        >
          {iconSlot(depth, Icon, { isActive: isSelected, collapseMotion: "shift" })}
          {item.renderLabel ? (
            <div className={cn("min-w-0 flex-1", NAV_ITEM_COLLAPSE_HIDE_CLASSNAME)}>
              {labelContent}
            </div>
          ) : (
            <span className={cn("min-w-0 flex-1 truncate", NAV_ITEM_COLLAPSE_HIDE_CLASSNAME)}>
              {labelContent}
            </span>
          )}
        </SidebarMenuButton>
      </WithBlockedTooltip>
    </SidebarMenuItem>
  );
}

export function NodeLeaf(props: NodeLeafProps) {
  const navigate = useNavigate();
  const onNavigate = (to: string, search?: Record<string, unknown>) =>
    void navigate(search ? { to: to as never, search: search as never } : { to: to as never });
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
        onSelect={props.onSelect}
        allowSamePathNavigate={props.allowSamePathNavigate}
        onNavigate={onNavigate}
      />
    );
  }
  return <NodeLeafRoot {...props} onNavigate={onNavigate} />;
}
