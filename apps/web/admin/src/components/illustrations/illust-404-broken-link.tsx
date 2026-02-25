import { motion } from "motion/react";

import { IllustrationWrapper } from "./illustration-wrapper";
import type { IllustrationProps } from "./types";
import { SPRING, TWEEN, useIllustrationAnimation } from "./use-illustration-animation";

/**
 * 404 "Broken Link" illustration.
 * Two nodes connected by a dashed line that is broken in the middle,
 * with a floating question mark above the break point.
 */
export function Illust404BrokenLink(props: IllustrationProps) {
  const { animate } = useIllustrationAnimation();

  return (
    <IllustrationWrapper {...props}>
      {/* --- Left node --- */}
      <motion.g
        initial={animate ? { x: -20, opacity: 0 } : undefined}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: "spring", ...SPRING, delay: 0 }}
      >
        <rect
          x="35"
          y="57"
          width="36"
          height="36"
          rx="6"
          fill="hsl(var(--card))"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <circle cx="53" cy="75" r="4" fill="hsl(var(--primary))" />
      </motion.g>

      {/* --- Right node --- */}
      <motion.g
        initial={animate ? { x: 20, opacity: 0 } : undefined}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: "spring", ...SPRING, delay: 0.1 }}
      >
        <rect
          x="130"
          y="57"
          width="36"
          height="36"
          rx="6"
          fill="hsl(var(--card))"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <circle cx="148" cy="75" r="4" fill="hsl(var(--primary))" />
      </motion.g>

      {/* --- Left dashed segment (node → break) --- */}
      <motion.line
        x1="71"
        y1="75"
        x2="88"
        y2="75"
        stroke="hsl(var(--border))"
        strokeWidth="2"
        strokeDasharray="4 3"
        strokeLinecap="round"
        initial={animate ? { opacity: 0 } : undefined}
        animate={{ opacity: 1 }}
        transition={{ ...TWEEN, delay: 0.2 }}
      />

      {/* --- Right dashed segment (break → node) --- */}
      <motion.line
        x1="113"
        y1="75"
        x2="130"
        y2="75"
        stroke="hsl(var(--border))"
        strokeWidth="2"
        strokeDasharray="4 3"
        strokeLinecap="round"
        initial={animate ? { opacity: 0 } : undefined}
        animate={{ opacity: 1 }}
        transition={{ ...TWEEN, delay: 0.2 }}
      />

      {/* --- Break-point snap marks --- */}
      <motion.g
        initial={animate ? { opacity: 0 } : undefined}
        animate={{ opacity: 1 }}
        transition={{ ...TWEEN, delay: 0.3 }}
      >
        {/* Left snap */}
        <line
          x1="89"
          y1="70"
          x2="93"
          y2="80"
          stroke="hsl(var(--destructive))"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <line
          x1="93"
          y1="70"
          x2="89"
          y2="80"
          stroke="hsl(var(--destructive))"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        {/* Right snap */}
        <line
          x1="108"
          y1="70"
          x2="112"
          y2="80"
          stroke="hsl(var(--destructive))"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <line
          x1="112"
          y1="70"
          x2="108"
          y2="80"
          stroke="hsl(var(--destructive))"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </motion.g>

      {/* --- Question mark --- */}
      <motion.text
        x="100"
        y="48"
        textAnchor="middle"
        dominantBaseline="central"
        fill="hsl(var(--primary))"
        fontSize="22"
        fontWeight="700"
        initial={animate ? { scale: 0, opacity: 0 } : undefined}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", ...SPRING, delay: 0.4 }}
      >
        ?
      </motion.text>

      {/* --- Decorative dots --- */}
      <motion.g
        initial={animate ? { opacity: 0 } : undefined}
        animate={{ opacity: 0.35 }}
        transition={{ ...TWEEN, delay: 0.3 }}
      >
        <circle cx="25" cy="50" r="1.5" fill="hsl(var(--muted))" />
        <circle cx="175" cy="55" r="1.5" fill="hsl(var(--muted))" />
        <circle cx="60" cy="110" r="1.5" fill="hsl(var(--muted))" />
        <circle cx="140" cy="108" r="1.5" fill="hsl(var(--muted))" />
        <circle cx="100" cy="120" r="2" fill="hsl(var(--muted))" />
        <circle cx="30" cy="95" r="1" fill="hsl(var(--muted))" />
        <circle cx="170" cy="98" r="1" fill="hsl(var(--muted))" />
      </motion.g>
    </IllustrationWrapper>
  );
}
