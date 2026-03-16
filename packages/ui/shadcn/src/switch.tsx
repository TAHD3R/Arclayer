import * as React from "react";

import {
  Switch as SwitchPrimitive,
  SwitchThumb as SwitchThumbPrimitive,
  SwitchIcon as SwitchIconPrimitive,
  type SwitchProps as SwitchPrimitiveProps,
} from "@arclayer/ui/radix-primitives/radix-switch";
import { cn } from "@arclayer/lib/utils";

type SwitchProps = SwitchPrimitiveProps & {
  pressedWidth?: number;
  startIcon?: React.ReactElement;
  endIcon?: React.ReactElement;
  thumbIcon?: React.ReactElement;
};

function Switch({
  className,
  pressedWidth = 19,
  startIcon,
  endIcon,
  thumbIcon,
  ...props
}: SwitchProps) {
  return (
    <SwitchPrimitive
      className={cn(
        "group/switch relative peer flex h-5 w-8 shrink-0 items-center justify-start overflow-hidden rounded-full border border-transparent px-px shadow-xs outline-none transition-[background-color,box-shadow] duration-200 ease-out focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none",
        "data-[state=checked]:bg-primary data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-input/80",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        data-slot="switch-knot"
        className={cn(
          "pointer-events-none absolute inset-y-0.5 left-0.5 z-0 w-5 rounded-full bg-background/60 opacity-80 transition-[transform,background-color,opacity] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] transform-gpu will-change-transform group-data-[state=checked]/switch:translate-x-3 group-data-[state=checked]/switch:bg-primary-foreground/18 group-data-[state=checked]/switch:opacity-100 dark:bg-foreground/18 dark:group-data-[state=checked]/switch:bg-primary-foreground/24 motion-reduce:transition-none",
        )}
      />
      <SwitchThumbPrimitive
        className={cn(
          "pointer-events-none relative z-10 block size-4 rounded-full bg-background ring-0 shadow-sm transition-[transform,background-color,box-shadow] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] transform-gpu will-change-transform data-[state=checked]:translate-x-3 dark:data-[state=unchecked]:bg-foreground dark:data-[state=checked]:bg-primary-foreground",
        )}
        pressedAnimation={{ width: pressedWidth }}
      >
        {thumbIcon && (
          <SwitchIconPrimitive
            position="thumb"
            className="absolute [&_svg]:size-[9px] left-1/2 top-1/2 -translate-1/2 dark:text-neutral-500 text-neutral-400"
          >
            {thumbIcon}
          </SwitchIconPrimitive>
        )}
      </SwitchThumbPrimitive>

      {startIcon && (
        <SwitchIconPrimitive
          position="left"
          className="absolute [&_svg]:size-[9px] left-0.5 top-1/2 -translate-y-1/2 dark:text-neutral-500 text-neutral-400"
        >
          {startIcon}
        </SwitchIconPrimitive>
      )}
      {endIcon && (
        <SwitchIconPrimitive
          position="right"
          className="absolute [&_svg]:size-[9px] right-0.5 top-1/2 -translate-y-1/2 dark:text-neutral-400 text-neutral-500"
        >
          {endIcon}
        </SwitchIconPrimitive>
      )}
    </SwitchPrimitive>
  );
}

export { Switch, type SwitchProps };
