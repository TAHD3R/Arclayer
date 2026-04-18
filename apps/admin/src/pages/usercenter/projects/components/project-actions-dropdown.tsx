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

import type { ProjectMenuItem } from "../types";

const PROJECT_ACTION_BUTTON_CLASSNAME =
  "inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-label-secondary transition-colors hover:bg-accent/70 hover:text-label-primary";

type ProjectActionsDropdownProps = {
  menuItems: ProjectMenuItem[];
  buttonClassName?: string;
  contentAlign?: "start" | "center" | "end";
  stopPropagation?: boolean;
  onPrepareMenu?: () => void;
};

export function ProjectActionsDropdown({
  menuItems,
  buttonClassName,
  contentAlign = "end",
  stopPropagation = true,
  onPrepareMenu,
}: ProjectActionsDropdownProps) {
  if (menuItems.length === 0) return null;

  const stopEvent = (event: SyntheticEvent) => {
    if (!stopPropagation) return;
    event.stopPropagation();
  };

  const renderItems = (items: ProjectMenuItem[]) =>
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
            className={cn(PROJECT_ACTION_BUTTON_CLASSNAME, buttonClassName)}
            onPointerEnter={onPrepareMenu}
            onFocus={onPrepareMenu}
          >
            <MoreVertical className="size-4" />
          </ButtonPrimitive>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={contentAlign}
          onPointerEnter={onPrepareMenu}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          {renderItems(menuItems)}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
