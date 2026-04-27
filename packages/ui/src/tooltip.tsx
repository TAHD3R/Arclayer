import * as React from "react";
import * as motion from "motion/react-client";

import {
  TooltipProvider as TooltipProviderPrimitive,
  Tooltip as TooltipPrimitive,
  TooltipTrigger as TooltipTriggerPrimitive,
  TooltipContent as TooltipContentPrimitive,
  TooltipArrow as TooltipArrowPrimitive,
  type TooltipProviderProps as TooltipProviderPrimitiveProps,
  type TooltipProps as TooltipPrimitiveProps,
  type TooltipTriggerProps as TooltipTriggerPrimitiveProps,
  type TooltipContentProps as TooltipContentPrimitiveProps,
} from "@arclayer/ui/animate-tooltip";
import { cn } from "@arclayer/lib/utils";
import { OVERLAY_LAYER_SHADOW_CLASSNAME } from "./layer-shadow";

type TooltipProviderProps = TooltipProviderPrimitiveProps;

function TooltipProvider({ openDelay = 0, ...props }: TooltipProviderProps) {
  return <TooltipProviderPrimitive openDelay={openDelay} {...props} />;
}

type TooltipProps = TooltipPrimitiveProps;

function Tooltip({ sideOffset = 10, ...props }: TooltipProps) {
  return <TooltipPrimitive sideOffset={sideOffset} {...props} />;
}

type TooltipTriggerProps = TooltipTriggerPrimitiveProps & {
  focusTrigger?: boolean;
};

function TooltipTrigger({ focusTrigger = true, ...props }: TooltipTriggerProps) {
  return (
    <TooltipTriggerPrimitive data-focus-trigger={focusTrigger ? "true" : "false"} {...props} />
  );
}

type TooltipContentProps = Omit<TooltipContentPrimitiveProps, "asChild"> & {
  children: React.ReactNode;
  layout?: boolean | "position" | "size" | "preserve-aspect";
};

function TooltipContent({
  className,
  children,
  layout = "preserve-aspect",
  ...props
}: TooltipContentProps) {
  return (
    <TooltipContentPrimitive
      className={cn(
        "w-fit rounded-md border border-[hsl(210_10%_14%)]/70 bg-[hsl(220_15%_8%)] text-[hsl(220_15%_92%)]",
        OVERLAY_LAYER_SHADOW_CLASSNAME,
        className,
      )}
      {...props}
    >
      <motion.div className="overflow-hidden px-3 py-1.5 text-callout text-balance">
        <motion.div layout={layout}>{children}</motion.div>
      </motion.div>
      <TooltipArrowPrimitive
        className="size-3 fill-[hsl(220_15%_8%)] data-[side='bottom']:translate-y-[1px] data-[side='right']:translate-x-[1px] data-[side='left']:translate-x-[-1px] data-[side='top']:translate-y-[-1px]"
        tipRadius={2}
      />
    </TooltipContentPrimitive>
  );
}

export {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  type TooltipProviderProps,
  type TooltipProps,
  type TooltipTriggerProps,
  type TooltipContentProps,
};
