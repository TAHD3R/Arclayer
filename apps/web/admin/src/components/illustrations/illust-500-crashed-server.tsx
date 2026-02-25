import { motion } from "motion/react";

import { IllustrationWrapper } from "./illustration-wrapper";
import type { IllustrationProps } from "./types";
import { useIllustrationAnimation, TWEEN, PATH_DRAW } from "./use-illustration-animation";

/** Gear cog path: circle with 8 rectangular teeth */
function buildGearPath(cx: number, cy: number, r: number): string {
  const inner = r - 3;
  const outer = r + 3;
  const teeth = 8;
  const segments: string[] = [];

  for (let i = 0; i < teeth; i++) {
    const angle = (i / teeth) * Math.PI * 2;
    const half = (0.3 / teeth) * Math.PI * 2;
    // Outer tooth corners
    const x1 = cx + outer * Math.cos(angle - half);
    const y1 = cy + outer * Math.sin(angle - half);
    const x2 = cx + outer * Math.cos(angle + half);
    const y2 = cy + outer * Math.sin(angle + half);
    // Inner arc endpoints
    const nextAngle = ((i + 1) / teeth) * Math.PI * 2;
    const x3 = cx + inner * Math.cos(nextAngle - half);
    const y3 = cy + inner * Math.sin(nextAngle - half);
    const x4 = cx + inner * Math.cos(angle + half);
    const y4 = cy + inner * Math.sin(angle + half);

    if (i === 0) {
      segments.push(`M ${x1} ${y1}`);
    } else {
      segments.push(`L ${x1} ${y1}`);
    }
    segments.push(`L ${x2} ${y2}`);
    segments.push(`L ${x4} ${y4}`);
    segments.push(`L ${x3} ${y3}`);
  }
  segments.push("Z");
  return segments.join(" ");
}

const GEAR_CX = 148;
const GEAR_CY = 42;
const gearPath = buildGearPath(GEAR_CX, GEAR_CY, 14);

export function Illust500CrashedServer({ className, ariaLabel }: IllustrationProps) {
  const { animate } = useIllustrationAnimation();

  return (
    <IllustrationWrapper className={className} ariaLabel={ariaLabel}>
      {/* --- Server rack body --- */}
      <motion.rect
        x={70}
        y={32}
        width={60}
        height={96}
        rx={6}
        fill="hsl(var(--card))"
        stroke="currentColor"
        strokeWidth={2}
        initial={animate ? { opacity: 0 } : undefined}
        animate={animate ? { opacity: 1 } : undefined}
        transition={{ duration: 0.3 }}
      />

      {/* --- Drive bays --- */}
      {[56, 76, 96].map((y) => (
        <motion.g
          key={y}
          initial={animate ? { opacity: 0 } : undefined}
          animate={animate ? { opacity: 1 } : undefined}
          transition={{ duration: 0.3 }}
        >
          {/* Bay slot */}
          <rect
            x={78}
            y={y}
            width={44}
            height={12}
            rx={2}
            fill="hsl(var(--muted))"
            stroke="hsl(var(--border))"
            strokeWidth={1}
          />
          {/* Status LED */}
          <circle cx={116} cy={y + 6} r={2} fill="hsl(var(--border))" />
        </motion.g>
      ))}

      {/* --- Gear cog --- */}
      <motion.g
        initial={animate ? { rotate: 0 } : undefined}
        animate={animate ? { rotate: 45 } : undefined}
        transition={{ ...TWEEN, delay: 0.2 }}
        style={{ originX: `${GEAR_CX}px`, originY: `${GEAR_CY}px` }}
      >
        <path
          d={gearPath}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        <circle
          cx={GEAR_CX}
          cy={GEAR_CY}
          r={5}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={1.5}
        />
      </motion.g>

      {/* --- Crack / lightning bolt --- */}
      <motion.path
        d="M 92 42 L 97 62 L 90 64 L 96 82 L 89 84 L 95 100"
        fill="none"
        stroke="hsl(var(--destructive))"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={animate ? { pathLength: 0 } : undefined}
        animate={animate ? { pathLength: 1 } : undefined}
        transition={{ ...PATH_DRAW, delay: 0.4 }}
      />

      {/* --- Smoke wisps --- */}
      {[
        { d: "M 90 30 Q 87 22 90 16", delay: 0.6 },
        { d: "M 100 28 Q 103 20 100 12", delay: 0.8 },
        { d: "M 110 30 Q 107 22 110 14", delay: 1.0 },
      ].map(({ d, delay }) => (
        <motion.path
          key={d}
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          initial={animate ? { opacity: 0.6, y: 0 } : undefined}
          animate={animate ? { opacity: 0, y: -8 } : undefined}
          transition={{ duration: 1.5, delay, ease: "easeOut" }}
        />
      ))}
    </IllustrationWrapper>
  );
}
