import { motion } from "motion/react";
import { IllustrationWrapper } from "./illustration-wrapper";
import type { IllustrationProps } from "./types";
import { useIllustrationAnimation } from "./use-illustration-animation";

export function Illust403ForbiddenGateway(props: IllustrationProps) {
  const { animate } = useIllustrationAnimation({ userReducedMotion: props.reducedMotion });

  return (
    <IllustrationWrapper {...props}>
      <g opacity="0.08">
        {[20, 40, 60].map((y) => (
          <line key={y} x1="0" y1={y} x2="200" y2={y} stroke="currentColor" strokeWidth="0.5" />
        ))}
        {[20, 40, 60, 80, 100, 120, 140, 160, 180].map((x) => (
          <line key={x} x1={x} y1="0" x2={x} y2="80" stroke="currentColor" strokeWidth="0.5" />
        ))}
      </g>

      <g opacity="0.08" transform="translate(15, 0)">
        {[100, 120, 140].map((y) => (
          <line key={y} x1="0" y1={y} x2="200" y2={y} stroke="currentColor" strokeWidth="0.5" />
        ))}
        {[20, 40, 60, 80, 100, 120, 140, 160, 180].map((x) => (
          <line key={x} x1={x} y1="80" x2={x} y2="160" stroke="currentColor" strokeWidth="0.5" />
        ))}
      </g>

      <motion.line
        x1="0"
        y1="80"
        x2="200"
        y2="80"
        stroke="currentColor"
        strokeWidth="0.8"
        strokeOpacity="0.8"
        initial={animate ? { pathLength: 0 } : undefined}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.6 }}
      />

      <g fill="currentColor">
        {[20, 45, 70, 95, 120, 145, 170].map((x, i) => (
          <motion.path
            key={`top-${x}`}
            d={`M ${x} 80 L ${x + 10} 68 L ${x + 20} 80 Z`}
            initial={animate ? { y: 10, opacity: 0 } : undefined}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: i * 0.08, ease: "circOut" }}
          />
        ))}
        {[30, 55, 80, 105, 130, 155].map((x, i) => (
          <motion.path
            key={`bot-${x}`}
            d={`M ${x} 80 L ${x + 10} 92 L ${x + 20} 80 Z`}
            initial={animate ? { y: -10, opacity: 0 } : undefined}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: i * 0.08 + 0.2, ease: "circOut" }}
          />
        ))}
      </g>
    </IllustrationWrapper>
  );
}
