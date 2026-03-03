import { cn } from "@celestial/lib/utils";
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@celestial/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@celestial/ui/tooltip";

import type { AdminNavItem } from "@/types/admin-nav";
import {
  DISABLED_ITEM_CLASSNAME,
  INTERACTIVE_TRANSITION_CLASSNAME,
  NAV_ITEM_COLLAPSE_HIDE_CLASSNAME,
  NAV_ITEM_INTERACTIVE_BG_CLASSNAME,
  NAV_ITEM_INTERACTIVE_TEXT_CLASSNAME,
} from "./nav-node-styles";
import { NAV_ITEM_HEIGHT_CLASSNAME } from "./nav-utils";
import { iconSlot } from "./nav-icon-slot";
import { CollapsedNavButton } from "./collapsed-nav-button";

type NodeActionProps = {
  item: AdminNavItem;
  depth: number;
  isCollapsed: boolean;
  label: string;
  isActive: boolean;
};

function NodeActionSub({ item, label, isActive }: Omit<NodeActionProps, "depth" | "isCollapsed">) {
  const TrailingIcon = item.trailingIcon;
  return (
    <SidebarMenuSubItem className="group/nav-item">
      <SidebarMenuSubButton
        asChild
        isActive={isActive}
        className={cn(
          "relative z-10 cursor-pointer",
          NAV_ITEM_HEIGHT_CLASSNAME,
          "rounded-lg",
          INTERACTIVE_TRANSITION_CLASSNAME,
          "text-callout",
          NAV_ITEM_INTERACTIVE_TEXT_CLASSNAME,
          NAV_ITEM_INTERACTIVE_BG_CLASSNAME,
          isActive && "font-semibold text-foreground!",
        )}
      >
        <button type="button" onClick={item.onAction} className="w-full justify-start text-left">
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {TrailingIcon ? (
            <TrailingIcon
              className="ml-auto size-3.5 shrink-0 text-label-secondary"
              aria-hidden="true"
            />
          ) : null}
        </button>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
}

function NodeActionRoot({ item, depth, isCollapsed, label, isActive }: NodeActionProps) {
  const Icon = item.icon;
  const TrailingIcon = item.trailingIcon;
  const showAction = depth === 0 && Boolean(item.actionRenderer);

  if (isCollapsed) {
    return (
      <SidebarMenuItem className="group/nav-item">
        <Tooltip side="right" align="center">
          <TooltipTrigger asChild>
            <CollapsedNavButton
              label={label}
              Icon={Icon}
              isActive={isActive}
              isDisabled={Boolean(item.disabled)}
              onClick={() => {
                if (item.disabled) return;
                item.onAction?.();
              }}
            />
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem className="group/nav-item">
      <SidebarMenuButton
        isActive={isActive}
        tooltip={label}
        className={cn(
          "relative z-10 cursor-pointer",
          NAV_ITEM_HEIGHT_CLASSNAME,
          "rounded-lg",
          INTERACTIVE_TRANSITION_CLASSNAME,
          NAV_ITEM_INTERACTIVE_TEXT_CLASSNAME,
          NAV_ITEM_INTERACTIVE_BG_CLASSNAME,
          isActive && "font-semibold text-foreground!",
          "pl-5",
          "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0",
          item.disabled ? DISABLED_ITEM_CLASSNAME : null,
        )}
        onClick={item.onAction}
      >
        {iconSlot(depth, Icon, { isActive })}
        <span className={cn("min-w-0 flex-1 truncate", NAV_ITEM_COLLAPSE_HIDE_CLASSNAME)}>
          {label}
        </span>
        {showAction && item.actionRenderer ? (
          <span className={cn("ml-auto shrink-0", NAV_ITEM_COLLAPSE_HIDE_CLASSNAME)}>
            {item.actionRenderer(item)}
          </span>
        ) : null}
        {TrailingIcon ? (
          <span className={cn("ml-auto shrink-0", NAV_ITEM_COLLAPSE_HIDE_CLASSNAME)}>
            <TrailingIcon className="size-3.5 shrink-0 text-label-secondary" aria-hidden="true" />
          </span>
        ) : null}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function NodeAction(props: NodeActionProps) {
  if (props.depth > 0) {
    return <NodeActionSub item={props.item} label={props.label} isActive={props.isActive} />;
  }
  return <NodeActionRoot {...props} />;
}
