import type { AdminNavItem } from "@/types/admin-nav";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuTrigger,
} from "@celestial/ui/dropdown-menu";
import { SidebarMenuItem } from "@celestial/ui/sidebar";

import type { CollapsedDropdownController } from "./collapsed-dropdown";
import { WithBlockedTooltip } from "./blocked-tooltip";
import { CollapsedNavButton } from "./collapsed-nav-button";

export type ResolvedChildItem = {
  key: string;
  label: string;
  to: string | undefined;
  disabled: boolean;
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

function CollapsedGroupTrigger(props: {
  itemKey: string;
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
    <SidebarMenuItem className="group/nav-item">
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
            itemKey={itemKey}
            label={label}
            Icon={Icon}
            isTrailActive={isTrailActive}
            isDisabled={isDisabled}
          />
          <CollapsedGroupContent
            children={children}
            hoverDropdown={hoverDropdown}
            onNavigate={onNavigate}
          />
        </DropdownMenu>
      </WithBlockedTooltip>
    </SidebarMenuItem>
  );
}
