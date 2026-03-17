import type { CSSProperties, PropsWithChildren, ReactNode } from "react";

import { cn } from "@arclayer/lib/utils";

export type AdminRouteContainerProps = PropsWithChildren<{
  className?: string;
  innerClassName?: string;
  overlay?: ReactNode;
  style?: CSSProperties;
  innerStyle?: CSSProperties;
}>;

export function AdminRouteContainer({
  className,
  innerClassName,
  overlay,
  style,
  innerStyle,
  children,
}: AdminRouteContainerProps) {
  return (
    <div
      className={cn(
        "flex min-h-full min-w-0 w-full flex-col",
        overlay ? "relative" : null,
        className,
      )}
      style={style}
    >
      <div
        className={cn(
          "flex min-h-full min-w-0 w-full flex-1 flex-col px-10 pt-8 pb-20",
          innerClassName,
        )}
        style={innerStyle}
      >
        {children}
      </div>
      {overlay}
    </div>
  );
}
