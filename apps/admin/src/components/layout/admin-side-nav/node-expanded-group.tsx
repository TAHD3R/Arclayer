import { Collapsible, CollapsibleContent } from "@celestial/ui/collapsible";
import ChevronRightIcon from "@celestial/ui/icons/chevron-right";
import { cn } from "@celestial/lib/utils";
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@celestial/ui/sidebar";
import type { ReactNode } from "react";

import { WithBlockedTooltip } from "./blocked-tooltip";
import {
  DISABLED_ITEM_CLASSNAME,
  INTERACTIVE_TRANSITION_CLASSNAME,
  NAV_ITEM_INTERACTIVE_BG_CLASSNAME,
  NAV_ITEM_INTERACTIVE_TEXT_CLASSNAME,
} from "./nav-node-styles";
import { NAV_ITEM_HEIGHT_CLASSNAME } from "./nav-utils";
import type { AdminNavItem } from "@/types/admin-nav";
import { iconSlot } from "./nav-icon-slot";

const COLLAPSIBLE_CONTENT_CLASSNAME = cn(
  "pt-1.5 overflow-hidden",
  "motion-reduce:animate-none",
  "data-[state=open]:animate-[celestial-collapsible-down_180ms_ease-out]",
  "data-[state=closed]:animate-[celestial-collapsible-up_160ms_ease-in]",
);

function GroupChildren({ children }: { children: ReactNode }) {
  return (
    <CollapsibleContent className={COLLAPSIBLE_CONTENT_CLASSNAME}>
      <SidebarMenuSub className="gap-0.5 border-border/60 mx-0 ml-5">{children}</SidebarMenuSub>
    </CollapsibleContent>
  );
}

type NodeExpandedGroupSubProps = {
  item: AdminNavItem;
  label: string;
  isOpen: boolean;
  isTrailActive: boolean;
  blockedTooltip: string | null;
  onToggle: () => void;
  children: ReactNode;
};

export function NodeExpandedGroupSub({
  item,
  label,
  isOpen,
  isTrailActive,
  blockedTooltip,
  onToggle,
  children,
}: NodeExpandedGroupSubProps) {
  const buttonClassName = cn(
    "relative z-10",
    NAV_ITEM_HEIGHT_CLASSNAME,
    "rounded-lg",
    INTERACTIVE_TRANSITION_CLASSNAME,
    "text-callout",
    NAV_ITEM_INTERACTIVE_TEXT_CLASSNAME,
    NAV_ITEM_INTERACTIVE_BG_CLASSNAME,
    item.disabled ? DISABLED_ITEM_CLASSNAME : "hover:cursor-pointer",
  );

  return (
    <Collapsible open={isOpen}>
      <SidebarMenuSubItem className="group/nav-item">
        <WithBlockedTooltip tooltip={blockedTooltip}>
          <SidebarMenuSubButton
            asChild
            isActive={isTrailActive}
            aria-disabled={item.disabled ? "true" : undefined}
            className={buttonClassName}
          >
            <button type="button" onClick={onToggle} className="w-full justify-start text-left">
              <span className="min-w-0 flex-1 truncate">{label}</span>
              <ChevronRightIcon
                size={16}
                expanded={isOpen}
                className="ml-auto shrink-0 text-label-secondary"
                aria-hidden="true"
              />
            </button>
          </SidebarMenuSubButton>
        </WithBlockedTooltip>
        <GroupChildren>{children}</GroupChildren>
      </SidebarMenuSubItem>
    </Collapsible>
  );
}

type NodeExpandedGroupRootProps = {
  item: AdminNavItem;
  label: string;
  isOpen: boolean;
  isTrailActive: boolean;
  blockedTooltip: string | null;
  onToggle: () => void;
  children: ReactNode;
};

export function NodeExpandedGroupRoot({
  item,
  label,
  isOpen,
  isTrailActive,
  blockedTooltip,
  onToggle,
  children,
}: NodeExpandedGroupRootProps) {
  const Icon = item.icon;
  const buttonClassName = cn(
    "relative z-10",
    NAV_ITEM_HEIGHT_CLASSNAME,
    "rounded-lg",
    INTERACTIVE_TRANSITION_CLASSNAME,
    NAV_ITEM_INTERACTIVE_TEXT_CLASSNAME,
    NAV_ITEM_INTERACTIVE_BG_CLASSNAME,
    item.disabled ? DISABLED_ITEM_CLASSNAME : "hover:cursor-pointer",
  );

  return (
    <Collapsible open={isOpen}>
      <SidebarMenuItem className="group/nav-item">
        <WithBlockedTooltip tooltip={blockedTooltip}>
          <SidebarMenuButton
            isActive={isTrailActive}
            aria-disabled={item.disabled ? "true" : undefined}
            className={cn(buttonClassName, "pl-5")}
            onClick={onToggle}
          >
            {iconSlot(0, Icon, { isActive: isTrailActive })}
            <span className="min-w-0 flex-1 truncate">{label}</span>
            <ChevronRightIcon
              size={16}
              expanded={isOpen}
              className="ml-auto shrink-0 text-label-secondary"
              aria-hidden="true"
            />
          </SidebarMenuButton>
        </WithBlockedTooltip>
        <GroupChildren>{children}</GroupChildren>
      </SidebarMenuItem>
    </Collapsible>
  );
}
