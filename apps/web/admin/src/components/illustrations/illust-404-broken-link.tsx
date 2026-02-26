import { motion } from "motion/react";
import { IllustrationWrapper } from "./illustration-wrapper";
import type { IllustrationProps } from "./types";
import { SPRING, useIllustrationAnimation } from "./use-illustration-animation";

export function Illust404BrokenLink(props: IllustrationProps) {
  const { animate } = useIllustrationAnimation();

  return (
    <IllustrationWrapper {...props}>
      <defs>
        <filter id="glow-404" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <linearGradient id="grad-404" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.2" />
          <stop offset="100%" stopColor="var(--color-muted)" stopOpacity="0.1" />
        </linearGradient>
      </defs>

      {/* Background Grid */}
      <motion.g
        initial={animate ? { opacity: 0 } : undefined}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
      >
        <path
          d="M 20 80 Q 60 40 100 80 T 180 80"
          fill="none"
          stroke="var(--color-border)"
          strokeWidth="1"
          strokeDasharray="4 4"
          opacity="0.5"
        />
        <path
          d="M 20 100 Q 60 60 100 100 T 180 100"
          fill="none"
          stroke="var(--color-border)"
          strokeWidth="1"
          strokeDasharray="4 4"
          opacity="0.3"
        />
      </motion.g>

      {/* Left Node (Active) */}
      <motion.g
        initial={animate ? { x: -30, opacity: 0 } : undefined}
        animate={{ x: 0, opacity: 1, y: [0, -4, 0] }}
        transition={{
          x: { type: "spring", ...SPRING },
          opacity: { duration: 0.4 },
          y: { duration: 3.5, repeat: Infinity, ease: "easeInOut" },
        }}
      >
        <circle cx="50" cy="80" r="24" fill="url(#grad-404)" />
        <polygon
          points="50,60 68,80 50,100 32,80"
          fill="var(--color-card)"
          stroke="var(--color-primary)"
          strokeWidth="2"
          style={{ filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.1))" }}
        />
        <circle cx="50" cy="80" r="4" fill="var(--color-primary)" filter="url(#glow-404)" />
      </motion.g>

      {/* Right Node (Dead) */}
      <motion.g
        initial={animate ? { x: 30, opacity: 0 } : undefined}
        animate={{ x: 0, opacity: 1, y: [0, 4, 0] }}
        transition={{
          x: { type: "spring", ...SPRING, delay: 0.1 },
          opacity: { duration: 0.4, delay: 0.1 },
          y: { duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.5 },
        }}
      >
        <circle cx="150" cy="80" r="24" fill="var(--color-muted)" opacity="0.2" />
        <polygon
          points="150,60 168,80 150,100 132,80"
          fill="var(--color-card)"
          stroke="var(--color-border)"
          strokeWidth="2"
          strokeDasharray="4 2"
        />
        <circle cx="150" cy="80" r="4" fill="var(--color-muted)" />
      </motion.g>

      {/* Broken Beam */}
      <motion.g
        initial={animate ? { opacity: 0 } : undefined}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.4 }}
      >
        {/* Left Beam */}
        <line
          x1="68"
          y1="80"
          x2="90"
          y2="80"
          stroke="var(--color-primary)"
          strokeWidth="3"
          strokeLinecap="round"
          filter="url(#glow-404)"
        />
        {/* Right Beam (Faded) */}
        <line
          x1="110"
          y1="80"
          x2="132"
          y2="80"
          stroke="var(--color-border)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="2 4"
        />
      </motion.g>

      {/* 404 Text / Glitch */}
      <motion.g
        initial={animate ? { scale: 0, opacity: 0 } : undefined}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", ...SPRING, delay: 0.5 }}
      >
        <text
          x="100"
          y="70"
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--color-destructive)"
          fontSize="28"
          fontWeight="900"
          fontStyle="italic"
          letterSpacing="2"
        >
          404
        </text>
        {/* Glitch lines */}
        <motion.line
          x1="85"
          y1="70"
          x2="115"
          y2="70"
          stroke="var(--color-card)"
          strokeWidth="2"
          animate={{ y: [70, 65, 75, 70], opacity: [0, 1, 1, 0] }}
          transition={{ duration: 0.2, repeat: Infinity, repeatDelay: 3 }}
        />
      </motion.g>

      {/* Floating Particles */}
      <motion.g
        animate={{ y: [0, -10, 0], opacity: [0, 1, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <circle cx="95" cy="90" r="1.5" fill="var(--color-primary)" />
        <circle cx="105" cy="85" r="1" fill="var(--color-destructive)" />
      </motion.g>
    </IllustrationWrapper>
  );
}
