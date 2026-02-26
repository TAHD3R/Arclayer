import { motion } from "motion/react";
import { IllustrationWrapper } from "./illustration-wrapper";
import type { IllustrationProps } from "./types";
import { SPRING, useIllustrationAnimation } from "./use-illustration-animation";

export function Illust401LockedTerminal(props: IllustrationProps) {
  const { animate } = useIllustrationAnimation();

  return (
    <IllustrationWrapper {...props}>
      <defs>
        <filter id="glow-401" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <linearGradient id="grad-401" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.2" />
          <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.0" />
        </linearGradient>
      </defs>

      {/* Background Tech Grid */}
      <motion.g
        initial={animate ? { opacity: 0 } : undefined}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
      >
        <circle cx="100" cy="80" r="70" fill="url(#grad-401)" />
        <circle
          cx="100"
          cy="80"
          r="50"
          fill="none"
          stroke="var(--color-primary)"
          strokeOpacity="0.1"
          strokeWidth="1"
        />
        <circle
          cx="100"
          cy="80"
          r="30"
          fill="none"
          stroke="var(--color-primary)"
          strokeOpacity="0.2"
          strokeWidth="1"
          strokeDasharray="4 4"
        />
      </motion.g>

      {/* Floating Terminal Panels */}
      <motion.g
        initial={animate ? { y: 20, opacity: 0 } : undefined}
        animate={{ y: [0, -5, 0], opacity: 1 }}
        transition={{
          y: { duration: 4, repeat: Infinity, ease: "easeInOut" },
          opacity: { duration: 0.5 },
        }}
      >
        {/* Back Panel */}
        <rect
          x="35"
          y="25"
          width="110"
          height="70"
          rx="8"
          fill="var(--color-card)"
          opacity="0.5"
          stroke="var(--color-border)"
          strokeWidth="1"
        />

        {/* Main Panel */}
        <rect
          x="45"
          y="35"
          width="110"
          height="70"
          rx="8"
          fill="var(--color-card)"
          stroke="var(--color-border)"
          strokeWidth="1.5"
          style={{ filter: "drop-shadow(0 10px 15px rgba(0,0,0,0.1))" }}
        />

        {/* Terminal Header */}
        <path
          d="M45 43 Q45 35 53 35 H147 Q155 35 155 43 V50 H45 Z"
          fill="var(--color-muted)"
          opacity="0.5"
        />
        <line x1="45" y1="50" x2="155" y2="50" stroke="var(--color-border)" strokeWidth="1.5" />

        {/* Window Controls */}
        <circle cx="55" cy="42.5" r="2.5" fill="var(--color-destructive)" opacity="0.7" />
        <circle cx="65" cy="42.5" r="2.5" fill="var(--color-primary)" opacity="0.4" />
        <circle cx="75" cy="42.5" r="2.5" fill="var(--color-primary)" opacity="0.4" />

        {/* Code Lines */}
        <rect
          x="55"
          y="60"
          width="40"
          height="4"
          rx="2"
          fill="var(--color-primary)"
          opacity="0.3"
        />
        <rect x="55" y="72" width="60" height="4" rx="2" fill="var(--color-muted)" />
        <rect x="55" y="84" width="30" height="4" rx="2" fill="var(--color-muted)" />
      </motion.g>

      {/* Giant Glowing Lock */}
      <motion.g
        initial={animate ? { scale: 0.8, opacity: 0 } : undefined}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", ...SPRING, delay: 0.2 }}
      >
        {/* Glowing Aura behind lock */}
        <circle
          cx="120"
          cy="95"
          r="25"
          fill="var(--color-primary)"
          opacity="0.15"
          filter="url(#glow-401)"
        />

        {/* Shackle */}
        <path
          d="M108 85 V75 A12 12 0 0 1 132 75 V85"
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="3"
          strokeLinecap="round"
        />

        {/* Lock Body */}
        <rect
          x="100"
          y="85"
          width="40"
          height="30"
          rx="6"
          fill="var(--color-card)"
          stroke="var(--color-primary)"
          strokeWidth="2.5"
        />

        {/* Keyhole */}
        <circle cx="120" cy="97" r="3.5" fill="var(--color-primary)" />
        <path d="M118 99 L116.5 107 H123.5 L122 99 Z" fill="var(--color-primary)" />
      </motion.g>
    </IllustrationWrapper>
  );
}
