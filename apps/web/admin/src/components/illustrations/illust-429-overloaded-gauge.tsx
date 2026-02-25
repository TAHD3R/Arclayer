import { motion } from "motion/react";

import { IllustrationWrapper } from "./illustration-wrapper";
import type { IllustrationProps } from "./types";
import { useIllustrationAnimation, TWEEN, PATH_DRAW } from "./use-illustration-animation";

// Gauge geometry constants
const CX = 100;
const CY = 95;
const R = 50;

// Needle resting angle (safe zone, left) and final angle (danger zone, right)
const NEEDLE_START_DEG = -160; // points left
const NEEDLE_END_DEG = -25; // deep into danger zone

/**
 * Build a semicircle arc path from `startDeg` to `endDeg`.
 * 0° = 3-o'clock, angles go clockwise in SVG default coords.
 */
function arcPath(startDeg: number, endDeg: number): string {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const x1 = CX + R * Math.cos(toRad(startDeg));
  const y1 = CY + R * Math.sin(toRad(startDeg));
  const x2 = CX + R * Math.cos(toRad(endDeg));
  const y2 = CY + R * Math.sin(toRad(endDeg));
  const sweep = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${R} ${R} 0 ${sweep} 1 ${x2} ${y2}`;
}

/** Generate tick mark endpoints along the arc. */
function ticks() {
  const count = 7;
  const startDeg = 180;
  const endDeg = 0;
  const inner = R - 6;
  const outer = R + 1;
  const toRad = (d: number) => (d * Math.PI) / 180;

  return Array.from({ length: count }, (_, i) => {
    const deg = startDeg + ((endDeg - startDeg) * i) / (count - 1);
    const rad = toRad(deg);
    return {
      x1: CX + inner * Math.cos(rad),
      y1: CY + inner * Math.sin(rad),
      x2: CX + outer * Math.cos(rad),
      y2: CY + outer * Math.sin(rad),
    };
  });
}

// Pre-compute arc paths: safe zone (left 70%) and danger zone (right 30%)
const SAFE_ARC = arcPath(180, 180 + 126); // 70% of 180°
const DANGER_ARC = arcPath(180 + 126, 360); // remaining 30%

export function Illust429OverloadedGauge(props: IllustrationProps) {
  const { animate } = useIllustrationAnimation();

  return (
    <IllustrationWrapper {...props}>
      {/* --- Base plate below gauge --- */}
      <rect
        x={86}
        y={97}
        width={28}
        height={10}
        rx={4}
        fill="hsl(var(--muted))"
        stroke="hsl(var(--border))"
        strokeWidth={1.5}
      />

      {/* --- Safe zone arc (left 70%) --- */}
      <motion.path
        d={SAFE_ARC}
        stroke="hsl(var(--primary))"
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
        initial={animate ? { pathLength: 0 } : undefined}
        animate={{ pathLength: 1 }}
        transition={PATH_DRAW}
      />

      {/* --- Danger zone arc (right 30%) --- */}
      <motion.path
        d={DANGER_ARC}
        stroke="hsl(var(--destructive))"
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
        initial={animate ? { pathLength: 0 } : undefined}
        animate={{ pathLength: 1 }}
        transition={{ ...PATH_DRAW, delay: 0.15 }}
      />

      {/* --- Tick marks --- */}
      {ticks().map((t, i) => (
        <line
          key={i}
          x1={t.x1}
          y1={t.y1}
          x2={t.x2}
          y2={t.y2}
          stroke="hsl(var(--border))"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      ))}

      {/* --- Needle --- */}
      <motion.g
        style={{ transformOrigin: `${CX}px ${CY}px` }}
        initial={animate ? { rotate: NEEDLE_START_DEG } : undefined}
        animate={{ rotate: NEEDLE_END_DEG }}
        transition={{ ...TWEEN, delay: 0.3 }}
      >
        <line
          x1={CX}
          y1={CY}
          x2={CX}
          y2={CY - 42}
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
        />
        {/* Needle tip accent */}
        <circle cx={CX} cy={CY - 42} r={2.5} fill="hsl(var(--destructive))" />
      </motion.g>

      {/* --- Pivot dot --- */}
      <circle
        cx={CX}
        cy={CY}
        r={4}
        fill="hsl(var(--card))"
        stroke="currentColor"
        strokeWidth={1.5}
      />

      {/* --- Lightning bolt --- */}
      <motion.g
        initial={animate ? { opacity: 0 } : undefined}
        animate={{ opacity: [0, 1, 0.4, 1] }}
        transition={{ ...TWEEN, delay: 0.6, duration: 0.8 }}
      >
        <path
          d="M97 18 L103 18 L100 26 L105 26 L96 38 L99 29 L94 29 Z"
          fill="hsl(var(--destructive))"
          stroke="hsl(var(--destructive))"
          strokeWidth={0.5}
          strokeLinejoin="round"
        />
      </motion.g>
    </IllustrationWrapper>
  );
}
