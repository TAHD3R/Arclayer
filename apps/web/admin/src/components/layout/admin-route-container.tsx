import type { CSSProperties, PropsWithChildren } from "react";

import { cn } from "@/lib/utils";

export type AdminRouteContainerWidth = "fixed" | "full";

export type AdminRouteContainerProps = PropsWithChildren<{
  width?: AdminRouteContainerWidth;
  className?: string;
  innerClassName?: string;
  style?: CSSProperties;
  innerStyle?: CSSProperties;
}>;

const FIXED_WIDTH_STYLE: CSSProperties = {
  maxWidth: "clamp(1040px, 76vw, 1600px)",
};

export function AdminRouteContainer({
  width = "fixed",
  className,
  innerClassName,
  style,
  innerStyle,
  children,
}: AdminRouteContainerProps) {
  return (
    <div className={cn("w-full h-full min-h-0 flex flex-col", className)} style={style}>
      <div
        className={cn(
          "w-full flex-1 min-h-0 flex flex-col px-10 pt-8 pb-20",
          width === "fixed" ? "mx-auto" : null,
          innerClassName,
        )}
        style={{
          ...(width === "fixed" ? FIXED_WIDTH_STYLE : null),
          ...innerStyle,
        }}
      >
        {children}
      </div>
    </div>
  );
}
