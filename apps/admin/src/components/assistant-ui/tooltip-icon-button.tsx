"use client";

import { type ComponentPropsWithRef, forwardRef } from "react";
import { Slot } from "radix-ui";

import { Button } from "@arclayer/ui/button";
import { cn } from "@arclayer/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@arclayer/ui/tooltip";

export type TooltipIconButtonProps = ComponentPropsWithRef<typeof Button> & {
  tooltip: string;
  side?: "top" | "bottom" | "left" | "right";
};

export const TooltipIconButton = forwardRef<HTMLButtonElement, TooltipIconButtonProps>(
  ({ children, tooltip, side = "bottom", className, ...rest }, ref) => {
    return (
      <TooltipProvider openDelay={0}>
        <Tooltip side={side}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              {...rest}
              className={cn("aui-button-icon size-6 p-1 active:scale-90", className)}
              ref={ref}
            >
              <Slot.Slottable>{children}</Slot.Slottable>
              <span className="aui-sr-only sr-only">{tooltip}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  },
);

TooltipIconButton.displayName = "TooltipIconButton";
