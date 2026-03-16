"use client";

import { motion, type SVGMotionProps, type Easing } from "motion/react";
import { useIconHoverState } from "./use-icon-hover-state";

interface IconProps extends SVGMotionProps<SVGSVGElement> {
  size?: number;
  duration?: number;
  strokeWidth?: number;
  isHovered?: boolean;
  repeatDelay?: number;
  ease?: Easing;
}

const ExternalLinkIcon = (props: IconProps) => {
  const {
    size = 28,
    duration = 1.5,
    strokeWidth = 2,
    isHovered,
    repeatDelay = 1,
    ease = "easeInOut",
    className,
    ...restProps
  } = props;

  const hoverState = useIconHoverState(isHovered);
  const shouldAnimate = hoverState.hovered;

  const transition = {
    duration: duration,
    ease: ease,
    repeat: 0,
    repeatDelay: repeatDelay,
  };

  return (
    <motion.svg
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
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6" />
      <motion.path
        d="M11 13l9 -9"
        animate={shouldAnimate ? { x: [0, 2, 0], y: [0, -2, 0] } : { x: 0, y: 0 }}
        transition={transition}
      />
      <motion.path
        d="M15 4h5v5"
        animate={shouldAnimate ? { x: [0, 2, 0], y: [0, -2, 0] } : { x: 0, y: 0 }}
        transition={transition}
      />
    </motion.svg>
  );
};

export default ExternalLinkIcon;
