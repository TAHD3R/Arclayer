import type * as React from "react";

import { cn } from "@arclayer/lib/utils";

export function SettingCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("overflow-hidden rounded-2xl bg-background shadow-sm", className)}>
      {children}
    </section>
  );
}

export function SettingCardHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4 bg-muted/20 px-6 py-5", className)}>
      <div className="min-w-0 flex-1">
        <div className="text-headline text-label-primary">{title}</div>
        {description && <div className="mt-1 text-callout text-label-secondary">{description}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function SettingCardContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("p-6", className)}>{children}</div>;
}

export function SettingCardFooter({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between bg-muted/40 px-6 py-4", className)}>
      {children}
    </div>
  );
}
