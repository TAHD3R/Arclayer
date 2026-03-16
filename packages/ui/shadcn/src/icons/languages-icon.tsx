import { useEffect, useState } from "react";
import { motion, type SVGMotionProps, type Easing } from "motion/react";

import { useMediaPrefersReducedMotion } from "@arclayer/hooks/use-media-prefers-reduced-motion";
import { useIconHoverState } from "./use-icon-hover-state";

interface LanguagesIconProps extends Omit<SVGMotionProps<SVGSVGElement>, "strokeWidth"> {
  size?: number;
  duration?: number;
  strokeWidth?: number;
  isHovered?: boolean;
  loop?: boolean;
  ease?: Easing;
}

const LanguagesIcon = (props: LanguagesIconProps) => {
  const {
    size = 28,
    duration = 0.9,
    strokeWidth = 2,
    isHovered,
    loop = false,
    ease = "easeInOut",
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
    animate: shouldAnimate ? { rotate: [0, -8, 8, -4, 4, 0] } : { rotate: 0 },
    transition: {
      duration,
      ease,
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
      <path d="m5 8 6 6" />
      <path d="m4 14 6-6 2-3" />
      <path d="M2 5h12" />
      <path d="M7 2h1" />
      <path d="m22 22-5-10-5 10" />
      <path d="M14 18h6" />
    </motion.svg>
  );
};

export default LanguagesIcon;
