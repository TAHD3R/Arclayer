import { cn } from "@/lib/utils";

import type { IllustrationProps } from "./types";

/**
 * 所有插图组件的共享 SVG 外壳。
 * 统一 viewBox、尺寸约束和无障碍属性。
 */
export function IllustrationWrapper({
  className,
  ariaLabel,
  children,
}: IllustrationProps & { children: React.ReactNode }) {
  const decorative = !ariaLabel;

  return (
    <svg
      viewBox="0 0 200 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={decorative ? undefined : "img"}
      aria-label={ariaLabel}
      aria-hidden={decorative ? true : undefined}
      className={cn("block w-full", className)}
    >
      {children}
    </svg>
  );
}
