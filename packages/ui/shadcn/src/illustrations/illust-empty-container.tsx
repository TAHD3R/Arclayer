import { motion } from "motion/react";
import { IllustrationWrapper } from "./illustration-wrapper";
import type { IllustrationProps } from "./types";
import { useIllustrationAnimation } from "./use-illustration-animation";

export function IllustEmptyContainer(props: IllustrationProps) {
  const { animate } = useIllustrationAnimation();

  return (
    <IllustrationWrapper {...props}>
      <defs>
        <radialGradient id="empty-bg-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.08" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>

      <motion.rect
        width="100%"
        height="100%"
        fill="url(#empty-bg-glow)"
        initial={animate ? { opacity: 0.5 } : { opacity: 1 }}
        animate={animate ? { opacity: [0.5, 1, 0.5] } : undefined}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.path
        d="M 0 80 L 200 80"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.5"
        strokeOpacity="0.2"
        initial={animate ? { pathLength: 0, opacity: 0 } : undefined}
        animate={animate ? { pathLength: 1, opacity: 1 } : undefined}
        transition={{ duration: 1.5, ease: "easeOut" }}
      />

      <motion.path
        d="M 0 80 Q 50 80, 100 80 T 200 80"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.5"
        strokeOpacity="0.8"
        initial={animate ? { d: "M 0 80 Q 50 80, 100 80 T 200 80" } : undefined}
        animate={
          animate
            ? {
                d: [
                  "M 0 80 Q 50 80, 100 80 T 200 80",
                  "M 0 80 Q 50 60, 100 80 T 200 80",
                  "M 0 80 Q 50 80, 100 80 T 200 80",
                  "M 0 80 Q 50 100, 100 80 T 200 80",
                  "M 0 80 Q 50 80, 100 80 T 200 80",
                ],
              }
            : undefined
        }
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />

      <line
        x1="100"
        y1="75"
        x2="100"
        y2="85"
        stroke="currentColor"
        strokeWidth="0.5"
        strokeOpacity="0.3"
      />
      <circle cx="100" cy="80" r="1.5" fill="currentColor" opacity="0.6" />
    </IllustrationWrapper>
  );
}
