import type { SyntheticEvent } from "react";
import { MoreVertical } from "lucide-react";

import { Button as ButtonPrimitive } from "@arclayer/ui/button-primitive";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuItemContent,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { cn } from "@arclayer/lib/utils";

import type { WorkspaceMenuItem } from "../types";

const WORKSPACE_ACTION_BUTTON_CLASSNAME =
  "inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-label-secondary transition-colors hover:bg-accent/70 hover:text-label-primary";

type WorkspaceActionsDropdownProps = {
  menuItems: WorkspaceMenuItem[];
  buttonClassName?: string;
  contentAlign?: "start" | "center" | "end";
  stopPropagation?: boolean;
};

export function WorkspaceActionsDropdown({
  menuItems,
  buttonClassName,
  contentAlign = "end",
  stopPropagation = true,
}: WorkspaceActionsDropdownProps) {
  if (menuItems.length === 0) return null;

  const stopEvent = (event: SyntheticEvent) => {
    if (!stopPropagation) return;
    event.stopPropagation();
  };

  const renderItems = (items: WorkspaceMenuItem[]) =>
    items.map((item) => {
      if (item.type === "divider") {
        return <DropdownMenuSeparator key={item.key} />;
      }

      if (item.children?.length) {
        return (
          <DropdownMenuSub key={item.key}>
            <DropdownMenuSubTrigger disabled={item.disabled}>
              <DropdownMenuItemContent icon={item.icon}>{item.label}</DropdownMenuItemContent>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>{renderItems(item.children)}</DropdownMenuSubContent>
          </DropdownMenuSub>
        );
      }

      return (
        <DropdownMenuIconItem
          key={item.key}
          onSelect={item.onClick}
          disabled={item.disabled}
          variant={item.danger ? "destructive" : undefined}
          icon={item.icon}
        >
          {item.label}
        </DropdownMenuIconItem>
      );
    });

  return (
    <div onClick={stopEvent} onPointerDown={stopEvent}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <ButtonPrimitive
            type="button"
            tapScale={1}
            className={cn(WORKSPACE_ACTION_BUTTON_CLASSNAME, buttonClassName)}
          >
            <MoreVertical className="size-4" />
          </ButtonPrimitive>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={contentAlign}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          {renderItems(menuItems)}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
