import { motion } from "motion/react";
import { IllustrationWrapper } from "./illustration-wrapper";
import type { IllustrationProps } from "./types";
import { useIllustrationAnimation } from "./use-illustration-animation";

export function Illust404BrokenLink(props: IllustrationProps) {
  const { animate } = useIllustrationAnimation({ userReducedMotion: props.reducedMotion });

  return (
    <IllustrationWrapper {...props}>
      {/* 虚空排除区 (圆形透明洞口) */}
      <defs>
        <mask id="void-mask">
          <rect width="200" height="160" fill="white" />
          <circle cx="100" cy="80" r="32" fill="black" />
        </mask>
      </defs>

      {/* 虚空弦动线阵 - 在中心洞口处断裂并绕行 */}
      <g mask="url(#void-mask)">
        {Array.from({ length: 16 }).map((_, i) => {
          const y = 25 + i * 8;
          const dist = Math.abs(y - 80);
          const pull = Math.max(0, 35 - dist * 0.8); // 边缘吸附力

          return (
            <motion.path
              key={i}
              d={`M 0 ${y} Q 100 ${y > 80 ? y + pull : y - pull} 200 ${y}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
              strokeOpacity={0.15}
              initial={animate ? { pathLength: 0 } : undefined}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1, delay: i * 0.05 }}
            />
          );
        })}
      </g>

      {/* 洞口边缘的残余弦 */}
      <motion.circle
        cx="100"
        cy="80"
        r="32"
        stroke="currentColor"
        strokeWidth="0.5"
        strokeOpacity="0.3"
        strokeDasharray="2 10"
        animate={animate ? { rotate: 360 } : undefined}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        style={{ transformOrigin: "100px 80px" }}
      />

      {/* 丢失的信号点 (Ping) */}
      <motion.circle
        cx="100"
        cy="80"
        r="2"
        fill="currentColor"
        initial={animate ? { scale: 0, opacity: 0 } : undefined}
        animate={
          animate
            ? {
                scale: [1, 15],
                opacity: [0.6, 0],
              }
            : undefined
        }
        transition={{ duration: 3, repeat: Infinity, ease: "easeOut" }}
      />
    </IllustrationWrapper>
  );
}
