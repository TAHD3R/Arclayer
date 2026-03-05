"use client";

import * as React from "react";

import { cn } from "@celestial/lib/utils";
import { Button } from "@celestial/ui/button";

import type { DataTableIconButtonProps } from "./data-table-tools.types";

export const DataTableDefaultIconButton = React.forwardRef<
  HTMLButtonElement,
  DataTableIconButtonProps & { className?: string }
>(function DataTableDefaultIconButton({ label, active, className, ...props }, ref) {
  return (
    <Button
      ref={ref}
      type="button"
      variant="ghost"
      size="icon-sm"
      title={label}
      aria-label={label}
      className={cn(active ? "bg-accent" : undefined, className)}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </Button>
  );
});
DataTableDefaultIconButton.displayName = "DataTableDefaultIconButton";
