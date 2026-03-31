"use client";

import * as React from "react";

import type { TElement } from "platejs";

import { toUnitLess } from "@platejs/basic-styles";
import { FontSizePlugin } from "@platejs/basic-styles/react";
import { ChevronDown, Minus, Plus } from "lucide-react";
import { KEYS } from "platejs";
import { useEditorPlugin, useEditorSelector } from "platejs/react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { cn } from "@arclayer/lib/utils";

import { captureEditorSelection, runEditorTransformPreservingSelection } from "./transforms";
import { ToolbarButton, ToolbarTooltip } from "./ui/toolbar";

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
      <ToolbarTooltip tooltip={props.tooltip}>
        <ToolbarButton
          size="sm"
          tooltip={undefined}
          onClick={() => adjustFontSize(-1)}
          onMouseDown={(event) => {
            event.preventDefault();
            selectionRef.current = captureEditorSelection(editor);
          }}
        >
          <Minus />
        </ToolbarButton>
      </ToolbarTooltip>

      <DropdownMenu
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            selectionRef.current = captureEditorSelection(editor);
          }
          setOpen(nextOpen);
        }}
        modal={false}
      >
        <ToolbarTooltip tooltip={props.tooltip}>
          <DropdownMenuTrigger asChild>
            <ToolbarButton
              size="sm"
              pressed={open}
              className="min-w-11 shrink-0 gap-1 px-1"
              tooltip={undefined}
              data-plate-focus="true"
              onMouseDown={(event) => {
                event.preventDefault();
                selectionRef.current = captureEditorSelection(editor);
              }}
            >
              <span>{toUnitLess(cursorFontSize)}</span>
              <ChevronDown className="size-3 text-label-secondary" />
            </ToolbarButton>
          </DropdownMenuTrigger>
        </ToolbarTooltip>

        <DropdownMenuContent
          align="center"
          sideOffset={10}
          className="ignore-click-outside/toolbar w-14 rounded-md border border-border/70 p-1"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            runEditorTransformPreservingSelection(editor, () => undefined, {
              selection: selectionRef.current,
            });
          }}
        >
          <DropdownMenuRadioGroup value={toUnitLess(cursorFontSize)} onValueChange={applyFontSize}>
            {FONT_SIZES.map((size) => (
              <DropdownMenuRadioItem
                key={size}
                value={size}
                className={cn(
                  "justify-center px-2 text-center",
                  size === toUnitLess(cursorFontSize) && "bg-accent",
                )}
              >
                {size}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <ToolbarTooltip tooltip={props.tooltip}>
        <ToolbarButton
          size="sm"
          tooltip={undefined}
          onClick={() => adjustFontSize(1)}
          onMouseDown={(event) => {
            event.preventDefault();
            selectionRef.current = captureEditorSelection(editor);
          }}
        >
          <Plus />
        </ToolbarButton>
      </ToolbarTooltip>
    </div>
  );
}
