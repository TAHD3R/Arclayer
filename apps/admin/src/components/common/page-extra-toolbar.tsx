import type { ReactNode } from "react";

import clsx from "clsx";

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
    <div className={clsx("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className={clsx("flex min-w-0 flex-1 flex-wrap items-center gap-2", leadingClassName)}>
        {leading}
      </div>
      <div className={clsx("flex shrink-0 flex-wrap items-center gap-2", trailingClassName)}>
        {trailing}
      </div>
    </div>
  );
}
