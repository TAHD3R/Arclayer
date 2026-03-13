import { motion } from "motion/react";
import { IllustrationWrapper } from "./illustration-wrapper";
import type { IllustrationProps } from "./types";
import { useIllustrationAnimation } from "./use-illustration-animation";

export function Illust500CrashedServer(props: IllustrationProps) {
  const { animate } = useIllustrationAnimation();

  // 基础的巨石/服务器基座结构
  const BaseMonolith = () => (
    <g>
      <rect
        x="65"
        y="30"
        width="70"
        height="100"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.8"
      />
      {[40, 50, 60, 70, 80, 90, 100, 110, 120].map((y) => (
        <line
          key={y}
          x1="65"
          y1={y}
          x2="135"
          y2={y}
          stroke="currentColor"
          strokeWidth="0.5"
          strokeOpacity="0.4"
        />
      ))}
      <rect
        x="61"
        y="26"
        width="78"
        height="108"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.5"
        strokeOpacity="0.2"
      />
    </g>
  );

  return (
    <IllustrationWrapper {...props}>
      <defs>
        {/* 用锐利的锯齿形掩码切开巨石 */}
        <mask id="left-mask">
          <path
            d="M 0 0 L 100 0 L 92 35 L 108 60 L 95 90 L 105 115 L 100 160 L 0 160 Z"
            fill="white"
          />
        </mask>
        <mask id="right-mask">
          <path
            d="M 200 0 L 100 0 L 92 35 L 108 60 L 95 90 L 105 115 L 100 160 L 200 160 Z"
            fill="white"
          />
        </mask>
      </defs>

      {/* 断裂的左半部分 */}
      <motion.g
        mask="url(#left-mask)"
        initial={animate ? { x: 0, y: 0, rotate: 0 } : undefined}
        animate={
          animate
            ? {
                x: [-3, -5, -3],
                y: [1, 2, 1],
                rotate: [-0.5, -1.5, -0.5],
              }
            : undefined
        }
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "65px 80px" }}
      >
        <BaseMonolith />
      </motion.g>

      {/* 断裂的右半部分 (向反方向漂移) */}
      <motion.g
        mask="url(#right-mask)"
        initial={animate ? { x: 0, y: 0, rotate: 0 } : undefined}
        animate={
          animate
            ? {
                x: [3, 5, 3],
                y: [-1, -2, -1],
                rotate: [0.5, 1.5, 0.5],
              }
            : undefined
        }
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
        style={{ transformOrigin: "135px 80px" }}
      >
        <BaseMonolith />
      </motion.g>

      {/* 缝隙中散落陨落的逻辑碎片 */}
      {Array.from({ length: 8 }).map((_, i) => (
        <motion.rect
          key={i}
          width="1.5"
          height="1.5"
          fill="currentColor"
          opacity="0.6"
          initial={{ x: 98 + (i % 3) * 2, y: 40 + i * 15 }}
          animate={
            animate
              ? {
                  y: 160,
                  opacity: [0, 0.8, 0],
                  rotate: [0, 90],
                }
              : undefined
          }
          transition={{ duration: 2 + (i % 2), repeat: Infinity, delay: i * 0.3 }}
        />
      ))}

      {/* 微弱的背景网格，强调空间的绝对性 */}
      <g opacity="0.05">
        {[20, 40, 60, 80, 100, 120, 140, 160].map((y) => (
          <line
            key={`h-${y}`}
            x1="0"
            y1={y}
            x2="200"
            y2={y}
            stroke="currentColor"
            strokeWidth="0.5"
          />
        ))}
        {[20, 40, 60, 80, 100, 120, 140, 160, 180].map((x) => (
          <line
            key={`v-${x}`}
            x1={x}
            y1="0"
            x2={x}
            y2="160"
            stroke="currentColor"
            strokeWidth="0.5"
          />
        ))}
      </g>
    </IllustrationWrapper>
  );
}
