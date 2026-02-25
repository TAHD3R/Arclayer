import { motion } from "motion/react";

import { IllustrationWrapper } from "./illustration-wrapper";
import type { IllustrationProps } from "./types";
import { SPRING, TWEEN, useIllustrationAnimation } from "./use-illustration-animation";

/**
 * 401 Unauthorized tech-style illustration.
 * Locked terminal: rounded screen + padlock + keyhole.
 */
export function Illust401LockedTerminal(props: IllustrationProps) {
  const { animate } = useIllustrationAnimation();

  return (
    <IllustrationWrapper {...props}>
      {/* Screen / monitor */}
      <motion.g
        initial={animate ? { opacity: 0 } : undefined}
        animate={animate ? { opacity: 1 } : undefined}
        transition={{ duration: 0.3 }}
      >
        {/* Monitor body */}
        <rect
          x="40"
          y="20"
          width="120"
          height="80"
          rx="8"
          fill="hsl(var(--card))"
          stroke="hsl(var(--border))"
          strokeWidth="1.5"
        />

        {/* Terminal decorative dots (top-left) */}
        <circle cx="54" cy="32" r="2" fill="hsl(var(--muted))" />
        <circle cx="62" cy="32" r="2" fill="hsl(var(--muted))" />
        <circle cx="70" cy="32" r="2" fill="hsl(var(--muted))" />

        {/* Terminal scan lines */}
        <line
          x1="50"
          y1="42"
          x2="150"
          y2="42"
          stroke="hsl(var(--border))"
          strokeWidth="0.5"
          opacity="0.5"
        />

        {/* Stand neck */}
        <rect
          x="92"
          y="100"
          width="16"
          height="14"
          rx="2"
          fill="hsl(var(--muted))"
          stroke="hsl(var(--border))"
          strokeWidth="1.5"
        />

        {/* Stand base */}
        <rect
          x="78"
          y="112"
          width="44"
          height="6"
          rx="3"
          fill="hsl(var(--muted))"
          stroke="hsl(var(--border))"
          strokeWidth="1.5"
        />

        {/* Corner decorative marks */}
        <line
          x1="44"
          y1="26"
          x2="48"
          y2="26"
          stroke="hsl(var(--border))"
          strokeWidth="1"
          opacity="0.4"
        />
        <line
          x1="44"
          y1="26"
          x2="44"
          y2="30"
          stroke="hsl(var(--border))"
          strokeWidth="1"
          opacity="0.4"
        />
        <line
          x1="152"
          y1="26"
          x2="156"
          y2="26"
          stroke="hsl(var(--border))"
          strokeWidth="1"
          opacity="0.4"
        />
        <line
          x1="156"
          y1="26"
          x2="156"
          y2="30"
          stroke="hsl(var(--border))"
          strokeWidth="1"
          opacity="0.4"
        />
      </motion.g>

      {/* Lock icon (padlock) — springs in */}
      <motion.g
        initial={animate ? { scale: 0, opacity: 0 } : undefined}
        animate={animate ? { scale: 1, opacity: 1 } : undefined}
        transition={animate ? { ...SPRING, delay: 0.2 } : undefined}
        style={{ transformOrigin: "100px 72px" }}
      >
        {/* Shackle (arc) */}
        <path
          d="M90 68 V62 A10 10 0 0 1 110 62 V68"
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Lock body */}
        <rect
          x="86"
          y="68"
          width="28"
          height="22"
          rx="4"
          fill="hsl(var(--muted))"
          stroke="hsl(var(--primary))"
          strokeWidth="2"
        />

        {/* Keyhole — delayed fade in */}
        <motion.g
          initial={animate ? { opacity: 0 } : undefined}
          animate={animate ? { opacity: 1 } : undefined}
          transition={animate ? { ...TWEEN, duration: 0.4, delay: 0.5 } : undefined}
        >
          {/* Keyhole circle */}
          <circle cx="100" cy="77" r="3" fill="hsl(var(--primary))" />
          {/* Keyhole slot */}
          <rect x="98.5" y="79" width="3" height="5" rx="1" fill="hsl(var(--primary))" />
        </motion.g>
      </motion.g>

      {/* Subtle side decorative dots */}
      <circle cx="30" cy="60" r="1.5" fill="hsl(var(--border))" opacity="0.4" />
      <circle cx="170" cy="60" r="1.5" fill="hsl(var(--border))" opacity="0.4" />
      <circle cx="26" cy="70" r="1" fill="hsl(var(--border))" opacity="0.3" />
      <circle cx="174" cy="70" r="1" fill="hsl(var(--border))" opacity="0.3" />
    </IllustrationWrapper>
  );
}
