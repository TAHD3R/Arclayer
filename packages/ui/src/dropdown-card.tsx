import type * as React from "react";

import { cn } from "@arclayer/lib/utils";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  type PopoverContentProps,
  type PopoverProps,
  type PopoverTriggerProps,
} from "./popover";

type DropdownCardRootProps = PopoverProps;

function DropdownCardRoot(props: DropdownCardRootProps) {
  return <Popover {...props} />;
}

type DropdownCardTriggerProps = PopoverTriggerProps;

function DropdownCardTrigger(props: DropdownCardTriggerProps) {
  return <PopoverTrigger {...props} />;
}

type DropdownCardContentProps = PopoverContentProps;

function DropdownCardContent({ className, ...props }: DropdownCardContentProps) {
  return (
    <PopoverContent
      className={cn(
        // Keep consistent with dropdown-menu's "card-like" styling.
        "bg-popover text-popover-foreground z-50 flex max-h-(--radix-popover-content-available-height) min-w-32 flex-col rounded-xl border p-2  outline-hidden",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        "origin-(--radix-popover-content-transform-origin)",
        "min-w-0 overflow-hidden p-0",
        className,
      )}
      {...props}
    />
  );
}

type DropdownCardHeaderProps = React.ComponentProps<"div">;

function DropdownCardHeader({ className, ...props }: DropdownCardHeaderProps) {
  return <div className={cn("min-w-0 border-b px-4 py-4", className)} {...props} />;
}

type DropdownCardBodyProps = React.ComponentProps<"div">;

function DropdownCardBody({ className, ...props }: DropdownCardBodyProps) {
  return <div className={cn("min-w-0 px-4 py-3", className)} {...props} />;
}

type DropdownCardFooterProps = React.ComponentProps<"div">;

function DropdownCardFooter({ className, ...props }: DropdownCardFooterProps) {
  return <div className={cn("min-w-0 border-t bg-card px-4 py-3", className)} {...props} />;
}

export {
  DropdownCardRoot,
  DropdownCardTrigger,
  DropdownCardContent,
  DropdownCardHeader,
  DropdownCardBody,
  DropdownCardFooter,
  type DropdownCardRootProps,
  type DropdownCardTriggerProps,
  type DropdownCardContentProps,
  type DropdownCardHeaderProps,
  type DropdownCardBodyProps,
  type DropdownCardFooterProps,
};
