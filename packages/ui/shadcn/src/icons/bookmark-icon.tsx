import { useEffect, useState } from "react";
import { motion } from "motion/react";
import type { Easing, SVGMotionProps } from "motion/react";

import { useMediaPrefersReducedMotion } from "@arclayer/hooks/use-media-prefers-reduced-motion";

interface BookmarkIconProps extends Omit<SVGMotionProps<SVGSVGElement>, "strokeWidth"> {
  size?: number;
  duration?: number;
  strokeWidth?: number;
  isHovered?: boolean;
  isFilled?: boolean;
  ease?: Easing;
}

const BookmarkIcon = (props: BookmarkIconProps) => {
  const {
    size = 28,
    duration = 0.4,
    strokeWidth = 2,
    isHovered = false,
    isFilled = false,
    ease = "easeInOut",
    className,
    ...restProps
  } = props;

  const [nonce, setNonce] = useState(0);
  const reducedMotion = useMediaPrefersReducedMotion();

  useEffect(() => {
    if (reducedMotion) return;
    if (isHovered) setNonce((n) => n + 1);
  }, [isHovered, reducedMotion]);

  const shouldAnimate = !reducedMotion && isHovered;

  const animateProps = isFilled
    ? shouldAnimate
      ? { scale: [1, 1.25, 1] }
      : { scale: 1 }
    : shouldAnimate
      ? { rotate: [0, -12, 12, -8, 8, 0] }
      : { rotate: 0 };

  return (
    <motion.svg
      key={nonce}
      {...restProps}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={isFilled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      animate={animateProps}
      transition={{ duration, ease }}
      style={{ transformOrigin: "50% 50%" }}
    >
      <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
    </motion.svg>
  );
};

export default BookmarkIcon;
