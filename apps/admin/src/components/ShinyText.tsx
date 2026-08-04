"use client";

import type { CSSProperties } from "react";
import { useCallback, useState } from "react";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@arclayer/lib/utils";

type ShinyTextProps = {
  text: string;
  disabled?: boolean;
  speed?: number;
  className?: string;
  color?: string;
  shineColor?: string;
  spread?: number;
  yoyo?: boolean;
  pauseOnHover?: boolean;
  direction?: "left" | "right";
  delay?: number;
};

function ShinyText({
  text,
  disabled = false,
  speed = 2,
  className,
  color = "var(--auth-shiny-default-color)",
  shineColor = "var(--auth-shiny-default-highlight)",
  spread = 120,
  yoyo = false,
  pauseOnHover = false,
  direction = "left",
  delay = 0,
}: ShinyTextProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [isPaused, setIsPaused] = useState(false);
  const animationDisabled = disabled || prefersReducedMotion;

  const handleMouseEnter = useCallback(() => {
    if (pauseOnHover) setIsPaused(true);
  }, [pauseOnHover]);

  const handleMouseLeave = useCallback(() => {
    if (pauseOnHover) setIsPaused(false);
  }, [pauseOnHover]);

  const gradientStyle: CSSProperties = {
    color,
    backgroundPosition: "var(--auth-shiny-start)",
    animationName: animationDisabled ? "none" : "arclayer-auth-shiny-text",
    animationDuration: `${speed}s`,
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
    animationDirection: yoyo ? "alternate" : "normal",
    animationDelay: `${delay}s`,
    animationFillMode: "both",
    animationPlayState: isPaused ? "paused" : "running",
    "--auth-shiny-angle": `${spread}deg`,
    "--auth-shiny-color": color,
    "--auth-shiny-highlight": shineColor,
    "--auth-shiny-start": direction === "left" ? "180% center" : "-80% center",
    "--auth-shiny-end": direction === "left" ? "-80% center" : "180% center",
  } as CSSProperties;

  return (
    <span
      className={cn("auth-shiny-text inline-block", className)}
      style={gradientStyle}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {text}
    </span>
  );
}

export default ShinyText;
export type { ShinyTextProps };
