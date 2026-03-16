import { useEffect, useState } from "react";
import { motion, type Easing, type SVGMotionProps } from "motion/react";

import { useMediaPrefersReducedMotion } from "@arclayer/hooks/use-media-prefers-reduced-motion";

interface ChevronRightIconProps extends Omit<SVGMotionProps<SVGSVGElement>, "strokeWidth"> {
  size?: number;
  duration?: number;
  strokeWidth?: number;
  isHovered?: boolean;
  loop?: boolean;
  ease?: Easing;
  expanded?: boolean;
}

const ChevronRightIcon = (props: ChevronRightIconProps) => {
  const {
    size = 28,
    duration = 0.5,
    strokeWidth = 2,
    isHovered = false,
    loop = false,
    ease = "easeInOut",
    className,
    expanded = false,
    style,
    ...restProps
  } = props;

  const [nonce, setNonce] = useState(0);
  const reducedMotion = useMediaPrefersReducedMotion();

  useEffect(() => {
    if (loop) return;
    if (reducedMotion) return;
    if (isHovered) setNonce((n) => n + 1);
  }, [isHovered, loop, reducedMotion]);

  const shouldAnimate = !reducedMotion && (loop || isHovered);
  const rotate = expanded ? 90 : 0;

  const animationProps = {
    animate: shouldAnimate ? { rotate, x: [0, 2, 0] } : { rotate, x: 0 },
    transition: {
      rotate: {
        duration: reducedMotion ? 0 : 0.18,
        ease,
      },
      x: {
        duration,
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
      style={{ transformOrigin: "50% 50%", ...style }}
      {...animationProps}
    >
      <path d="m9 18 6-6-6-6" />
    </motion.svg>
  );
};

export default ChevronRightIcon;
