import { Collapsible, CollapsibleContent } from "@arclayer/ui/collapsible";
import { cn } from "@arclayer/lib/utils";
import { Button as ButtonPrimitive } from "@arclayer/ui/button-primitive";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@arclayer/ui/sidebar";
import { ChevronRight } from "lucide-react";
import * as React from "react";
import type { MouseEventHandler, ReactNode } from "react";

import { WithBlockedTooltip } from "./blocked-tooltip";
import type { CollapsedDropdownController } from "./collapsed-dropdown";
import {
  DISABLED_ITEM_CLASSNAME,
  INTERACTIVE_TRANSITION_CLASSNAME,
  NAV_ITEM_COLLAPSE_HIDE_CLASSNAME,
  NAV_ITEM_INTERACTIVE_BG_CLASSNAME,
  NAV_ITEM_INTERACTIVE_TEXT_CLASSNAME,
} from "./nav-node-styles";
import {
  NAV_ITEM_BUTTON_PADDING_CLASSNAME,
  NAV_ITEM_COLLAPSED_BUTTON_CLASSNAME,
  NAV_ITEM_HEIGHT_CLASSNAME,
  NAV_ITEM_RADIUS_CLASSNAME,
  NAV_SUBTREE_CLASSNAME,
  NAV_SUBTREE_GUIDE_CLASSNAME,
} from "./nav-utils";
import type { AdminNavItem } from "@/types/admin-nav";
import { iconSlot } from "./nav-icon-slot";
import type { ResolvedChildItem } from "./node-collapsed-group";

const COLLAPSIBLE_CONTENT_CLASSNAME = cn(
  "pt-1.5 overflow-hidden",
  "motion-reduce:animate-none",
  "data-[state=open]:animate-[arclayer-collapsible-down_180ms_ease-out]",
  "data-[state=closed]:animate-[arclayer-collapsible-up_160ms_ease-in]",
);

const DROPDOWN_CHILD_ITEM_CLASSNAME = cn(
  "relative z-10 h-9 rounded-md text-callout text-label-secondary",
  "transition-[color,background-color] duration-200 ease-out",
  "hover:bg-accent/40 hover:text-label-primary",
  "focus:bg-accent/40 focus:text-label-primary",
  "data-[active=true]:bg-accent/40 data-[active=true]:text-label-primary",
  "aria-[current=page]:bg-accent/50 aria-[current=page]:text-foreground aria-[current=page]:font-semibold",
);

function GroupChildren({ children }: { children: ReactNode }) {
  return (
    <CollapsibleContent className={COLLAPSIBLE_CONTENT_CLASSNAME}>
      <div className={NAV_SUBTREE_GUIDE_CLASSNAME}>
        <SidebarMenuSub className={NAV_SUBTREE_CLASSNAME}>{children}</SidebarMenuSub>
      </div>
    </CollapsibleContent>
  );
}

