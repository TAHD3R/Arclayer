import * as React from "react";

import { cn } from "@arclayer/lib/utils";

const SettingItem = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => (
    <section
      ref={ref}
      data-slot="setting-item"
      className={cn(
        "scroll-mt-28 text-card-foreground transition-[border-color,background-color,box-shadow]",
        className,
      )}
      {...props}
    />
  ),
);
SettingItem.displayName = "SettingItem";

const SettingItemHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="setting-item-header"
      className={cn("flex min-w-0 flex-col gap-2 border-b border-border/70 pb-4", className)}
      {...props}
    />
  ),
);
SettingItemHeader.displayName = "SettingItemHeader";

const SettingItemTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="setting-item-title"
      className={cn("min-w-0 text-headline font-semibold text-label-primary", className)}
      {...props}
    />
  ),
);
SettingItemTitle.displayName = "SettingItemTitle";

const SettingItemDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="setting-item-description"
    className={cn("text-callout text-label-secondary", className)}
    {...props}
  />
));
SettingItemDescription.displayName = "SettingItemDescription";

const SettingItemContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="setting-item-content"
      className={cn("min-w-0 pt-4", className)}
      {...props}
    />
  ),
);
SettingItemContent.displayName = "SettingItemContent";

const SettingItemFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="setting-item-footer"
      className={cn(
        "mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
      {...props}
    />
  ),
);
SettingItemFooter.displayName = "SettingItemFooter";

export {
  SettingItem,
  SettingItemHeader,
  SettingItemTitle,
  SettingItemDescription,
  SettingItemContent,
  SettingItemFooter,
};
