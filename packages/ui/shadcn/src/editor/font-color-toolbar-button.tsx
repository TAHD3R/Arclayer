"use client";

import * as React from "react";

import { CheckIcon, EraserIcon } from "lucide-react";
import { useEditorRef, useEditorSelector } from "platejs/react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { ToolbarButton, ToolbarMenuGroup } from "./ui/toolbar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@arclayer/ui/tooltip";
import { cn } from "@arclayer/lib/utils";

const DEFAULT_COLORS = [
  "#000000",
  "#434343",
  "#666666",
  "#999999",
  "#cccccc",
  "#ffffff",
  "#980100",
  "#fe0000",
  "#fe9900",
  "#feff00",
  "#00ff00",
  "#00ffff",
  "#4b85e8",
  "#1300ff",
  "#9900ff",
  "#ff00ff",
  "#f4cccc",
  "#fff2cc",
  "#d9ead3",
  "#c9daf8",
  "#ead1dc",
  "#ffe599",
  "#b6d7a8",
  "#a4c2f4",
];

function normalizeColor(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function isBrightColor(hex: string) {
  const value = hex.replace("#", "");
  if (value.length !== 6) return false;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 130;
}

export function FontColorToolbarButton({
  children,
  nodeType,
  tooltip,
}: {
  children: React.ReactNode;
  nodeType: string;
  tooltip: string;
}) {
  const editor = useEditorRef();
  const [open, setOpen] = React.useState(false);
  const selectedColor = useEditorSelector(
    (currentEditor) => currentEditor.api.mark(nodeType) as string | undefined,
    [nodeType],
  );

  const applyColor = (value: string) => {
    if (!editor.selection) return;
    editor.tf.select(editor.selection);
    editor.tf.addMarks({ [nodeType]: value });
    editor.tf.focus();
    setOpen(false);
  };

  const clearColor = () => {
    if (!editor.selection) return;
    editor.tf.select(editor.selection);
    editor.tf.removeMarks(nodeType);
    editor.tf.focus();
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton pressed={open} tooltip={tooltip}>
          {children}
        </ToolbarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="ignore-click-outside/toolbar w-[15rem]">
        <ToolbarMenuGroup label={tooltip}>
          <div className="grid grid-cols-6 gap-1 px-2 pb-2 pt-1">
            <TooltipProvider>
              {DEFAULT_COLORS.map((color) => {
                const active = normalizeColor(selectedColor) === normalizeColor(color);
                return (
                  <Tooltip key={color}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "flex size-7 items-center justify-center rounded-full border transition-transform hover:scale-110",
                          isBrightColor(color) ? "border-border" : "border-transparent",
                        )}
                        style={{ backgroundColor: color }}
                        onClick={() => applyColor(color)}
                      >
                        {active ? (
                          <CheckIcon
                            className={cn(
                              "size-3",
                              isBrightColor(color) ? "text-black" : "text-white",
                            )}
                          />
                        ) : null}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{color}</TooltipContent>
                  </Tooltip>
                );
              })}
            </TooltipProvider>
          </div>
        </ToolbarMenuGroup>
        {selectedColor ? (
          <ToolbarMenuGroup>
            <DropdownMenuItem onSelect={clearColor}>
              <EraserIcon />
              Clear
            </DropdownMenuItem>
          </ToolbarMenuGroup>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
