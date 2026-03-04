import { cn } from "@celestial/lib/utils";

export const INTERACTIVE_TRANSITION_CLASSNAME = cn(
  "transition-[color,background-color,transform,box-shadow,width,height,padding,margin,gap] duration-400 ease-[cubic-bezier(0.75,0,0.25,1)]",
  "motion-reduce:transition-none",
);

export const NAV_ITEM_INTERACTIVE_TEXT_CLASSNAME = cn(
  "text-label-secondary! hover:text-label-primary!",
  "data-[active=true]:font-semibold data-[active=true]:text-foreground!",
);

export const NAV_ITEM_INTERACTIVE_BG_CLASSNAME = cn(
  "bg-transparent",
  "hover:bg-accent/40",
  "data-[active=true]:bg-accent/50",
);

export const NAV_ITEM_COLLAPSE_HIDE_CLASSNAME = cn(
  "max-w-full overflow-hidden",
  "transition-[max-width,opacity,transform] duration-400 ease-[cubic-bezier(0.75,0,0.25,1)]",
  "group-data-[collapsible=icon]:duration-200",
  "group-data-[collapsible=icon]:w-0",
  "group-data-[collapsible=icon]:flex-none",
  "group-data-[collapsible=icon]:ml-0",
  "group-data-[collapsible=icon]:max-w-0",
  "group-data-[collapsible=icon]:opacity-0",
  "group-data-[collapsible=icon]:translate-x-1",
  "group-data-[collapsible=icon]:pointer-events-none",
);

export const DISABLED_ITEM_CLASSNAME = cn(
  "opacity-60",
  "hover:text-label-secondary!",
  "cursor-not-allowed",
  "aria-disabled:pointer-events-auto",
);
