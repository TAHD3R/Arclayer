"use client";

import * as React from "react";

import type { TElement } from "platejs";

import { toUnitLess } from "@platejs/basic-styles";
import { FontSizePlugin } from "@platejs/basic-styles/react";
import { Minus, Plus } from "lucide-react";
import { KEYS } from "platejs";
import { useEditorPlugin, useEditorSelector } from "platejs/react";

import { ToolbarButton } from "@/components/ui/toolbar";
import { Popover, PopoverContent, PopoverTrigger } from "@arclayer/ui/popover";
import { cn } from "@arclayer/lib/utils";

const DEFAULT_FONT_SIZE = "16";
const FONT_SIZES = [
  "8",
  "9",
  "10",
  "12",
  "14",
  "16",
  "18",
  "24",
  "30",
  "36",
  "48",
  "60",
  "72",
  "96",
] as const;
const FONT_SIZE_MAP = {
  h1: "36",
  h2: "24",
  h3: "20",
} as const;

export function FontSizeToolbarButton(props: { tooltip?: string }) {
  const [inputValue, setInputValue] = React.useState(DEFAULT_FONT_SIZE);
  const [open, setOpen] = React.useState(false);
  const [isFocused, setIsFocused] = React.useState(false);
  const { editor, tf } = useEditorPlugin(FontSizePlugin);

  const cursorFontSize = useEditorSelector((currentEditor) => {
    const fontSize = currentEditor.api.marks()?.[KEYS.fontSize];
    if (fontSize) {
      return toUnitLess(fontSize as string);
    }

    const [block] = currentEditor.api.block<TElement>() || [];
    if (!block?.type) return DEFAULT_FONT_SIZE;

    return block.type in FONT_SIZE_MAP
      ? FONT_SIZE_MAP[block.type as keyof typeof FONT_SIZE_MAP]
      : DEFAULT_FONT_SIZE;
  }, []);

  const displayValue = isFocused ? inputValue : cursorFontSize;

  const commitInputValue = React.useCallback(() => {
    const nextSize = toUnitLess(inputValue);
    const parsedSize = Number.parseInt(nextSize, 10);

    if (!Number.isFinite(parsedSize) || parsedSize < 1 || parsedSize > 100) {
      editor.tf.focus();
      setIsFocused(false);
      return;
    }

    if (nextSize !== toUnitLess(cursorFontSize)) {
      tf.fontSize.addMark(`${nextSize}px`);
    }

    editor.tf.focus();
    setIsFocused(false);
  }, [cursorFontSize, editor, inputValue, tf.fontSize]);

  const adjustFontSize = React.useCallback(
    (delta: number) => {
      const nextSize = Math.max(1, Number(displayValue) + delta);
      tf.fontSize.addMark(`${nextSize}px`);
      editor.tf.focus();
    },
    [displayValue, editor, tf.fontSize],
  );

  return (
    <div className="flex h-8 items-center gap-1 rounded-md border border-border/70 bg-muted/25 px-1">
      <ToolbarButton
        size="sm"
        tooltip={props.tooltip}
        onClick={() => adjustFontSize(-1)}
        onMouseDown={(event) => event.preventDefault()}
      >
        <Minus />
      </ToolbarButton>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <input
            type="text"
            value={displayValue}
            className={cn(
              "h-6 w-11 shrink-0 rounded bg-transparent px-1 text-center text-sm outline-none transition-colors hover:bg-accent/60",
              isFocused && "bg-accent/60",
            )}
            data-plate-focus="true"
            onBlur={() => {
              commitInputValue();
              setOpen(false);
            }}
            onChange={(event) => setInputValue(event.target.value)}
            onFocus={() => {
              setIsFocused(true);
              setOpen(true);
              setInputValue(toUnitLess(cursorFontSize));
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitInputValue();
                setOpen(false);
              }
            }}
          />
        </PopoverTrigger>
        <PopoverContent
          align="center"
          sideOffset={10}
          className="w-12 rounded-xl border border-border/70 p-1 shadow-xl"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <div className="max-h-56 overflow-y-auto">
            {FONT_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                className={cn(
                  "flex h-8 w-full items-center justify-center rounded-md text-sm transition-colors hover:bg-accent",
                  size === displayValue && "bg-accent",
                )}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  tf.fontSize.addMark(`${size}px`);
                  setOpen(false);
                  setIsFocused(false);
                  editor.tf.focus();
                }}
              >
                {size}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <ToolbarButton
        size="sm"
        tooltip={props.tooltip}
        onClick={() => adjustFontSize(1)}
        onMouseDown={(event) => event.preventDefault()}
      >
        <Plus />
      </ToolbarButton>
    </div>
  );
}
