"use client";

import * as React from "react";

import { cn } from "@arclayer/lib/utils";
import { Button as ButtonPrimitive } from "@arclayer/ui/button-primitive";

import { buttonVariants } from "../button-variants";

import type { DataTableIconButtonProps } from "./data-table-tools.types";

export const DataTableDefaultIconButton = React.forwardRef<
  HTMLButtonElement,
  DataTableIconButtonProps & { className?: string }
>(function DataTableDefaultIconButton(
  { label, active, className, variant = "ghost", ...props },
  ref,
) {
  return (
    <ButtonPrimitive
      ref={ref}
      type="button"
      aria-label={label}
      className={cn(
        buttonVariants({ variant, size: "icon" }),
        active ? "border-border bg-accent text-accent-foreground" : undefined,
        className,
      )}
      disabled={props.disabled}
      onClick={props.onClick}
      tapScale={1}
    >
      {props.children}
    </ButtonPrimitive>
  );
});
DataTableDefaultIconButton.displayName = "DataTableDefaultIconButton";
