import { useEffect, useState } from "react";
import { motion, type Easing, type SVGMotionProps } from "motion/react";

import { useMediaPrefersReducedMotion } from "@arclayer/hooks/use-media-prefers-reduced-motion";
import { useIconHoverState } from "./use-icon-hover-state";

interface ChevronDownIconProps extends Omit<SVGMotionProps<SVGSVGElement>, "strokeWidth"> {
  size?: number;
  duration?: number;
  strokeWidth?: number;
  isHovered?: boolean;
  loop?: boolean;
  ease?: Easing;
  expanded?: boolean;
}

const ChevronDownIcon = (props: ChevronDownIconProps) => {
  const {
    size = 28,
    duration = 0.5,
    strokeWidth = 2,
    isHovered,
    loop = false,
    ease = "easeInOut",
    className,
    expanded = false,
    style,
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
  const rotate = expanded ? 180 : 0;

  const animationProps = {
    animate: shouldAnimate ? { rotate, y: [0, 2, 0] } : { rotate, y: 0 },
    transition: {
      rotate: {
        duration: reducedMotion ? 0 : 0.18,
        ease,
      },
      y: {
        duration: shouldAnimate ? duration : 0.08,
        ease,
        repeat: loop ? Infinity : 0,
      },
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
      style={{ transformOrigin: "50% 50%", ...style }}
      {...animationProps}
    >
      <path d="m6 9 6 6 6-6" />
    </motion.svg>
  );
};

export default ChevronDownIcon;
