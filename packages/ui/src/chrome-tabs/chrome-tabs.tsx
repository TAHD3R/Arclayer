import * as React from "react";

import { cn } from "@arclayer/lib/utils";
import { Tabs, TabsContent, TabsTrigger } from "../tabs";
import { ChromeTabsList } from "./chrome-tabs-list";

export const ChromeTabs = Tabs;

export type ChromeTabsSize = "default" | "mini";

export function ChromeTabsBar(
  props: Readonly<{ left: React.ReactNode; right?: React.ReactNode; className?: string }>,
) {
  return (
    <div className={cn("flex items-center justify-between gap-3", props.className)}>
      <div className="min-w-0 flex-1">{props.left}</div>
      {props.right ? <div className="shrink-0">{props.right}</div> : null}
    </div>
  );
}

export const ChromeTabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsTrigger>,
  React.ComponentPropsWithoutRef<typeof TabsTrigger> & { size?: ChromeTabsSize }
>(({ className, size = "default", ...props }, ref) => (
  <TabsTrigger
    ref={ref}
    className={cn(
      "relative",
      // Keep comfortable spacing for each tab item, but avoid a "first item indent"
      // that causes a visual left-shift when scanning a page top-to-bottom.
      size === "mini"
        ? "px-3 py-2 first:pl-1 text-caption! font-semibold"
        : "py-4 pr-8 pl-8 first:pl-0 text-footnote! font-bold",
      "text-label-secondary",
      "transition-colors",
      "bg-transparent! data-[state=active]:text-label-primary",
      "hover:text-label-primary hover:cursor-pointer",
      "aria-selected:text-label-primary",
      size === "mini"
        ? "after:absolute after:inset-x-3 after:bottom-1 after:h-0.5 after:rounded-full after:bg-transparent after:transition-colors first:after:left-1"
        : "after:absolute after:left-8 after:right-8 after:bottom-2 after:h-0.5 after:rounded-full after:bg-transparent after:transition-colors first:after:left-0",
      "focus-visible:outline-none focus-visible:text-label-primary ",
      className,
    )}
    {...props}
  />
));
ChromeTabsTrigger.displayName = "ChromeTabsTrigger";

export const ChromeTabsContent = React.forwardRef<
  React.ElementRef<typeof TabsContent>,
  React.ComponentPropsWithoutRef<typeof TabsContent>
>(({ className, ...props }, ref) => (
  <TabsContent ref={ref} className={cn("mt-0", className)} {...props} />
));
ChromeTabsContent.displayName = "ChromeTabsContent";

export { ChromeTabsList };
