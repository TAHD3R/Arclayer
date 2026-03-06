import { Collapsible, CollapsibleContent } from "@celestial/ui/collapsible";
import ChevronRightIcon from "@celestial/ui/icons/chevron-right";
import { cn } from "@celestial/lib/utils";
import { Button as ButtonPrimitive } from "@celestial/ui/button-primitive";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuTrigger,
} from "@celestial/ui/dropdown-menu";
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@celestial/ui/sidebar";
import type { ReactNode } from "react";

import { WithBlockedTooltip } from "./blocked-tooltip";
import type { CollapsedDropdownController } from "./collapsed-dropdown";
import {
  DISABLED_ITEM_CLASSNAME,
  INTERACTIVE_TRANSITION_CLASSNAME,
  NAV_ITEM_COLLAPSE_HIDE_CLASSNAME,
  NAV_ITEM_INTERACTIVE_BG_CLASSNAME,
  NAV_ITEM_INTERACTIVE_TEXT_CLASSNAME,
} from "./nav-node-styles";
import { NAV_ITEM_COLLAPSED_BUTTON_CLASSNAME, NAV_ITEM_HEIGHT_CLASSNAME } from "./nav-utils";
import type { AdminNavItem } from "@/types/admin-nav";
import { iconSlot } from "./nav-icon-slot";
import type { ResolvedChildItem } from "./node-collapsed-group";

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

function CollapsedGroupContent(props: {
  children: readonly ResolvedChildItem[];
  hoverDropdown: CollapsedDropdownController;
  onNavigate: (to: string) => void;
}) {
  return (
    <DropdownMenuContent
      side="right"
      align="start"
      sideOffset={8}
      className="min-w-56 data-[state=closed]:pointer-events-none"
      onPointerEnter={props.hoverDropdown.markActivity}
      onPointerMove={props.hoverDropdown.markActivity}
      onFocusCapture={props.hoverDropdown.markActivity}
      onKeyDown={props.hoverDropdown.markActivity}
    >
      {props.children.map((child) => (
        <DropdownMenuIconItem
          key={child.key}
          disabled={child.disabled}
          icon={child.Icon ? <child.Icon className="size-4" aria-hidden="true" /> : undefined}
          onSelect={() => {
            props.hoverDropdown.close();
            if (!child.to || child.disabled) return;
            props.onNavigate(child.to);
          }}
        >
          {child.label}
        </DropdownMenuIconItem>
      ))}
    </DropdownMenuContent>
  );
}

type GroupRootButtonProps = {
  item: AdminNavItem;
  label: string;
  isOpen: boolean;
  isTrailActive: boolean;
  onClick?: () => void;
};

function GroupRootButton({ item, label, isOpen, isTrailActive, onClick }: GroupRootButtonProps) {
  const Icon = item.icon;
  const className = cn(
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
  );

  return (
    <SidebarMenuButton
      isActive={isTrailActive}
      tooltip={label}
      aria-disabled={item.disabled ? "true" : undefined}
      className={className}
      onClick={onClick}
    >
      {iconSlot(0, Icon, { isActive: isTrailActive, collapseMotion: "shift" })}
      <span className={cn("min-w-0 flex-1 truncate", NAV_ITEM_COLLAPSE_HIDE_CLASSNAME)}>
        {label}
      </span>
      <span className={cn("ml-auto shrink-0", NAV_ITEM_COLLAPSE_HIDE_CLASSNAME)}>
        <ChevronRightIcon
          size={16}
          expanded={isOpen}
          className="shrink-0 text-label-secondary"
          aria-hidden="true"
        />
      </span>
    </SidebarMenuButton>
  );
}

type GroupRootDropdownProps = {
  item: AdminNavItem;
  label: string;
  isOpen: boolean;
  isTrailActive: boolean;
  blockedTooltip: string | null;
  dropdownEnabled: boolean;
  dropdownOpen: boolean;
  hoverDropdown: CollapsedDropdownController | null;
  collapsedChildren: readonly ResolvedChildItem[];
  onNavigate: (to: string) => void;
  onToggle: () => void;
};

function GroupRootDropdown({
  item,
  label,
  isOpen,
  isTrailActive,
  blockedTooltip,
  dropdownEnabled,
  dropdownOpen,
  hoverDropdown,
  collapsedChildren,
  onNavigate,
  onToggle,
}: GroupRootDropdownProps) {
  return (
    <WithBlockedTooltip tooltip={blockedTooltip}>
      <DropdownMenu
        modal={false}
        open={dropdownOpen}
        onOpenChange={(open) => {
          if (!dropdownEnabled || !hoverDropdown) return;
          if (item.disabled) {
            hoverDropdown.close();
            return;
          }
          if (open) hoverDropdown.open(item.key);
          else hoverDropdown.close();
        }}
      >
        <DropdownMenuTrigger asChild>
          <GroupRootButton
            item={item}
            label={label}
            isOpen={isOpen}
            isTrailActive={isTrailActive}
            onClick={dropdownEnabled ? undefined : onToggle}
          />
        </DropdownMenuTrigger>
        {dropdownEnabled && hoverDropdown ? (
          <CollapsedGroupContent
            children={collapsedChildren}
            hoverDropdown={hoverDropdown}
            onNavigate={onNavigate}
          />
        ) : null}
      </DropdownMenu>
    </WithBlockedTooltip>
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
            <ButtonPrimitive
              type="button"
              hoverScale={1}
              tapScale={1}
              onClick={onToggle}
              className="w-full justify-start text-left"
            >
              <span className="min-w-0 flex-1 truncate">{label}</span>
              <ChevronRightIcon
                size={16}
                expanded={isOpen}
                className="ml-auto shrink-0 text-label-secondary"
                aria-hidden="true"
              />
            </ButtonPrimitive>
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
  isCollapsed: boolean;
  isOpen: boolean;
  isTrailActive: boolean;
  blockedTooltip: string | null;
  hoverDropdown: CollapsedDropdownController | null;
  collapsedChildren: readonly ResolvedChildItem[];
  onNavigate: (to: string) => void;
  onToggle: () => void;
  children: ReactNode;
};

export function NodeExpandedGroupRoot({
  item,
  label,
  isCollapsed,
  isOpen,
  isTrailActive,
  blockedTooltip,
  hoverDropdown,
  collapsedChildren,
  onNavigate,
  onToggle,
  children,
}: NodeExpandedGroupRootProps) {
  const dropdownEnabled = isCollapsed && hoverDropdown !== null;
  const dropdownOpen = dropdownEnabled ? hoverDropdown.isOpen(item.key) : false;

  return (
    <Collapsible open={dropdownEnabled ? false : isOpen}>
      <SidebarMenuItem className="group/nav-item">
        <GroupRootDropdown
          item={item}
          label={label}
          isOpen={isOpen}
          isTrailActive={isTrailActive}
          blockedTooltip={blockedTooltip}
          dropdownEnabled={dropdownEnabled}
          dropdownOpen={dropdownOpen}
          hoverDropdown={hoverDropdown}
          collapsedChildren={collapsedChildren}
          onNavigate={onNavigate}
          onToggle={onToggle}
        />
        {dropdownEnabled ? null : <GroupChildren>{children}</GroupChildren>}
      </SidebarMenuItem>
    </Collapsible>
  );
}