function CollapsedGroupContent(props: {
  label: string;
  children: readonly ResolvedChildItem[];
  hoverDropdown: CollapsedDropdownController;
  onNavigate: (to: string) => void;
}) {
  return (
    <DropdownMenuContent
      side="right"
      align="start"
      sideOffset={8}
      className="min-w-56 gap-1 data-[state=closed]:pointer-events-none [&_[data-slot=motion-highlight]]:hidden"
      onCloseAutoFocus={(event) => event.preventDefault()}
      onPointerEnter={props.hoverDropdown.markActivity}
      onPointerMove={props.hoverDropdown.markActivity}
      onPointerLeave={props.hoverDropdown.scheduleClose}
      onFocusCapture={props.hoverDropdown.markActivity}
      onBlurCapture={props.hoverDropdown.scheduleClose}
      onKeyDown={props.hoverDropdown.markActivity}
      onEscapeKeyDown={props.hoverDropdown.close}
    >
      <DropdownMenuLabel className="!text-headline">{props.label}</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <div className="flex flex-col gap-1">
        {props.children.map((child) => (
          <DropdownMenuIconItem
            key={child.key}
            disabled={child.disabled}
            aria-current={child.isActive ? "page" : undefined}
            className={cn(DROPDOWN_CHILD_ITEM_CLASSNAME, !child.disabled && "hover:cursor-pointer")}
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
      </div>
    </DropdownMenuContent>
  );
}

type GroupRootButtonProps = Omit<
  React.ComponentPropsWithoutRef<typeof SidebarMenuButton>,
  "children" | "isActive" | "tooltip"
> & {
  item: AdminNavItem;
  label: string;
  isOpen: boolean;
  isTrailActive: boolean;
  tooltip?: string;
};

const GroupRootButton = React.forwardRef<HTMLButtonElement, GroupRootButtonProps>(
  function GroupRootButton(
    { item, label, isOpen, isTrailActive, tooltip, ...triggerProps }: GroupRootButtonProps,
    ref,
  ) {
    const Icon = item.icon;
    const className = cn(
      "relative z-10",
      NAV_ITEM_HEIGHT_CLASSNAME,
      NAV_ITEM_BUTTON_PADDING_CLASSNAME,
      NAV_ITEM_RADIUS_CLASSNAME,
      INTERACTIVE_TRANSITION_CLASSNAME,
      NAV_ITEM_INTERACTIVE_TEXT_CLASSNAME,
      NAV_ITEM_INTERACTIVE_BG_CLASSNAME,
      NAV_ITEM_COLLAPSED_BUTTON_CLASSNAME,
      "group-data-[collapsible=icon]:gap-0",
      item.disabled ? DISABLED_ITEM_CLASSNAME : "hover:cursor-pointer",
    );

    return (
      <SidebarMenuButton
        ref={ref}
        isActive={isTrailActive}
        tooltip={tooltip}
        aria-disabled={item.disabled ? "true" : undefined}
        className={className}
        {...triggerProps}
      >
        {iconSlot(0, Icon, { isActive: isTrailActive, collapseMotion: "shift" })}
        <span className={cn("min-w-0 flex-1 truncate", NAV_ITEM_COLLAPSE_HIDE_CLASSNAME)}>
          {label}
        </span>
        <span className={cn("ml-auto shrink-0", NAV_ITEM_COLLAPSE_HIDE_CLASSNAME)}>
          <ChevronRight
            size={16}
            className={cn(
              "shrink-0 text-label-secondary transition-transform duration-200",
              isOpen && "rotate-90",
            )}
            aria-hidden="true"
          />
        </span>
      </SidebarMenuButton>
    );
  },
);

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
  collapsedNavigateTarget: string | null;
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
  collapsedNavigateTarget,
  onNavigate,
  onToggle,
}: GroupRootDropdownProps) {
  const triggerTooltip = dropdownEnabled ? undefined : label;

  const handleClick: MouseEventHandler<HTMLButtonElement> = () => {
    if (item.disabled) return;
    if (!dropdownEnabled) {
      onToggle();
      return;
    }
    hoverDropdown?.close();
    if (!collapsedNavigateTarget) return;
    onNavigate(collapsedNavigateTarget);
  };

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
            isOpen={isOpen || dropdownOpen}
            isTrailActive={isTrailActive}
            tooltip={triggerTooltip}
            onClick={handleClick}
          />
        </DropdownMenuTrigger>
        {dropdownEnabled && hoverDropdown ? (
          <CollapsedGroupContent
            label={label}
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
    NAV_ITEM_BUTTON_PADDING_CLASSNAME,
    NAV_ITEM_RADIUS_CLASSNAME,
    INTERACTIVE_TRANSITION_CLASSNAME,
    NAV_ITEM_INTERACTIVE_TEXT_CLASSNAME,
    "bg-transparent focus-visible:bg-transparent data-[active=true]:bg-transparent",
    "[&:not([data-highlight])]:hover:bg-transparent",
    "text-callout",
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
  collapsedNavigateTarget: string | null;
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
  collapsedNavigateTarget,
  onNavigate,
  onToggle,
  children,
}: NodeExpandedGroupRootProps) {
  const dropdownEnabled = isCollapsed && hoverDropdown !== null;
  const dropdownOpen = dropdownEnabled ? hoverDropdown.isOpen(item.key) : false;

  return (
    <Collapsible open={dropdownEnabled ? false : isOpen}>
      <SidebarMenuItem
        className="group/nav-item"
        onPointerEnter={() => {
          if (!dropdownEnabled || !hoverDropdown || item.disabled) return;
          hoverDropdown.open(item.key);
        }}
        onPointerMove={() => {
          if (!dropdownEnabled || !hoverDropdown || item.disabled) return;
          hoverDropdown.open(item.key);
        }}
        onPointerLeave={() => {
          if (!dropdownEnabled || !hoverDropdown) return;
          hoverDropdown.scheduleClose();
        }}
        onFocusCapture={() => {
          if (!dropdownEnabled || !hoverDropdown || item.disabled) return;
          hoverDropdown.open(item.key);
        }}
        onBlurCapture={() => {
          if (!dropdownEnabled || !hoverDropdown) return;
          hoverDropdown.scheduleClose();
        }}
      >
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
          collapsedNavigateTarget={collapsedNavigateTarget}
          onNavigate={onNavigate}
          onToggle={onToggle}
        />
        {dropdownEnabled ? null : <GroupChildren>{children}</GroupChildren>}
      </SidebarMenuItem>
    </Collapsible>
  );
}
