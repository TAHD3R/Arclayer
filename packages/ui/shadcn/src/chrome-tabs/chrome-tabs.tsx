import * as React from "react";

import { cn } from "@arclayer/lib/utils";
import { Tabs, TabsContent, TabsTrigger } from "../tabs";
import { ChromeTabsList } from "./chrome-tabs-list";

export const ChromeTabs = Tabs;

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
  React.ComponentPropsWithoutRef<typeof TabsTrigger>
>(({ className, ...props }, ref) => (
  <TabsTrigger
    ref={ref}
    className={cn(
      "relative",
      "rounded-t-md rounded-b-none",
      // Keep comfortable spacing for each tab item, but avoid a "first item indent"
      // that causes a visual left-shift when scanning a page top-to-bottom.
      "py-4 pr-8 pl-8 first:pl-0",
      "text-footnote font-bold",
      "text-label-secondary",
      "transition-colors",
      "hover:text-foreground hover:cursor-pointer",
      "aria-selected:text-foreground",
      "after:absolute after:left-8 after:right-8 after:bottom-2 after:h-0.5 after:rounded-full after:bg-transparent after:transition-colors first:after:left-0",
      "data-[state=inactive]:hover:after:bg-foreground/60",
      "focus-visible:outline-none focus-visible:bg-muted/40 focus-visible:text-foreground focus-visible:after:bg-foreground/80",
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
  <TabsContent ref={ref} className={cn("mt-0 pt-4", className)} {...props} />
));
ChromeTabsContent.displayName = "ChromeTabsContent";

export { ChromeTabsList };
