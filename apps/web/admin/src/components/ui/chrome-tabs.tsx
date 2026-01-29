import * as React from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * Chrome-like tabs styling wrapper.
 * Rationale: keep Radix Tabs behavior but standardize the visual style for admin settings pages.
 */

const ChromeTabs = Tabs;

const ChromeTabsList = React.forwardRef<
  React.ElementRef<typeof TabsList>,
  React.ComponentPropsWithoutRef<typeof TabsList>
>(({ className, ...props }, ref) => (
  <TabsList
    ref={ref}
    className={cn(
      "w-full justify-start gap-2 rounded-none bg-transparent p-0",
      "border-b border-border/80",
      "h-auto",
      className,
    )}
    {...props}
  />
));
ChromeTabsList.displayName = "ChromeTabsList";

const ChromeTabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsTrigger>,
  React.ComponentPropsWithoutRef<typeof TabsTrigger>
>(({ className, ...props }, ref) => (
  <TabsTrigger
    ref={ref}
    className={cn(
      // Base
      "relative",
      "rounded-t-md rounded-b-none",
      // Padding requirement: 12px 32px
      "px-8 py-3",
      "text-sm font-bold",
      "text-muted-foreground",
      "transition-colors",
      "hover:text-foreground",
      // Hover underline for inactive tabs (instead of borders)
      "after:absolute after:left-8 after:right-8 after:bottom-2 after:h-0.5 after:rounded-full after:bg-transparent after:transition-colors",
      "data-[state=inactive]:hover:after:bg-foreground/60",
      // Active indicator
      "data-[state=active]:text-foreground",
      "data-[state=active]:after:bg-foreground",
      // Disable default focus ring from base TabsTrigger to match project style.
      "focus-visible:ring-0 focus-visible:ring-offset-0",
      className,
    )}
    {...props}
  />
));
ChromeTabsTrigger.displayName = "ChromeTabsTrigger";

const ChromeTabsContent = React.forwardRef<
  React.ElementRef<typeof TabsContent>,
  React.ComponentPropsWithoutRef<typeof TabsContent>
>(({ className, ...props }, ref) => (
  <TabsContent
    ref={ref}
    className={cn("mt-0 pt-6", "focus-visible:ring-0 focus-visible:ring-offset-0", className)}
    {...props}
  />
));
ChromeTabsContent.displayName = "ChromeTabsContent";

export { ChromeTabs, ChromeTabsList, ChromeTabsTrigger, ChromeTabsContent };
