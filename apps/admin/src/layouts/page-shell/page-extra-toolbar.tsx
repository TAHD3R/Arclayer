import type { ReactNode } from "react";

import { cn } from "@arclayer/lib/utils";

export type PageExtraToolbarProps = {
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  leadingClassName?: string;
  trailingClassName?: string;
};

export function PageExtraToolbar({
  leading,
  trailing,
  className,
  leadingClassName,
  trailingClassName,
}: PageExtraToolbarProps) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className={cn("flex min-w-0 flex-1 flex-wrap items-center gap-2", leadingClassName)}>
        {leading}
      </div>
      <div className={cn("flex shrink-0 items-center gap-2", trailingClassName)}>{trailing}</div>
    </div>
  );
}
