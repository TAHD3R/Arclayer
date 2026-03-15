"use client";

import * as React from "react";

import { cn } from "@celestial/lib/utils";
import { Button as ButtonPrimitive } from "@celestial/ui/button-primitive";

import { buttonVariants } from "../button-variants";

import type { DataTableIconButtonProps } from "./data-table-tools.types";

export const DataTableDefaultIconButton = React.forwardRef<
  HTMLButtonElement,
  DataTableIconButtonProps & { className?: string }
>(function DataTableDefaultIconButton({ label, active, className, ...props }, ref) {
  return (
    <ButtonPrimitive
      ref={ref}
      type="button"
      aria-label={label}
      className={cn(
        buttonVariants({ variant: "ghost", size: "icon-sm" }),
        active ? "bg-accent" : undefined,
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
