import { motion } from "motion/react";
import { IllustrationWrapper } from "./illustration-wrapper";
import type { IllustrationProps } from "./types";
import { useIllustrationAnimation } from "./use-illustration-animation";

export function IllustEmptyContainer(props: IllustrationProps) {
  const { animate } = useIllustrationAnimation();

  return (
    <IllustrationWrapper {...props}>
      <defs>
        <filter id="glow-empty" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <linearGradient id="hologram-grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.0" />
        </linearGradient>
      </defs>

      {/* Background Tech Grid */}
      <motion.g
        initial={animate ? { opacity: 0 } : undefined}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
      >
        <circle
          cx="100"
          cy="80"
          r="70"
          fill="none"
          stroke="var(--color-border)"
          strokeWidth="1"
          strokeDasharray="2 6"
          opacity="0.5"
        />
        <circle
          cx="100"
          cy="80"
          r="45"
          fill="none"
          stroke="var(--color-border)"
          strokeWidth="1"
          strokeDasharray="4 4"
          opacity="0.5"
        />
      </motion.g>

      {/* Holographic Empty Container */}
      <motion.g
        initial={animate ? { y: 20, opacity: 0 } : undefined}
        animate={{ y: [0, -6, 0], opacity: 1 }}
        transition={{
          y: { duration: 4, repeat: Infinity, ease: "easeInOut" },
          opacity: { duration: 0.6 },
        }}
      >
        {/* Container Back Wall (Inside) */}
        <path
          d="M 50 60 V 110 A 50 20 0 0 0 150 110 V 60 A 50 20 0 0 1 50 60 Z"
          fill="var(--color-muted)"
          opacity="0.3"
        />

        {/* Holographic Fill */}
        <path d="M 50 60 V 110 A 50 20 0 0 0 150 110 V 60 Z" fill="url(#hologram-grad)" />

        {/* Wireframe Body */}
        <path
          d="M 50 60 V 110 A 50 20 0 0 0 150 110 V 60"
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="1.5"
          opacity="0.6"
        />

        {/* Top Opening */}
        <ellipse
          cx="100"
          cy="60"
          rx="50"
          ry="20"
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="2"
          filter="url(#glow-empty)"
        />
        <ellipse
          cx="100"
          cy="60"
          rx="40"
          ry="15"
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="1"
          opacity="0.4"
          strokeDasharray="4 4"
        />
      </motion.g>

      {/* Scanning Laser Plane */}
      <motion.g
        initial={animate ? { opacity: 0 } : undefined}
        animate={{ y: [60, 110, 60], opacity: 1 }}
        transition={{
          y: { duration: 3, repeat: Infinity, ease: "linear" },
          opacity: { duration: 0.5, delay: 0.5 },
        }}
      >
        <ellipse
          cx="100"
          cy="0"
          rx="48"
          ry="18"
          fill="var(--color-primary)"
          opacity="0.2"
          filter="url(#glow-empty)"
        />
        <ellipse
          cx="100"
          cy="0"
          rx="48"
          ry="18"
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="1.5"
          opacity="0.8"
        />
      </motion.g>

      {/* Floating Dust / Data Particles */}
      <motion.g
        animate={{ y: [0, -15, 0], opacity: [0, 0.8, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        <circle cx="80" cy="80" r="2" fill="var(--color-primary)" filter="url(#glow-empty)" />
        <circle cx="120" cy="90" r="1.5" fill="var(--color-primary)" opacity="0.6" />
        <circle cx="100" cy="100" r="2.5" fill="var(--color-primary)" opacity="0.4" />
      </motion.g>
    </IllustrationWrapper>
  );
}
