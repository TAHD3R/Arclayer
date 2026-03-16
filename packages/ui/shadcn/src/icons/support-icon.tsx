import { useEffect, useState } from "react";
import { motion } from "motion/react";
import type { Easing, SVGMotionProps } from "motion/react";

import { useMediaPrefersReducedMotion } from "@arclayer/hooks/use-media-prefers-reduced-motion";

interface SupportIconProps extends Omit<SVGMotionProps<SVGSVGElement>, "strokeWidth"> {
  size?: number;
  duration?: number;
  strokeWidth?: number;
  isHovered?: boolean;
  loop?: boolean;
  ease?: Easing;
}

const SupportIcon = (props: SupportIconProps) => {
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
    >
      <motion.path
        d="M9.1 9.25a2.9 2.9 0 1 1 5.55 1.24c-.34.7-1 1.2-1.69 1.66c-.72.49-1.46 1-1.46 1.85v.5"
        animate={shouldAnimate ? { rotate: [0, -6, 6, 0] } : { rotate: 0 }}
        style={{ transformOrigin: "50% 50%" }}
        transition={{ duration, ease, repeat: loop ? Infinity : 0 }}
      />
      <motion.path
        d="M12 16h.01"
        animate={shouldAnimate ? { opacity: [1, 0.3, 1] } : { opacity: 1 }}
        transition={{ duration, ease, repeat: loop ? Infinity : 0 }}
      />
      <motion.circle
        cx="12"
        cy="12"
        r="10"
        animate={shouldAnimate ? { scale: [1, 1.04, 1] } : { scale: 1 }}
        transition={{ duration, ease, repeat: loop ? Infinity : 0 }}
      />
    </motion.svg>
  );
};

export default SupportIcon;
