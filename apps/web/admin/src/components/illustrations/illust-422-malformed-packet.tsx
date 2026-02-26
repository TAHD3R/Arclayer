import { motion } from "motion/react";
import { IllustrationWrapper } from "./illustration-wrapper";
import type { IllustrationProps } from "./types";
import { SPRING, PATH_DRAW, useIllustrationAnimation } from "./use-illustration-animation";

export function Illust422MalformedPacket(props: IllustrationProps) {
  const { animate } = useIllustrationAnimation();

  return (
    <IllustrationWrapper {...props}>
      <defs>
        <filter id="glow-422" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <linearGradient id="grad-422" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--color-destructive)" stopOpacity="0.15" />
          <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.05" />
        </linearGradient>
      </defs>

      {/* Background Rings */}
      <motion.g
        initial={animate ? { opacity: 0 } : undefined}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
      >
        <circle cx="100" cy="80" r="55" fill="url(#grad-422)" />
        <circle
          cx="100"
          cy="80"
          r="75"
          fill="none"
          stroke="var(--color-border)"
          strokeWidth="1"
          strokeDasharray="2 6"
        />
      </motion.g>

      {/* The Packet (Isometric Box) */}
      <motion.g
        initial={animate ? { y: -20, opacity: 0 } : undefined}
        animate={{ y: [0, -5, 0], opacity: 1 }}
        transition={{
          y: { duration: 3, repeat: Infinity, ease: "easeInOut" },
          opacity: { duration: 0.5 },
        }}
      >
        {/* Top Face (Valid) */}
        <polygon
          points="100,35 135,50 100,65 65,50"
          fill="var(--color-card)"
          stroke="var(--color-primary)"
          strokeWidth="1.5"
        />

        {/* Left Face (Valid) */}
        <polygon
          points="65,50 100,65 100,105 65,90"
          fill="var(--color-muted)"
          stroke="var(--color-primary)"
          strokeWidth="1.5"
        />

        {/* Right Face (Malformed/Glitching) */}
        <motion.polygon
          points="100,65 135,50 135,90 100,105"
          fill="var(--color-card)"
          stroke="var(--color-destructive)"
          strokeWidth="2"
          strokeDasharray="4 2"
          animate={{ strokeDashoffset: [0, 12] }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />

        {/* Data Lines on Left Face */}
        <line
          x1="75"
          y1="65"
          x2="90"
          y2="72"
          stroke="var(--color-primary)"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.5"
        />
        <line
          x1="75"
          y1="75"
          x2="85"
          y2="80"
          stroke="var(--color-primary)"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.5"
        />
      </motion.g>

      {/* Malformed Energy / Crack */}
      <motion.path
        d="M 110 60 L 125 75 L 115 85 L 130 100"
        fill="none"
        stroke="var(--color-destructive)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#glow-422)"
        initial={animate ? { pathLength: 0 } : undefined}
        animate={{ pathLength: 1 }}
        transition={{ ...PATH_DRAW, delay: 0.4 }}
      />

      {/* Warning Badge */}
      <motion.g
        initial={animate ? { scale: 0, opacity: 0 } : undefined}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", ...SPRING, delay: 0.6 }}
        style={{ transformOrigin: "145px 105px" }}
      >
        <circle
          cx="145"
          cy="105"
          r="14"
          fill="var(--color-card)"
          stroke="var(--color-destructive)"
          strokeWidth="2"
        />
        <line
          x1="145"
          y1="98"
          x2="145"
          y2="106"
          stroke="var(--color-destructive)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx="145" cy="111" r="1.5" fill="var(--color-destructive)" />
      </motion.g>
    </IllustrationWrapper>
  );
}
