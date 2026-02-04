import { useEffect, useState } from "react";
import { motion, type Easing, type SVGMotionProps } from "motion/react";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

interface ChevronDownIconProps extends Omit<SVGMotionProps<SVGSVGElement>, "strokeWidth"> {
  size?: number;
  duration?: number;
  strokeWidth?: number;
  isHovered?: boolean;
  loop?: boolean;
  ease?: Easing;
}

const ChevronDownIcon = (props: ChevronDownIconProps) => {
  const {
    size = 28,
    duration = 0.5,
    strokeWidth = 2,
    isHovered = false,
    loop = false,
    ease = "easeInOut",
    className,
    ...restProps
  } = props;

  const [nonce, setNonce] = useState(0);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (loop) return;
    if (reducedMotion) return;
    if (isHovered) setNonce((n) => n + 1);
  }, [isHovered, loop, reducedMotion]);

  const shouldAnimate = !reducedMotion && (loop || isHovered);

  const animationProps = {
    animate: shouldAnimate ? { y: [0, 2, 0] } : { y: 0 },
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
      {...animationProps}
    >
      <path d="m6 9 6 6 6-6" />
    </motion.svg>
  );
};

export default ChevronDownIcon;
