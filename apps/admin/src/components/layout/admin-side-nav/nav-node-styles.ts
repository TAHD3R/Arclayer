import { cn } from "@arclayer/lib/utils";

export const INTERACTIVE_TRANSITION_CLASSNAME = cn(
  "transition-[color,background-color,box-shadow,border-color,padding,gap] duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
  "motion-reduce:transition-none",
);

export const NAV_ITEM_INTERACTIVE_TEXT_CLASSNAME = cn(
  "text-label-secondary! hover:text-label-primary!",
  "data-[active=true]:font-semibold data-[active=true]:text-label-primary!",
);

export const NAV_ITEM_INTERACTIVE_BG_CLASSNAME = cn(
  "bg-transparent",
  "hover:bg-accent dark:hover:bg-accent/50",
  "data-[active=true]:bg-accent dark:data-[active=true]:bg-accent/50",
);

export const NAV_ITEM_COLLAPSE_HIDE_CLASSNAME = cn(
  "max-w-full overflow-hidden whitespace-nowrap",
  "origin-left transform-gpu will-change-[max-width,opacity]",
  "transition-[max-width,opacity] duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none",
  "[[data-layout-collapsible=icon]:not([data-hover-preview=true])_&]:max-w-0",
  "[[data-layout-collapsible=icon]:not([data-hover-preview=true])_&]:opacity-0",
  "[[data-layout-collapsible=icon]:not([data-hover-preview=true])_&]:pointer-events-none",
  "[[data-motion-phase=collapsing]_&]:opacity-0",
  "[[data-motion-phase=expanding]_&]:opacity-0",
  "[[data-motion-phase=expanding]_&]:delay-[170ms]",
  "[[data-motion-phase=expanding]_&]:duration-[110ms]",
  "[[data-motion-phase=collapsing]_&]:duration-[120ms]",
);

export const DISABLED_ITEM_CLASSNAME = cn(
  "opacity-60",
  "hover:text-label-primary!",
  "cursor-pointer",
  "aria-disabled:pointer-events-auto",
);
