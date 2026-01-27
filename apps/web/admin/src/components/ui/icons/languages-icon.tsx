"use client";

import { useEffect, useState } from "react";
import { motion, type SVGMotionProps, type Easing } from "motion/react";

interface LanguagesIconProps extends Omit<SVGMotionProps<SVGSVGElement>, "strokeWidth"> {
  size?: number;
  duration?: number;
  strokeWidth?: number;
  /**
   * 由外部按钮的 hover 状态控制；为 true 时播放一次动效。
   * 如果需要持续旋转，请使用 `loop`。
   */
  isHovered?: boolean;
  loop?: boolean;
  ease?: Easing;
}

/**
 * 与项目内其他动态 Icon 一致的模式：
 * - 传入 `isHovered` 后仅在 hover 时播放一次动画
 * - 不传入时默认循环动画（通常不建议用于 UI 按钮）
 *
 * SVG 来源（lucide languages）：
 * <svg ... class="lucide lucide-languages">...</svg>
 */
const LanguagesIcon = (props: LanguagesIconProps) => {
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

  useEffect(() => {
    if (loop) return;
    if (isHovered) setNonce((n) => n + 1);
  }, [isHovered, loop]);

  const shouldAnimate = loop || isHovered;

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
