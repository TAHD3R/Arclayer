"use client";

import * as React from "react";
import { Combobox as ComboboxPrimitive } from "@base-ui/react";
import { XIcon } from "lucide-react";

import { cn } from "@arclayer/lib/utils";

import { Badge } from "../badge";
import { Button } from "../button";

type ComboboxChipProps = ComboboxPrimitive.Chip.Props & {
  showRemove?: boolean;
};

function ComboboxChips({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof ComboboxPrimitive.Chips> & ComboboxPrimitive.Chips.Props) {
  return (
    <ComboboxPrimitive.Chips
      data-slot="combobox-chips"
      className={cn(
        "flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent bg-clip-padding px-2.5 py-1.5 text-footnote  transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 has-aria-invalid:border-destructive has-aria-invalid:ring-[3px] has-aria-invalid:ring-destructive/20 has-data-[slot=combobox-chip]:px-1.5 dark:bg-input/30 dark:has-aria-invalid:border-destructive/50 dark:has-aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxChip({ className, children, showRemove = true, ...props }: ComboboxChipProps) {
  return (
    <ComboboxPrimitive.Chip
      data-slot="combobox-chip"
      render={<Badge variant="secondary" />}
      className={cn(
        "h-[calc(--spacing(5.5))] rounded-sm pr-1 has-disabled:pointer-events-none has-disabled:cursor-not-allowed has-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
      {showRemove && (
        <ComboboxPrimitive.ChipRemove
          render={
            <Button variant="ghost" className="size-5 rounded-[calc(var(--radius)-5px)] p-0" />
          }
          className="-mr-0.5 opacity-50 hover:opacity-100"
          data-slot="combobox-chip-remove"
        >
          <XIcon className="pointer-events-none" />
        </ComboboxPrimitive.ChipRemove>
      )}
    </ComboboxPrimitive.Chip>
  );
}

type ComboboxChipsInputProps = ComboboxPrimitive.Input.Props & {
  showClear?: boolean;
};

function ComboboxChipsInput({ className, showClear = false, ...props }: ComboboxChipsInputProps) {
  return (
    <div className="flex min-w-16 flex-1 items-center gap-1">
      <ComboboxPrimitive.Input
        data-slot="combobox-chip-input"
        className={cn("min-w-0 flex-1 outline-none", className)}
        {...props}
      />
      {showClear ? (
        <ComboboxPrimitive.Clear
          disabled={props.disabled}
          render={<Button variant="ghost" size="icon-xs" />}
          className="shrink-0"
        >
          <XIcon className="pointer-events-none" />
        </ComboboxPrimitive.Clear>
      ) : null}
    </div>
  );
}

export { ComboboxChip, ComboboxChips, ComboboxChipsInput };
