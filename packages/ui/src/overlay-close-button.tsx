"use client";

import { XIcon } from "lucide-react";

import { cn } from "@arclayer/lib/utils";
import { Button, type ButtonProps } from "./button";

export const OVERLAY_CLOSE_BUTTON_BASE_CLASSNAME =
  "absolute right-4 top-4 shrink-0 bg-background/80 backdrop-blur-xs";

type OverlayCloseButtonProps = Omit<ButtonProps, "children" | "size" | "variant"> & {
  srLabel?: string;
};

function OverlayCloseButton({
  className,
  srLabel = "Close",
  "aria-label": ariaLabel,
  type = "button",
  ...props
}: OverlayCloseButtonProps) {
  return (
    <Button
      type={type}
      variant="ghost"
      size="icon-sm"
      className={cn(OVERLAY_CLOSE_BUTTON_BASE_CLASSNAME, className)}
      aria-label={ariaLabel ?? srLabel}
      {...props}
    >
      <XIcon className="size-4" />
      <span className="sr-only">{srLabel}</span>
    </Button>
  );
}

export { OverlayCloseButton, type OverlayCloseButtonProps };
