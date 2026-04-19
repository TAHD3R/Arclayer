import { cn } from "@arclayer/lib/utils";

export const INTERACTIVE_TRANSITION_CLASSNAME = cn(
  "transition-[color,background-color,box-shadow,border-color,padding,gap] duration-250 ease-[cubic-bezier(0.77,0,0.175,1)]",
  "motion-reduce:transition-none",
);

export const NAV_ITEM_INTERACTIVE_TEXT_CLASSNAME = cn(
  "text-label-secondary! hover:text-label-primary!",
  "data-[active=true]:font-semibold data-[active=true]:text-label-primary!",
);

export const NAV_ITEM_INTERACTIVE_BG_CLASSNAME = cn(
  "bg-transparent",
  "hover:bg-accent/40",
  "data-[active=true]:bg-transparent",
);

export const NAV_ITEM_COLLAPSE_HIDE_CLASSNAME = cn(
  "max-w-full overflow-hidden whitespace-nowrap",
  "origin-left transform-gpu will-change-[max-width,opacity,transform]",
  "transition-[max-width,opacity,transform] duration-250 ease-[cubic-bezier(0.77,0,0.175,1)]",
  "[[data-layout-collapsible=icon]:not([data-hover-preview=true])_&]:max-w-0",
  "[[data-layout-collapsible=icon]:not([data-hover-preview=true])_&]:opacity-0",
  "[[data-layout-collapsible=icon]:not([data-hover-preview=true])_&]:pointer-events-none",
);

export const DISABLED_ITEM_CLASSNAME = cn(
  "opacity-60",
  "hover:text-label-primary!",
  "cursor-pointer",
  "aria-disabled:pointer-events-auto",
);
