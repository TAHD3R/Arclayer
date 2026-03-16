"use client";

import { forwardRef } from "react";
import { motion } from "motion/react";
import { LogIn as BaseIcon } from "lucide-react";
import { useMediaPrefersReducedMotion } from "@arclayer/hooks/use-media-prefers-reduced-motion";
import { cn } from "@arclayer/lib/utils";
import { assignRef } from "./assign-ref";
import { ICON_MOTION_EASE } from "./icon-motion-constants";
import type { AnimatedLucideProps } from "./lucide-animated-types";
import { useIconHoverState } from "./use-icon-hover-state";

const LogInAnimatedIcon = forwardRef<HTMLSpanElement, AnimatedLucideProps>(
  function LogInAnimatedIcon(
    {
      isHovered,
      active = false,
      loop = false,
      className,
      size = "100%",
      style,
      onMouseEnter,
      onMouseLeave,
      ...props
    },
    ref,
  ) {
    const reducedMotion = useMediaPrefersReducedMotion();
    const hoverState = useIconHoverState(isHovered);
    const emphasized = !reducedMotion && (loop || hoverState.hovered || active);

    return (
      <motion.span
        ref={(node) => {
          hoverState.ref.current = node;
          assignRef(ref, node);
        }}
        className={cn("inline-flex items-center justify-center", className)}
        style={{ transformOrigin: "50% 50%", ...style }}
        onMouseEnter={(event) => {
          hoverState.onMouseEnter();
          onMouseEnter?.(event as never);
        }}
        onMouseLeave={(event) => {
          hoverState.onMouseLeave();
          onMouseLeave?.(event as never);
        }}
        animate={emphasized ? { x: [0, 2.5, 0] } : { x: 0 }}
        transition={{ duration: 0.4, ease: ICON_MOTION_EASE, repeat: loop ? Infinity : 0 }}
      >
        <BaseIcon {...props} size={size} className="size-full" />
      </motion.span>
    );
  },
);

LogInAnimatedIcon.displayName = "LogInAnimatedIcon";

export default LogInAnimatedIcon;
