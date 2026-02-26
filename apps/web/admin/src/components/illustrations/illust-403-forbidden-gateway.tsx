import { motion } from "motion/react";
import { IllustrationWrapper } from "./illustration-wrapper";
import type { IllustrationProps } from "./types";
import { SPRING, PATH_DRAW, useIllustrationAnimation } from "./use-illustration-animation";

export function Illust403ForbiddenGateway(props: IllustrationProps) {
  const { animate } = useIllustrationAnimation();

  return (
    <IllustrationWrapper {...props}>
      <defs>
        <filter id="glow-403" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <linearGradient id="grad-403" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--color-destructive)" stopOpacity="0.2" />
          <stop offset="100%" stopColor="var(--color-destructive)" stopOpacity="0.0" />
        </linearGradient>
      </defs>

      {/* Background Aura */}
      <motion.g
        initial={animate ? { opacity: 0 } : undefined}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
      >
        <circle cx="100" cy="80" r="60" fill="url(#grad-403)" />
        <path
          d="M 40 140 L 100 80 L 160 140"
          fill="none"
          stroke="var(--color-destructive)"
          strokeOpacity="0.1"
          strokeWidth="1"
        />
        <path
          d="M 40 20 L 100 80 L 160 20"
          fill="none"
          stroke="var(--color-destructive)"
          strokeOpacity="0.1"
          strokeWidth="1"
        />
      </motion.g>

      {/* Gateway / Core */}
      <motion.g
        initial={animate ? { scale: 0.9, opacity: 0 } : undefined}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", ...SPRING }}
      >
        <polygon
          points="100,30 145,55 145,105 100,130 55,105 55,55"
          fill="var(--color-card)"
          stroke="var(--color-border)"
          strokeWidth="1.5"
        />
        <polygon
          points="100,45 130,62 130,98 100,115 70,98 70,62"
          fill="none"
          stroke="var(--color-muted)"
          strokeWidth="1"
        />
      </motion.g>

      {/* Giant Shield */}
      <motion.g
        initial={animate ? { y: -20, opacity: 0 } : undefined}
        animate={{ y: [0, -3, 0], opacity: 1 }}
        transition={{
          y: { duration: 3, repeat: Infinity, ease: "easeInOut" },
          opacity: { duration: 0.4, delay: 0.2 },
        }}
        style={{ transformOrigin: "100px 80px" }}
      >
        <path
          d="M100 45 L135 55 L135 85 Q135 115 100 135 Q65 115 65 85 L65 55 Z"
          fill="var(--color-card)"
          stroke="var(--color-destructive)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          style={{ filter: "drop-shadow(0 8px 12px rgba(0,0,0,0.15))" }}
        />
        {/* Inner Shield Detail */}
        <path
          d="M100 55 L125 63 L125 85 Q125 108 100 122 Q75 108 75 85 L75 63 Z"
          fill="var(--color-destructive)"
          opacity="0.1"
        />

        {/* Prohibition Slash */}
        <motion.line
          x1="80"
          y1="70"
          x2="120"
          y2="110"
          stroke="var(--color-destructive)"
          strokeWidth="3.5"
          strokeLinecap="round"
          initial={animate ? { pathLength: 0 } : undefined}
          animate={{ pathLength: 1 }}
          transition={{ ...PATH_DRAW, delay: 0.4 }}
          filter="url(#glow-403)"
        />
      </motion.g>

      {/* Rejected Packets */}
      <motion.g
        initial={animate ? { opacity: 0 } : undefined}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
      >
        <motion.circle
          cx="40"
          cy="100"
          r="3"
          fill="var(--color-destructive)"
          animate={{ x: [0, 15, 0], y: [0, -15, 0], opacity: [0, 1, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
        />
        <motion.circle
          cx="160"
          cy="60"
          r="3"
          fill="var(--color-destructive)"
          animate={{ x: [0, -15, 0], y: [0, 15, 0], opacity: [0, 1, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut", delay: 0.7 }}
        />
      </motion.g>
    </IllustrationWrapper>
  );
}
