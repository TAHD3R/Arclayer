"use client";

import * as React from "react";

import type { VariantProps } from "class-variance-authority";

import {
  type ResizeHandle as ResizeHandlePrimitive,
  Resizable as ResizablePrimitive,
  useResizeHandle,
  useResizeHandleState,
} from "@platejs/resizable";
import { cva } from "class-variance-authority";

import { cn } from "@arclayer/lib/utils";

export const mediaResizeHandleVariants = cva(
  cn(
    "top-0 flex w-3 select-none flex-col justify-center",
    "after:flex after:h-20 after:w-[3px] after:rounded-full after:bg-primary after:shadow-[0_0_0_3px_rgba(0,0,0,0.18)] after:opacity-0 after:transition-opacity after:content-[''] group-hover/media:after:opacity-100 data-[resizing=true]:after:opacity-100",
  ),
  {
    variants: {
      direction: {
        left: "left-0 -translate-x-1/2",
        right: "right-0 translate-x-1/2 items-end",
      },
    },
  },
);

const resizeHandleVariants = cva("absolute z-40", {
  variants: {
    direction: {
      bottom: "w-full cursor-row-resize",
      left: "h-full cursor-col-resize",
      right: "h-full cursor-col-resize",
      top: "w-full cursor-row-resize",
    },
  },
});

export function ResizeHandle({
  className,
  options,
  ...props
}: React.ComponentProps<typeof ResizeHandlePrimitive> & VariantProps<typeof resizeHandleVariants>) {
  const state = useResizeHandleState(options ?? {});
  const resizeHandle = useResizeHandle(state);

  if (state.readOnly) return null;

  return (
    <div
      className={cn(resizeHandleVariants({ direction: options?.direction }), className)}
      data-resizing={state.isResizing}
      {...resizeHandle.props}
      {...props}
    />
  );
}

const resizableVariants = cva("relative", {
  variants: {
    align: {
      center: "mx-auto",
      left: "mr-auto",
      right: "ml-auto",
    },
  },
});

export function Resizable({
  align,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive> & VariantProps<typeof resizableVariants>) {
  return <ResizablePrimitive {...props} className={cn(resizableVariants({ align }), className)} />;
}
