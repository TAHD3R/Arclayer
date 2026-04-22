"use client";

import * as React from "react";

import { cn } from "@arclayer/lib/utils";

type ToolbarProps = React.HTMLAttributes<HTMLDivElement>;

const Toolbar = React.forwardRef<HTMLDivElement, ToolbarProps>(function Toolbar(
  { className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      data-slot="floating-toolbar"
      className={cn(
        "inline-flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-border/70 bg-background/96 p-1.5 shadow-lg shadow-black/5 supports-[backdrop-filter]:bg-background/88 supports-[backdrop-filter]:backdrop-blur-md dark:shadow-black/25",
        className,
      )}
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
