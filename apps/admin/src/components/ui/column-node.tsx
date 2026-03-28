"use client";

import * as React from "react";

import type { TColumnElement } from "platejs";
import type { PlateElementProps } from "platejs/react";

import { useDraggable, useDropLine } from "@platejs/dnd";
import { setColumns } from "@platejs/layout";
import { ResizableProvider } from "@platejs/resizable";
import { BlockSelectionPlugin } from "@platejs/selection/react";
import { useComposedRef } from "@udecode/cn";
import { GripHorizontal, Trash2Icon } from "lucide-react";
import { PathApi } from "platejs";
import {
  PlateElement,
  useEditorRef,
  useEditorSelector,
  useElement,
  useFocusedLast,
  usePluginOption,
  useReadOnly,
  useRemoveNodeButton,
  useSelected,
  withHOC,
} from "platejs/react";

import { Button } from "@arclayer/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@arclayer/lib/utils";

export const ColumnElement = withHOC(
  ResizableProvider,
  function ColumnElement(props: PlateElementProps<TColumnElement>) {
    const { width } = props.element;
    const readOnly = useReadOnly();
    const isSelectionAreaVisible = usePluginOption(BlockSelectionPlugin, "isSelectionAreaVisible");

    const { isDragging, previewRef, handleRef } = useDraggable({
      element: props.element,
      orientation: "horizontal",
      type: "column",
      canDropNode: ({ dragEntry, dropEntry }) =>
        PathApi.equals(PathApi.parent(dragEntry[1]), PathApi.parent(dropEntry[1])),
    });

    return (
      <div className="group/column relative" style={{ width: width ?? "100%" }}>
        {!readOnly && !isSelectionAreaVisible ? (
          <div
            className="absolute left-1/2 top-2 z-50 -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover/column:opacity-100"
            ref={handleRef}
          >
            <ColumnDragHandle />
          </div>
        ) : null}

        <PlateElement
          {...props}
          ref={useComposedRef(props.ref, previewRef)}
          className="h-full px-2 pt-2 first:pl-0 last:pr-0"
        >
          <div
            className={cn(
              "relative h-full rounded-xl border border-dashed border-border p-2",
              isDragging && "opacity-50",
            )}
          >
            {props.children}
            {!readOnly && !isSelectionAreaVisible ? <DropLine /> : null}
          </div>
        </PlateElement>
      </div>
    );
  },
);

function ColumnDragHandle() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" className="h-5 px-1">
            <GripHorizontal className="size-4 text-muted-foreground" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Drag to move column</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function DropLine() {
  const { dropLine } = useDropLine({ orientation: "horizontal" });
  if (!dropLine) return null;

  return (
    <div
      className={cn(
        "absolute inset-y-0 w-1 bg-brand/50",
        dropLine === "left" && "-left-1",
        dropLine === "right" && "-right-1",
      )}
    />
  );
}

export function ColumnGroupElement(props: PlateElementProps) {
  return (
    <PlateElement className="my-4" {...props}>
      <ColumnFloatingToolbar>
        <div className="flex w-full gap-2">{props.children}</div>
      </ColumnFloatingToolbar>
    </PlateElement>
  );
}

function ColumnFloatingToolbar({ children }: React.PropsWithChildren) {
  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const element = useElement<TColumnElement>();
  const { props: buttonProps } = useRemoveNodeButton({ element });
  const selected = useSelected();
  const isCollapsed = useEditorSelector((currentEditor) => currentEditor.api.isCollapsed(), []);
  const isFocusedLast = useFocusedLast();
  const open = isFocusedLast && !readOnly && selected && isCollapsed;

  const onColumnChange = (widths: string[]) => {
    setColumns(editor, { at: element, widths });
  };

  return (
    <div className="relative">
      {open ? (
        <div className="absolute left-1/2 top-0 z-40 -translate-x-1/2 -translate-y-[calc(100%+0.5rem)] rounded-xl border border-border bg-background/96 p-1 shadow-xl backdrop-blur">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onColumnChange(["50%", "50%"])}
            >
              2
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onColumnChange(["33%", "33%", "33%"])}
            >
              3
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onColumnChange(["30%", "70%"])}
            >
              L
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onColumnChange(["70%", "30%"])}
            >
              R
            </Button>
            <Separator orientation="vertical" className="mx-1 h-6" />
            <Button type="button" variant="ghost" size="icon-sm" {...buttonProps}>
              <Trash2Icon className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}
      {children}
    </div>
  );
}
