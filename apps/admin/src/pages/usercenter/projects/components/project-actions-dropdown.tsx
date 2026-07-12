import type { SyntheticEvent } from "react";
import { MoreVertical } from "lucide-react";

import { Button } from "@arclayer/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { cn } from "@arclayer/lib/utils";

import type { ProjectMenuItem } from "../types";

const PROJECT_ACTION_BUTTON_CLASSNAME =
  "size-6 shrink-0 text-label-secondary transition-colors hover:text-label-primary";

type ProjectActionsDropdownProps = {
  menuItems: ProjectMenuItem[];
  buttonClassName?: string;
  contentAlign?: "start" | "center" | "end";
  stopPropagation?: boolean;
  onPrepareMenu?: () => void;
  ariaLabel: string;
};

function renderProjectMenuItems(items: ProjectMenuItem[]) {
  return items.map((item) => {
    if (item.type === "divider") {
      return <DropdownMenuSeparator key={item.key} />;
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
}

export function ProjectActionsDropdown({
  menuItems,
  buttonClassName,
  contentAlign = "end",
  stopPropagation = true,
  onPrepareMenu,
  ariaLabel,
}: ProjectActionsDropdownProps) {
  if (menuItems.length === 0) return null;

  const stopEvent = (event: SyntheticEvent) => {
    if (!stopPropagation) return;
    event.stopPropagation();
  };

  return (
    <div onClick={stopEvent} onPointerDown={stopEvent}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={ariaLabel}
            className={cn(PROJECT_ACTION_BUTTON_CLASSNAME, buttonClassName)}
            onPointerEnter={onPrepareMenu}
            onFocus={onPrepareMenu}
          >
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={contentAlign}
          onPointerEnter={onPrepareMenu}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          {renderProjectMenuItems(menuItems)}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
