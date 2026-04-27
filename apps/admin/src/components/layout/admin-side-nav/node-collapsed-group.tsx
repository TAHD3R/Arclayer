import type { AdminNavItem } from "@/types/admin-nav";
import { cn } from "@arclayer/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { SidebarMenuItem } from "@arclayer/ui/sidebar";

import type { CollapsedDropdownController } from "./collapsed-dropdown";
import { WithBlockedTooltip } from "./blocked-tooltip";
import { CollapsedNavButton } from "./collapsed-nav-button";

export type ResolvedChildItem = {
  key: string;
  label: string;
  to: string | undefined;
  disabled: boolean;
  isActive: boolean;
  Icon: AdminNavItem["icon"] | undefined;
};

type NodeCollapsedGroupProps = {
  itemKey: string;
  label: string;
  Icon: AdminNavItem["icon"] | undefined;
  isTrailActive: boolean;
  isDisabled: boolean;
  blockedTooltip: string | null;
  children: readonly ResolvedChildItem[];
  hoverDropdown: CollapsedDropdownController;
  onNavigate: (to: string) => void;
};

const DROPDOWN_CHILD_ITEM_CLASSNAME = cn(
  "relative z-10 h-8 rounded-md text-callout text-label-secondary",
  "transition-[color,background-color] duration-200 ease-out",
  "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
  "focus:bg-accent focus:text-accent-foreground dark:focus:bg-accent/50",
  "data-[active=true]:bg-accent data-[active=true]:text-accent-foreground dark:data-[active=true]:bg-accent/50",
  "aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground aria-[current=page]:font-semibold dark:aria-[current=page]:bg-accent/50",
);

const COLLAPSED_GROUP_LABEL_STYLE = {
  fontSize: "var(--font-size-headline)",
  lineHeight: "var(--line-height-headline)",
  fontWeight: "var(--font-weight-headline)",
} as const;

function CollapsedGroupTrigger(props: {
  label: string;
  Icon: AdminNavItem["icon"] | undefined;
  isTrailActive: boolean;
  isDisabled: boolean;
}) {
  return (
    <DropdownMenuTrigger asChild>
      <CollapsedNavButton
        label={props.label}
        Icon={props.Icon}
        isActive={props.isTrailActive}
        isDisabled={props.isDisabled}
      />
    </DropdownMenuTrigger>
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
      className="min-w-56 gap-1 data-[state=closed]:pointer-events-none **:data-[slot=motion-highlight]:hidden"
      onCloseAutoFocus={(event) => event.preventDefault()}
      onPointerEnter={props.hoverDropdown.markActivity}
      onPointerMove={props.hoverDropdown.markActivity}
      onPointerLeave={props.hoverDropdown.scheduleClose}
      onFocusCapture={props.hoverDropdown.markActivity}
      onBlurCapture={props.hoverDropdown.scheduleClose}
      onKeyDown={props.hoverDropdown.markActivity}
      onEscapeKeyDown={props.hoverDropdown.close}
    >
      <DropdownMenuLabel className="text-label-primary" style={COLLAPSED_GROUP_LABEL_STYLE}>
        {props.label}
      </DropdownMenuLabel>
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

export function NodeCollapsedGroup({
  itemKey,
  label,
  Icon,
  isTrailActive,
  isDisabled,
  blockedTooltip,
  children,
  hoverDropdown,
  onNavigate,
}: NodeCollapsedGroupProps) {
  const dropdownOpen = hoverDropdown.isOpen(itemKey);

  return (
    <SidebarMenuItem
      className="group/nav-item"
      onPointerEnter={() => {
        if (isDisabled) return;
        hoverDropdown.open(itemKey);
      }}
      onPointerMove={() => {
        if (isDisabled) return;
        hoverDropdown.open(itemKey);
      }}
      onPointerLeave={hoverDropdown.scheduleClose}
      onFocusCapture={() => {
        if (isDisabled) return;
        hoverDropdown.open(itemKey);
      }}
      onBlurCapture={hoverDropdown.scheduleClose}
    >
      <WithBlockedTooltip tooltip={blockedTooltip}>
        <DropdownMenu
          modal={false}
          open={dropdownOpen}
          onOpenChange={(open) => {
            if (isDisabled) {
              hoverDropdown.close();
              return;
            }
            if (open) hoverDropdown.open(itemKey);
            else hoverDropdown.close();
          }}
        >
          <CollapsedGroupTrigger
            label={label}
            Icon={Icon}
            isTrailActive={isTrailActive}
            isDisabled={isDisabled}
          />
          <CollapsedGroupContent
            label={label}
            children={children}
            hoverDropdown={hoverDropdown}
            onNavigate={onNavigate}
          />
        </DropdownMenu>
      </WithBlockedTooltip>
    </SidebarMenuItem>
  );
}
