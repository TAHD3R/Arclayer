import { motion } from "motion/react";
import { IllustrationWrapper } from "./illustration-wrapper";
import type { IllustrationProps } from "./types";
import { SPRING, PATH_DRAW, useIllustrationAnimation } from "./use-illustration-animation";

export function Illust429OverloadedGauge(props: IllustrationProps) {
  const { animate } = useIllustrationAnimation();

  return (
    <IllustrationWrapper {...props}>
      <defs>
        <filter id="glow-429" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <linearGradient id="gauge-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--color-primary)" />
          <stop offset="60%" stopColor="var(--color-primary)" />
          <stop offset="80%" stopColor="var(--color-destructive)" />
          <stop offset="100%" stopColor="var(--color-destructive)" />
        </linearGradient>
      </defs>

      {/* Background Radar */}
      <motion.g
        initial={animate ? { opacity: 0 } : undefined}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
      >
        <path
          d="M 20 120 A 80 80 0 0 1 180 120"
          fill="none"
          stroke="var(--color-border)"
          strokeWidth="1"
          strokeDasharray="4 4"
        />
        <path
          d="M 40 120 A 60 60 0 0 1 160 120"
          fill="none"
          stroke="var(--color-border)"
          strokeWidth="1"
          opacity="0.5"
        />
      </motion.g>

      {/* Gauge Track */}
      <motion.g
        initial={animate ? { y: 20, opacity: 0 } : undefined}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", ...SPRING }}
      >
        {/* Thick Track Base */}
        <path
          d="M 30 110 A 70 70 0 0 1 170 110"
          fill="none"
          stroke="var(--color-card)"
          strokeWidth="16"
          strokeLinecap="round"
          style={{ filter: "drop-shadow(0 8px 10px rgba(0,0,0,0.1))" }}
        />

        {/* Gradient Value Track */}
        <motion.path
          d="M 30 110 A 70 70 0 0 1 170 110"
          fill="none"
          stroke="url(#gauge-grad)"
          strokeWidth="6"
          strokeLinecap="round"
          initial={animate ? { pathLength: 0 } : undefined}
          animate={{ pathLength: 0.95 }}
          transition={{ ...PATH_DRAW, delay: 0.2 }}
        />

        {/* Tick Marks */}
        <g stroke="var(--color-muted)" strokeWidth="2" strokeLinecap="round">
          <line x1="45" y1="110" x2="55" y2="110" />
          <line x1="55" y1="75" x2="63" y2="80" />
          <line x1="90" y1="50" x2="93" y2="58" />
          <line x1="135" y1="65" x2="130" y2="72" stroke="var(--color-destructive)" />
          <line x1="165" y1="95" x2="155" y2="95" stroke="var(--color-destructive)" />
        </g>
      </motion.g>

      {/* Glowing Danger Zone Aura */}
      <motion.circle
        cx="155"
        cy="95"
        r="15"
        fill="var(--color-destructive)"
        opacity="0.2"
        filter="url(#glow-429)"
        animate={{ scale: [1, 1.5, 1], opacity: [0.1, 0.3, 0.1] }}
        transition={{ duration: 1, repeat: Infinity }}
      />

      {/* Needle & Pivot */}
      <motion.g
        style={{ transformOrigin: "100px 110px" }}
        initial={animate ? { rotate: -80 } : undefined}
        animate={{ rotate: [-80, 70, 65, 75, 68] }}
        transition={{ duration: 1.5, ease: "easeOut", delay: 0.5 }}
      >
        {/* Needle Shadow */}
        <line
          x1="100"
          y1="110"
          x2="100"
          y2="45"
          stroke="rgba(0,0,0,0.2)"
          strokeWidth="4"
          strokeLinecap="round"
          transform="translate(2, 2)"
        />
        {/* Needle Body */}
        <line
          x1="100"
          y1="110"
          x2="100"
          y2="45"
          stroke="var(--color-foreground)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <line
          x1="100"
          y1="65"
          x2="100"
          y2="45"
          stroke="var(--color-destructive)"
          strokeWidth="3"
          strokeLinecap="round"
          filter="url(#glow-429)"
        />

        {/* Pivot Center */}
        <circle
          cx="100"
          cy="110"
          r="10"
          fill="var(--color-card)"
          stroke="var(--color-foreground)"
          strokeWidth="2.5"
        />
        <circle cx="100" cy="110" r="4" fill="var(--color-destructive)" />
      </motion.g>

      {/* Warning Text / Icon */}
      <motion.g
        initial={animate ? { opacity: 0 } : undefined}
        animate={{ opacity: [0, 1, 0.5, 1] }}
        transition={{ duration: 2, repeat: Infinity, delay: 1 }}
      >
        <path d="M 90 135 L 100 120 L 110 135 Z" fill="var(--color-destructive)" />
        <text
          x="100"
          y="148"
          textAnchor="middle"
          fill="var(--color-destructive)"
          fontSize="10"
          fontWeight="bold"
          letterSpacing="1"
        >
          MAX
        </text>
      </motion.g>
    </IllustrationWrapper>
  );
}
