import { motion } from "motion/react";
import { IllustrationWrapper } from "./illustration-wrapper";
import type { IllustrationProps } from "./types";
import { useIllustrationAnimation } from "./use-illustration-animation";

export function Illust401LockedTerminal(props: IllustrationProps) {
  const { animate } = useIllustrationAnimation({ userReducedMotion: props.reducedMotion });

  return (
    <IllustrationWrapper {...props}>
      <circle cx="100" cy="80" r="50" stroke="currentColor" strokeWidth="0.5" strokeOpacity="0.1" />

      <motion.g
        initial={animate ? { rotate: 0 } : undefined}
        animate={animate ? { rotate: 360 } : undefined}
        transition={{ duration: 0.6, repeat: Infinity, ease: "linear" }}
        style={{ transformOrigin: "100px 80px" }}
      >
        <circle
          cx="100"
          cy="80"
          r="42"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeOpacity="0.5"
          strokeDasharray="4 12 18 6"
        />
      </motion.g>

      <motion.g
        initial={animate ? { rotate: 0 } : undefined}
        animate={animate ? { rotate: -360 } : undefined}
        transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
        style={{ transformOrigin: "100px 80px" }}
      >
        <circle
          cx="100"
          cy="80"
          r="46"
          stroke="currentColor"
          strokeWidth="0.5"
          strokeOpacity="0.3"
          strokeDasharray="1 6"
        />
      </motion.g>

      <motion.circle
        cx="100"
        cy="80"
        r="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.5"
        initial={animate ? { scale: 1, opacity: 0.8 } : undefined}
        animate={animate ? { scale: [1, 2, 1], opacity: [0.8, 0.1, 0.8] } : undefined}
        transition={{ duration: 0.3, repeat: Infinity, ease: "easeInOut" }}
      />
    </IllustrationWrapper>
  );
}
