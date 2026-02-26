import { motion } from "motion/react";
import { IllustrationWrapper } from "./illustration-wrapper";
import type { IllustrationProps } from "./types";
import { SPRING, useIllustrationAnimation } from "./use-illustration-animation";

export function Illust500CrashedServer(props: IllustrationProps) {
  const { animate } = useIllustrationAnimation();

  return (
    <IllustrationWrapper {...props}>
      <defs>
        <filter id="glow-500" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <linearGradient id="server-grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="var(--color-card)" />
          <stop offset="100%" stopColor="var(--color-muted)" />
        </linearGradient>
      </defs>

      {/* Background Grid */}
      <motion.g
        initial={animate ? { opacity: 0 } : undefined}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
      >
        <path
          d="M 50 20 V 140 M 100 20 V 140 M 150 20 V 140"
          stroke="var(--color-border)"
          strokeWidth="1"
          strokeDasharray="4 4"
          opacity="0.4"
        />
        <path
          d="M 20 50 H 180 M 20 110 H 180"
          stroke="var(--color-border)"
          strokeWidth="1"
          strokeDasharray="4 4"
          opacity="0.4"
        />
      </motion.g>

      {/* Server Rack Frame */}
      <motion.rect
        x="60"
        y="25"
        width="80"
        height="110"
        rx="6"
        fill="url(#server-grad)"
        stroke="var(--color-border)"
        strokeWidth="2"
        style={{ filter: "drop-shadow(0 10px 15px rgba(0,0,0,0.2))" }}
        initial={animate ? { y: 20, opacity: 0 } : undefined}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", ...SPRING }}
      />

      {/* Healthy Blades (Top & Bottom) */}
      <motion.g
        initial={animate ? { opacity: 0 } : undefined}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        {/* Top Blade */}
        <rect
          x="65"
          y="35"
          width="70"
          height="20"
          rx="3"
          fill="var(--color-card)"
          stroke="var(--color-border)"
          strokeWidth="1"
        />
        <circle cx="120" cy="45" r="3" fill="var(--color-primary)" filter="url(#glow-500)" />
        <rect x="75" y="43" width="30" height="4" rx="2" fill="var(--color-muted)" />

        {/* Bottom Blade */}
        <rect
          x="65"
          y="105"
          width="70"
          height="20"
          rx="3"
          fill="var(--color-card)"
          stroke="var(--color-border)"
          strokeWidth="1"
        />
        <circle cx="120" cy="115" r="3" fill="var(--color-primary)" filter="url(#glow-500)" />
        <rect x="75" y="113" width="30" height="4" rx="2" fill="var(--color-muted)" />
      </motion.g>

      {/* Crashed Blade (Middle) */}
      <motion.g
        initial={animate ? { x: 0, opacity: 0 } : undefined}
        animate={{ x: -20, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 12, delay: 0.4 }}
      >
        {/* Ejected Blade */}
        <rect
          x="65"
          y="70"
          width="70"
          height="20"
          rx="3"
          fill="var(--color-card)"
          stroke="var(--color-destructive)"
          strokeWidth="2"
          style={{ filter: "drop-shadow(5px 5px 10px rgba(0,0,0,0.3))" }}
        />
        <rect
          x="75"
          y="78"
          width="30"
          height="4"
          rx="2"
          fill="var(--color-destructive)"
          opacity="0.3"
        />

        {/* Blinking Error Light */}
        <motion.circle
          cx="120"
          cy="80"
          r="3"
          fill="var(--color-destructive)"
          filter="url(#glow-500)"
          animate={{ opacity: [1, 0.2, 1] }}
          transition={{ duration: 0.4, repeat: Infinity }}
        />
      </motion.g>

      {/* Smoke / Sparks */}
      <motion.g
        initial={animate ? { opacity: 0 } : undefined}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
      >
        {/* Lightning Crack */}
        <motion.path
          d="M 135 60 L 148 72 L 140 80 L 155 95"
          fill="none"
          stroke="var(--color-destructive)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#glow-500)"
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 1.5 }}
        />

        {/* Floating Embers */}
        <motion.circle
          cx="145"
          cy="65"
          r="1.5"
          fill="var(--color-destructive)"
          animate={{ y: [0, -15], opacity: [1, 0] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
        <motion.circle
          cx="150"
          cy="85"
          r="2"
          fill="var(--color-destructive)"
          animate={{ y: [0, -20], opacity: [1, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: 0.3 }}
        />
      </motion.g>
    </IllustrationWrapper>
  );
}
