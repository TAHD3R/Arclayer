import { MoreVertical } from "lucide-react";

import { Button as ButtonPrimitive } from "@arclayer/ui/button-primitive";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuSeparator,
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

  const stopEvent = (event: React.SyntheticEvent) => {
    if (!stopPropagation) return;
    event.stopPropagation();
  };

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
        <DropdownMenuContent align={contentAlign}>
          {menuItems.map((item) =>
            item.type === "divider" ? (
              <DropdownMenuSeparator key={item.key} />
            ) : (
              <DropdownMenuIconItem
                key={item.key}
                onSelect={item.onClick}
                disabled={item.disabled}
                variant={item.danger ? "destructive" : undefined}
                icon={item.icon}
              >
                {item.label}
              </DropdownMenuIconItem>
            ),
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
