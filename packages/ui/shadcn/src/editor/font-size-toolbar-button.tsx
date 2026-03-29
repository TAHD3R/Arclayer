"use client";

import * as React from "react";

import type { TElement } from "platejs";

import { toUnitLess } from "@platejs/basic-styles";
import { FontSizePlugin } from "@platejs/basic-styles/react";
import { ChevronDown, Minus, Plus } from "lucide-react";
import { KEYS } from "platejs";
import { useEditorPlugin, useEditorSelector } from "platejs/react";

import { ToolbarButton } from "./ui/toolbar";
import { captureEditorSelection, runEditorTransformPreservingSelection } from "./transforms";
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
  const [open, setOpen] = React.useState(false);
  const { editor, tf } = useEditorPlugin(FontSizePlugin);
  const selectionRef = React.useRef(captureEditorSelection(editor));

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

  const adjustFontSize = React.useCallback(
    (delta: number) => {
      const nextSize = Math.max(1, Number(cursorFontSize) + delta);
      runEditorTransformPreservingSelection(
        editor,
        () => {
          tf.fontSize.addMark(`${nextSize}px`);
        },
        { selection: selectionRef.current },
      );
    },
    [cursorFontSize, editor, tf.fontSize],
  );

  const applyFontSize = React.useCallback(
    (size: string) => {
      runEditorTransformPreservingSelection(
        editor,
        () => {
          tf.fontSize.addMark(`${size}px`);
        },
        { selection: selectionRef.current },
      );
      setOpen(false);
    },
    [editor, tf.fontSize],
  );

  return (
    <div className="flex h-8 items-center gap-1 rounded-md border border-border/70 bg-muted/25 px-1">
      <ToolbarButton
        size="sm"
        tooltip={props.tooltip}
        onClick={() => adjustFontSize(-1)}
        onMouseDown={(event) => {
          event.preventDefault();
          selectionRef.current = captureEditorSelection(editor);
        }}
      >
        <Minus />
      </ToolbarButton>

      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            selectionRef.current = captureEditorSelection(editor);
          }
          setOpen(nextOpen);
        }}
      >
        <PopoverTrigger asChild>
          <ToolbarButton
            size="sm"
            pressed={open}
            className="h-6 min-w-11 shrink-0 gap-1 rounded bg-transparent px-1 text-center text-footnote font-medium hover:bg-accent/60"
            tooltip={props.tooltip}
            data-plate-focus="true"
            onMouseDown={(event) => {
              event.preventDefault();
              selectionRef.current = captureEditorSelection(editor);
            }}
          >
            <span>{toUnitLess(cursorFontSize)}</span>
            <ChevronDown className="size-3 text-label-secondary" />
          </ToolbarButton>
        </PopoverTrigger>
        <PopoverContent
          align="center"
          sideOffset={10}
          className="w-14 rounded-xl border border-border/70 p-1"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            runEditorTransformPreservingSelection(editor, () => undefined, {
              selection: selectionRef.current,
            });
          }}
        >
          {FONT_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              className={cn(
                "flex h-8 w-full items-center justify-center rounded-md text-footnote transition-colors hover:bg-accent",
                size === toUnitLess(cursorFontSize) && "bg-accent",
              )}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyFontSize(size)}
            >
              {size}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      <ToolbarButton
        size="sm"
        tooltip={props.tooltip}
        onClick={() => adjustFontSize(1)}
        onMouseDown={(event) => {
          event.preventDefault();
          selectionRef.current = captureEditorSelection(editor);
        }}
      >
        <Plus />
      </ToolbarButton>
    </div>
  );
}
