import { type ReactNode } from "react";

import { cn } from "@arclayer/lib/utils";

export type SettingActionGroupProps = {
  children: ReactNode;
  className?: string;
};

export function SettingActionGroup({ children, className }: SettingActionGroupProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-background",
        "divide-y divide-border",
        className,
      )}
    >
      {children}
    </div>
  );
}
