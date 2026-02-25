import { motion } from "motion/react";

import { IllustrationWrapper } from "./illustration-wrapper";
import type { IllustrationProps } from "./types";
import { useIllustrationAnimation, SPRING, PATH_DRAW } from "./use-illustration-animation";

/**
 * 403 Forbidden — "Forbidden Gateway" tech-style illustration.
 * Screen + shield + diagonal prohibition slash.
 */
export function Illust403ForbiddenGateway(props: IllustrationProps) {
  const { animate } = useIllustrationAnimation();

  return (
    <IllustrationWrapper {...props}>
      {/* Screen / monitor */}
      <motion.g
        initial={animate ? { opacity: 0 } : undefined}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <rect
          x="40"
          y="30"
          width="120"
          height="80"
          rx="6"
          fill="hsl(var(--card))"
          stroke="hsl(var(--border))"
          strokeWidth="1.5"
        />
        {/* Screen stand */}
        <line
          x1="100"
          y1="110"
          x2="100"
          y2="124"
          stroke="hsl(var(--border))"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <line
          x1="82"
          y1="124"
          x2="118"
          y2="124"
          stroke="hsl(var(--border))"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        {/* Status dots */}
        <circle cx="52" cy="38" r="2" fill="hsl(var(--muted))" />
        <circle cx="59" cy="38" r="2" fill="hsl(var(--muted))" />
        <circle cx="66" cy="38" r="2" fill="hsl(var(--muted))" />
        {/* Screen inner area divider */}
        <line x1="40" y1="44" x2="160" y2="44" stroke="hsl(var(--border))" strokeWidth="1" />
      </motion.g>

      {/* Shield */}
      <motion.g
        initial={animate ? { opacity: 0, y: -15 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", ...SPRING, delay: 0.15 }}
      >
        <path
          d="M100 52 L120 60 L120 80 Q120 94 100 100 Q80 94 80 80 L80 60 Z"
          fill="hsl(var(--muted))"
          stroke="hsl(var(--primary))"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </motion.g>

      {/* Prohibition slash */}
      <motion.line
        x1="86"
        y1="58"
        x2="114"
        y2="94"
        stroke="hsl(var(--destructive))"
        strokeWidth="2.5"
        strokeLinecap="round"
        initial={animate ? { pathLength: 0 } : undefined}
        animate={{ pathLength: 1 }}
        transition={{ ...PATH_DRAW, delay: 0.4 }}
      />
    </IllustrationWrapper>
  );
}
