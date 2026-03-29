import { cn } from "@arclayer/lib/utils";

export const INTERACTIVE_TRANSITION_CLASSNAME = cn(
  "transition-[color,background-color,box-shadow,padding,gap] duration-320 ease-[cubic-bezier(0.22,1,0.36,1)]",
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
  "transition-[max-width,opacity] duration-280 ease-[cubic-bezier(0.22,1,0.36,1)]",
  "group-data-[collapsible=icon]:duration-200",
  "group-data-[collapsible=icon]:flex-none",
  "group-data-[collapsible=icon]:max-w-0",
  "group-data-[collapsible=icon]:opacity-0",
  "group-data-[collapsible=icon]:pointer-events-none",
);

export const DISABLED_ITEM_CLASSNAME = cn(
  "opacity-60",
  "hover:text-label-secondary!",
  "cursor-not-allowed",
  "aria-disabled:pointer-events-auto",
);
