import type { CSSProperties, PropsWithChildren, ReactNode } from "react";

import { cn } from "@arclayer/lib/utils";

export type AdminRouteContainerProps = PropsWithChildren<{
  className?: string;
  innerClassName?: string;
  overlay?: ReactNode;
  pageFrame?: "contained" | "full";
  style?: CSSProperties;
  innerStyle?: CSSProperties;
}>;

export function AdminRouteContainer({
  className,
  innerClassName,
  overlay,
  pageFrame = "contained",
  style,
  innerStyle,
  children,
}: AdminRouteContainerProps) {
  return (
    <div
      className={cn(
        "flex min-h-0 min-h-full min-w-0 w-full flex-col",
        overlay ? "relative" : null,
        className,
      )}
      style={style}
    >
      <div
        className={cn(
          "flex min-h-0 min-w-0 w-full flex-col pb-20 [--admin-route-gutter-x:1rem] sm:[--admin-route-gutter-x:1.5rem]",
          pageFrame === "contained"
            ? "mx-auto max-w-6xl px-[var(--admin-route-gutter-x)]"
            : "px-[var(--admin-route-gutter-x)]",
          innerClassName,
        )}
        data-slot="admin-route-frame"
        style={innerStyle}
      >
        {children}
      </div>
      {overlay}
    </div>
  );
}
