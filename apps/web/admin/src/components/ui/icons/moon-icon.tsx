"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import type { Easing, SVGMotionProps } from "motion/react";

interface MoonIconProps extends Omit<SVGMotionProps<SVGSVGElement>, "strokeWidth"> {
  size?: number;
  duration?: number;
  strokeWidth?: number;
  /**
   * 由外部按钮的 hover 状态控制；为 true 时播放一次动效。
   * 如果需要持续旋转，请使用 `loop`。
   */
  isHovered?: boolean;
  loop?: boolean;
  repeatDelay?: number;
  ease?: Easing;
}

const MoonIcon = (props: MoonIconProps) => {
  const {
    size = 28, // Icon size in pixels
    duration = 1, // Animation duration in seconds
    strokeWidth = 2, // SVG stroke width
    isHovered = false, // 外部 hover 状态（true 时播放一次）
    loop = false,
    repeatDelay = 0.3, // Delay between animation loops (seconds)
    ease = "easeInOut", // Animation easing function
    className,
    ...restProps
  } = props;

  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (loop) return;
    if (isHovered) setNonce((n) => n + 1);
  }, [isHovered, loop]);

  const shouldAnimate = loop || isHovered;

  const moonProps = {
    animate: shouldAnimate ? { rotate: [0, -20, 20, -10, 10, 0] } : { rotate: 0 },
    transition: {
      duration: duration,
      ease: ease,
      repeat: loop ? Infinity : 0,
      repeatDelay: repeatDelay,
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
      {...moonProps}
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z" />
    </motion.svg>
  );
};

export default MoonIcon;
