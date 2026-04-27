"use client";

import * as React from "react";

import { cn } from "@arclayer/lib/utils";
import { OVERLAY_LAYER_SHADOW_CLASSNAME } from "@arclayer/ui/layer-shadow";

type ToolbarProps = React.HTMLAttributes<HTMLDivElement>;

export const FLOATING_TOOLBAR_SURFACE_CLASSNAME = cn(
  "inline-flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-full border border-border/70 bg-background/96 px-2.5 py-1.5 supports-[backdrop-filter]:bg-background/88 supports-[backdrop-filter]:backdrop-blur-md",
  OVERLAY_LAYER_SHADOW_CLASSNAME,
);

const Toolbar = React.forwardRef<HTMLDivElement, ToolbarProps>(function Toolbar(
  { className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      data-slot="floating-toolbar"
      className={cn(FLOATING_TOOLBAR_SURFACE_CLASSNAME, className)}
      {...props}
    />
  );
});

const ToolbarGroup = React.forwardRef<HTMLDivElement, ToolbarProps>(function ToolbarGroup(
  { className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      data-slot="floating-toolbar-group"
      className={cn("flex min-w-0 items-center gap-1", className)}
      {...props}
    />
  );
});

const ToolbarSeparator = React.forwardRef<HTMLDivElement, ToolbarProps>(function ToolbarSeparator(
  { className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-slot="floating-toolbar-separator"
      className={cn("mx-0.5 hidden h-7 w-px bg-border/80 sm:block", className)}
      {...props}
    />
  );
});

Toolbar.displayName = "Toolbar";
ToolbarGroup.displayName = "ToolbarGroup";
ToolbarSeparator.displayName = "ToolbarSeparator";

export { Toolbar, ToolbarGroup, ToolbarSeparator };
