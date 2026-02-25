import { motion } from "motion/react";

import { IllustrationWrapper } from "./illustration-wrapper";
import type { IllustrationProps } from "./types";
import { useIllustrationAnimation, SPRING, PATH_DRAW } from "./use-illustration-animation";

/**
 * 422 Unprocessable Entity — "Malformed Packet" concept.
 * Document outline + red wavy line + exclamation mark.
 */
export function Illust422MalformedPacket({ className, ariaLabel }: IllustrationProps) {
  const { animate } = useIllustrationAnimation();

  return (
    <IllustrationWrapper className={className} ariaLabel={ariaLabel}>
      {/* Document body */}
      <motion.path
        d="M 60,25 L 120,25 L 140,45 L 140,125 L 60,125 Z"
        fill="hsl(var(--card))"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        initial={animate ? { opacity: 0 } : undefined}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      />

      {/* Folded corner */}
      <motion.path
        d="M 120,25 L 120,45 L 140,45"
        fill="hsl(var(--muted))"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        initial={animate ? { opacity: 0 } : undefined}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      />

      {/* Text lines */}
      <motion.rect
        x={72}
        y={55}
        width={48}
        height={4}
        rx={2}
        fill="hsl(var(--border))"
        initial={animate ? { opacity: 0 } : undefined}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      />
      <motion.rect
        x={72}
        y={65}
        width={56}
        height={4}
        rx={2}
        fill="hsl(var(--border))"
        initial={animate ? { opacity: 0 } : undefined}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      />
      <motion.rect
        x={72}
        y={100}
        width={40}
        height={4}
        rx={2}
        fill="hsl(var(--border))"
        initial={animate ? { opacity: 0 } : undefined}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      />
      <motion.rect
        x={72}
        y={110}
        width={52}
        height={4}
        rx={2}
        fill="hsl(var(--border))"
        initial={animate ? { opacity: 0 } : undefined}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      />

      {/* Red wavy line across the document */}
      <motion.path
        d="M 70,85 Q 78,75 86,85 Q 94,95 102,85 Q 110,75 118,85 Q 126,95 134,85"
        fill="none"
        stroke="hsl(var(--destructive))"
        strokeWidth={2}
        strokeLinecap="round"
        initial={animate ? { pathLength: 0 } : undefined}
        animate={{ pathLength: 1 }}
        transition={{ ...PATH_DRAW, delay: 0.2 }}
      />

      {/* Exclamation mark — vertical line */}
      <motion.line
        x1={158}
        y1={58}
        x2={158}
        y2={82}
        stroke="hsl(var(--destructive))"
        strokeWidth={2}
        strokeLinecap="round"
        initial={animate ? { scale: 0 } : undefined}
        animate={{ scale: 1 }}
        transition={{ ...SPRING, delay: 0.5 }}
        style={{ transformOrigin: "158px 75px" }}
      />

      {/* Exclamation mark — dot */}
      <motion.circle
        cx={158}
        cy={90}
        r={2.5}
        fill="hsl(var(--destructive))"
        initial={animate ? { scale: 0 } : undefined}
        animate={{ scale: 1 }}
        transition={{ ...SPRING, delay: 0.5 }}
        style={{ transformOrigin: "158px 90px" }}
      />
    </IllustrationWrapper>
  );
}
