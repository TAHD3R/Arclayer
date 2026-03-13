import { motion } from "motion/react";
import { IllustrationWrapper } from "./illustration-wrapper";
import type { IllustrationProps } from "./types";
import { useIllustrationAnimation } from "./use-illustration-animation";

export function Illust429OverloadedGauge(props: IllustrationProps) {
  const { animate } = useIllustrationAnimation();

  // 构建高密度的同心圆阵列 (产生 Moiré 视觉干涉)
  // 通过极其缓慢的缩放，表现出巨大的压迫感和窒息感，而非速度感。
  const circles = Array.from({ length: 40 }).map((_, i) => {
    // 间距随着向外扩展而产生非线性变化，强化密度感
    const r = 4 + Math.pow(i, 1.25) * 1.5;

    return (
      <motion.circle
        key={i}
        cx="100"
        cy="80"
        r={r}
        stroke="currentColor"
        strokeWidth="0.5"
        fill="none"
        strokeOpacity={Math.max(0.05, 0.7 - i * 0.015)}
        initial={animate ? { scale: 0.98 } : undefined}
        animate={animate ? { scale: [0.98, 1.02, 0.98] } : undefined}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: "easeInOut",
          delay: i * 0.15,
        }}
        style={{ transformOrigin: "100px 80px" }}
      />
    );
  });

  return (
    <IllustrationWrapper {...props}>
      <defs>
        {/* 微弱的核心压力深渊 */}
        <radialGradient id="pressure-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.15" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 呼吸感的核心阴影 */}
      <motion.rect
        width="100%"
        height="100%"
        fill="url(#pressure-core)"
        animate={animate ? { opacity: [0.4, 0.8, 0.4] } : undefined}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* 密集的同心圆阵列 */}
      <g>{circles}</g>

      {/* 限制容器：一个坚硬的方框，强化被"塞满"和"受限"的物理张力 */}
      <motion.rect
        x="30"
        y="25"
        width="140"
        height="110"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.5"
        strokeOpacity="0.3"
        animate={
          animate
            ? {
                strokeOpacity: [0.1, 0.3, 0.1],
                rx: [0, 4, 0], // 边角受到压力缓慢变形
              }
            : undefined
        }
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
      />
    </IllustrationWrapper>
  );
}
