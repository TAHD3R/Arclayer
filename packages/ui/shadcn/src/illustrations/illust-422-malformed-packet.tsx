import { motion } from "motion/react";
import { IllustrationWrapper } from "./illustration-wrapper";
import type { IllustrationProps } from "./types";
import { useIllustrationAnimation } from "./use-illustration-animation";

export function Illust422MalformedPacket(props: IllustrationProps) {
  const { animate } = useIllustrationAnimation();

  return (
    <IllustrationWrapper {...props}>
      {/* 极度缓慢旋转的畸变几何体：一个内部连线完全错误的等距立方体 */}
      <motion.g
        animate={animate ? { rotate: 360 } : undefined}
        transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
        style={{ transformOrigin: "100px 80px" }}
      >
        {/* 立方体外部正确轮廓 (微弱) */}
        <path
          d="M 100 35 L 135 55 L 135 105 L 100 125 L 65 105 L 65 55 Z"
          stroke="currentColor"
          strokeWidth="0.5"
          fill="none"
          strokeOpacity="0.2"
        />

        {/* 正确的内部辅助线 (暗示原本的结构) */}
        <path
          d="M 100 80 L 100 35 M 100 80 L 65 105 M 100 80 L 135 105"
          stroke="currentColor"
          strokeWidth="0.5"
          fill="none"
          strokeOpacity="0.1"
          strokeDasharray="2 4"
        />

        {/* 强行穿插、违背空间物理的错误逻辑连线 (高亮) */}
        {/* 左上顶点连接到右下边 */}
        <motion.path
          d="M 65 55 L 115 115"
          stroke="currentColor"
          strokeWidth="1"
          fill="none"
          strokeOpacity="0.8"
          animate={
            animate
              ? { d: ["M 65 55 L 115 115", "M 65 55 L 125 110", "M 65 55 L 115 115"] }
              : undefined
          }
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* 顶部顶点直接贯穿到底部左侧外 */}
        <motion.path
          d="M 100 35 L 50 95"
          stroke="currentColor"
          strokeWidth="0.8"
          fill="none"
          strokeOpacity="0.7"
          animate={
            animate
              ? { d: ["M 100 35 L 50 95", "M 100 35 L 60 100", "M 100 35 L 50 95"] }
              : undefined
          }
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        />
        {/* 右上顶点错位连接 */}
        <motion.path
          d="M 135 55 L 85 90"
          stroke="currentColor"
          strokeWidth="0.8"
          fill="none"
          strokeOpacity="0.6"
          animate={
            animate
              ? { d: ["M 135 55 L 85 90", "M 135 55 L 75 85", "M 135 55 L 85 90"] }
              : undefined
          }
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 5 }}
        />
        {/* 底部顶点反向穿透 */}
        <motion.path
          d="M 100 125 L 125 45"
          stroke="currentColor"
          strokeWidth="1"
          fill="none"
          strokeOpacity="0.9"
          animate={
            animate
              ? { d: ["M 100 125 L 125 45", "M 100 125 L 115 40", "M 100 125 L 125 45"] }
              : undefined
          }
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        />

        {/* 空间中游离的、无法对齐的孤立顶点 */}
        <circle cx="125" cy="45" r="1.5" fill="currentColor" opacity="0.8" />
        <circle cx="50" cy="95" r="1.5" fill="currentColor" opacity="0.7" />
        <circle cx="115" cy="115" r="1.5" fill="currentColor" opacity="0.9" />
      </motion.g>

      {/* 极其缓慢的背景干扰线 */}
      <motion.line
        x1="20"
        y1="140"
        x2="180"
        y2="20"
        stroke="currentColor"
        strokeWidth="0.5"
        strokeOpacity="0.1"
        animate={animate ? { x1: [20, 40, 20], x2: [180, 160, 180] } : undefined}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
      />
    </IllustrationWrapper>
  );
}
