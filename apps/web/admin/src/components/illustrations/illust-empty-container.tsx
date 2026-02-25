import { motion } from "motion/react";

import { IllustrationWrapper } from "./illustration-wrapper";
import type { IllustrationProps } from "./types";
import { useIllustrationAnimation, SPRING, TWEEN } from "./use-illustration-animation";

/**
 * 空容器 / 无数据状态插图。
 * 展示一个打开的空盒子 + 虚线圆环 + 放大镜图标。
 */
export function IllustEmptyContainer(props: IllustrationProps) {
  const { animate } = useIllustrationAnimation();

  return (
    <IllustrationWrapper {...props}>
      {/* ── 打开的空盒子 ── */}
      <motion.g
        initial={animate ? { scale: 0.8, opacity: 0 } : undefined}
        animate={animate ? { scale: 1, opacity: 1 } : undefined}
        transition={{ type: "spring", ...SPRING }}
        style={{ originX: "100px", originY: "110px" }}
      >
        {/* 盒体（梯形透视） */}
        <path
          d="M70 90 L60 130 L140 130 L130 90 Z"
          fill="hsl(var(--card))"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        {/* 盒体底部高光线 */}
        <line
          x1={68}
          y1={110}
          x2={132}
          y2={110}
          stroke="hsl(var(--border))"
          strokeWidth={1}
          opacity={0.5}
        />
        {/* 左侧翻盖 */}
        <path
          d="M70 90 L58 72 L92 72 L100 90 Z"
          fill="hsl(var(--card))"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        {/* 右侧翻盖 */}
        <path
          d="M100 90 L108 72 L142 72 L130 90 Z"
          fill="hsl(var(--card))"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      </motion.g>

      {/* ── 虚线圆环（缓慢旋转描边偏移） ── */}
      <motion.circle
        cx={100}
        cy={70}
        r={20}
        fill="none"
        stroke="hsl(var(--border))"
        strokeWidth={1.5}
        strokeDasharray="4 3"
        animate={animate ? { strokeDashoffset: [0, -44] } : undefined}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "linear",
        }}
      />

      {/* ── 放大镜图标（浮动动画） ── */}
      <motion.g
        animate={animate ? { y: [0, -3, 0] } : undefined}
        transition={{
          duration: 2.5,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        <circle
          cx={135}
          cy={45}
          r={8}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          strokeLinecap="round"
        />
        <line
          x1={141}
          y1={51}
          x2={148}
          y2={58}
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          strokeLinecap="round"
        />
      </motion.g>

      {/* ── 装饰性小圆点 ── */}
      <motion.g
        initial={animate ? { opacity: 0 } : undefined}
        animate={animate ? { opacity: 1 } : undefined}
        transition={{ ...TWEEN, delay: 0.3 }}
      >
        <circle cx={55} cy={55} r={2} fill="hsl(var(--muted))" />
        <circle cx={150} cy={75} r={1.5} fill="hsl(var(--muted))" />
        <circle cx={45} cy={100} r={1.5} fill="hsl(var(--muted))" />
        <circle cx={160} cy={110} r={2} fill="hsl(var(--muted))" />
        <circle cx={80} cy={45} r={1.5} fill="hsl(var(--border))" />
        <circle cx={120} cy={140} r={1.5} fill="hsl(var(--border))" />
      </motion.g>
    </IllustrationWrapper>
  );
}
