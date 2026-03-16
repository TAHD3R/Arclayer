import { useEffect, useState } from "react";
import { motion } from "motion/react";
import type { SVGMotionProps } from "motion/react";

import { useMediaPrefersReducedMotion } from "@arclayer/hooks/use-media-prefers-reduced-motion";
import { useIconHoverState } from "./use-icon-hover-state";

interface RefreshIconProps extends SVGMotionProps<SVGSVGElement> {
  size?: number;
  duration?: number;
  strokeWidth?: number;
  isHovered?: boolean;
  loop?: boolean;
}

const RefreshIcon = (props: RefreshIconProps) => {
  const {
    size = 28,
    duration = 2,
    strokeWidth = 2,
    isHovered,
    loop = false,
    className,
    ...restProps
  } = props;

  const [nonce, setNonce] = useState(0);
  const reducedMotion = useMediaPrefersReducedMotion();
  const hoverState = useIconHoverState(isHovered);
  const hovered = hoverState.hovered;

  useEffect(() => {
    if (loop) return;
    if (reducedMotion) return;
    if (hovered) setNonce((n) => n + 1);
  }, [hovered, loop, reducedMotion]);

  const shouldAnimate = !reducedMotion && (loop || hovered);

  const animationProps = {
    animate: shouldAnimate ? { rotate: 360 } : { rotate: 0 },
    transition: {
      duration: duration,
      ease: "linear" as const,
      repeat: loop ? Infinity : 0,
    },
  };

  return (
    <motion.svg
      key={loop ? "loop" : nonce}
      {...restProps}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      ref={hoverState.ref}
      onMouseEnter={hoverState.onMouseEnter}
      onMouseLeave={hoverState.onMouseLeave}
      {...animationProps}
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" />
      <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
    </motion.svg>
  );
};

export default RefreshIcon;
