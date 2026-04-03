"use client";

import * as React from "react";

import { CheckIcon } from "lucide-react";

import {
  DropdownMenuIconItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@arclayer/ui/dropdown-menu";
import { cn } from "@arclayer/lib/utils";

import {
  doesEditorMarkColorMatch,
  getEditorColorOptions,
  getEditorMarkColorValue,
  isBrightColor,
} from "./mark-color-utils";

export function ColorDropdownSubmenu(props: {
  clearLabel: string;
  currentColor?: string | null;
  icon: React.ReactNode;
  label: string;
  nodeType: string;
  onClear: () => void;
  onSelectColor: (color: string) => void;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="gap-2">
        {props.icon}
        {props.label}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-[17rem] p-0">
        <div className="grid grid-cols-6 gap-1.5 p-3">
          {getEditorColorOptions()
            .filter((option) => option.color !== null)
            .map((option) => {
              const color = String(option.color);
              const active = doesEditorMarkColorMatch(props.nodeType, props.currentColor, color);

              return (
                <button
                  key={color}
                  type="button"
                  className={cn(
                    "flex size-7 items-center justify-center rounded-md border transition-transform hover:scale-[1.04]",
                    isBrightColor(color) ? "border-border/70" : "border-transparent",
                    active && "ring-2 ring-brand/35 ring-offset-1 ring-offset-popover",
                  )}
                  style={{ backgroundColor: getEditorMarkColorValue(props.nodeType, color) }}
                  onClick={() => props.onSelectColor(color)}
                >
                  {active ? (
                    <CheckIcon
                      className={cn("size-3.5", isBrightColor(color) ? "text-black" : "text-white")}
                    />
                  ) : null}
                  <span className="sr-only">{color}</span>
                </button>
              );
            })}
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuIconItem onSelect={props.onClear}>{props.clearLabel}</DropdownMenuIconItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
