import { useEffect, useState } from "react";
import { motion } from "motion/react";
import type { Easing, SVGMotionProps } from "motion/react";

import { useMediaPrefersReducedMotion } from "@celestial/hooks/use-media-prefers-reduced-motion";

interface BellIconProps extends Omit<SVGMotionProps<SVGSVGElement>, "strokeWidth"> {
  size?: number;
  duration?: number;
  strokeWidth?: number;
  isHovered?: boolean;
  loop?: boolean;
  ease?: Easing;
}

const BellIcon = (props: BellIconProps) => {
  const {
    size = 28,
    duration = 0.9,
    strokeWidth = 2,
    isHovered = false,
    loop = false,
    ease = "easeInOut",
    className,
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
      animate={shouldAnimate ? { rotate: [0, -12, 12, -8, 8, 0] } : { rotate: 0 }}
      transition={{ duration, ease, repeat: loop ? Infinity : 0 }}
      style={{ transformOrigin: "50% 20%" }}
    >
      <path d="M10.268 21a2 2 0 0 0 3.464 0" />
      <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
    </motion.svg>
  );
};

export default BellIcon;
