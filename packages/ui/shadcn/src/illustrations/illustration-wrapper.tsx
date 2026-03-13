import { cn } from "@celestial/lib/utils";

import type { IllustrationProps } from "./types";

/**
 * 所有插图组件的共享 SVG 外壳。
 * 统一 viewBox、尺寸约束和无障碍属性。
 * 加入了全局的胶片颗粒和细线基准。
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
      className={cn("block w-full text-foreground", className)}
    >
      <defs>
        <filter id="celestial-grain" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.65"
            numOctaves="3"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.15" />
          </feComponentTransfer>
          <feComposite operator="in" in2="SourceGraphic" />
        </filter>
      </defs>

      {/* 背景噪点层 - 极微弱的胶片颗粒感 */}
      <rect
        width="100%"
        height="100%"
        fill="currentColor"
        filter="url(#celestial-grain)"
        opacity="0.04"
        className="pointer-events-none"
      />

      {children}
    </svg>
  );
}
