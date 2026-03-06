import { useEffect, useState, type CSSProperties } from "react";
import { motion } from "motion/react";

import { cn } from "@celestial/lib/utils";

interface LightRaysProps extends React.HTMLAttributes<HTMLDivElement> {
  ref?: React.Ref<HTMLDivElement>;
  count?: number;
  color?: string;
  blur?: number;
  speed?: number;
  length?: string;
}

type LightRay = {
  id: string;
  left: number;
  rotate: number;
  width: number;
  swing: number;
  delay: number;
  duration: number;
  intensity: number;
};

const MIN_LEFT_PERCENT = 6;
const LEFT_SPREAD_PERCENT = 48;
const BASE_ROTATE_DEG = -24;
const ROTATE_SPREAD_DEG = 18;
const MIN_RAY_WIDTH_PX = 140;
const RAY_WIDTH_SPREAD_PX = 90;
const MIN_SWING_DEG = 0.35;
const SWING_SPREAD_DEG = 0.65;
const MIN_INTENSITY = 0.14;
const INTENSITY_SPREAD = 0.12;

const createRays = (count: number, cycle: number): LightRay[] => {
  if (count <= 0) return [];

  return Array.from({ length: count }, (_, index) => {
    const left = MIN_LEFT_PERCENT + Math.random() * LEFT_SPREAD_PERCENT;
    const rotate = BASE_ROTATE_DEG + Math.random() * ROTATE_SPREAD_DEG;
    const width = MIN_RAY_WIDTH_PX + Math.random() * RAY_WIDTH_SPREAD_PX;
    const swing = MIN_SWING_DEG + Math.random() * SWING_SPREAD_DEG;
    const delay = Math.random() * cycle;
    const duration = cycle * (0.9 + Math.random() * 0.25);
    const intensity = MIN_INTENSITY + Math.random() * INTENSITY_SPREAD;

    return {
      id: `${index}-${Math.round(left * 10)}`,
      left,
      rotate,
      width,
      swing,
      delay,
      duration,
      intensity,
    };
  });
};

const Ray = ({ left, rotate, width, swing, delay, duration, intensity }: LightRay) => {
  return (
    <motion.div
      className="pointer-events-none absolute -top-[10%] left-[var(--ray-left)] h-[var(--light-rays-length)] w-[var(--ray-width)] origin-top-left -translate-x-1/2 rounded-full bg-gradient-to-b from-[color-mix(in_srgb,var(--light-rays-color)_42%,transparent)] via-[color-mix(in_srgb,var(--light-rays-color)_16%,transparent)] to-transparent opacity-0 mix-blend-screen blur-[var(--light-rays-blur)]"
      style={
        {
          "--ray-left": `${left}%`,
          "--ray-width": `${width}px`,
        } as CSSProperties
      }
      initial={{ rotate: rotate }}
      animate={{
        opacity: [0, intensity, 0],
        rotate: [rotate - swing, rotate + swing, rotate - swing],
      }}
      transition={{
        duration: duration,
        repeat: Infinity,
        ease: "easeInOut",
        delay: delay,
        repeatDelay: duration * 0.1,
      }}
    />
  );
};

export function LightRays({
  className,
  style,
  count = 5,
  color = "rgba(160, 210, 255, 0.12)",
  blur = 44,
  speed = 18,
  length = "70vh",
  ref,
  ...props
}: LightRaysProps) {
  const [rays, setRays] = useState<LightRay[]>([]);
  const cycleDuration = Math.max(speed, 0.1);

  useEffect(() => {
    setRays(createRays(count, cycleDuration));
  }, [count, cycleDuration]);

  return (
    <div
      ref={ref}
      className={cn(
        "pointer-events-none absolute inset-0 isolate overflow-hidden rounded-[inherit]",
        className,
      )}
      style={
        {
          "--light-rays-color": color,
          "--light-rays-blur": `${blur}px`,
          "--light-rays-length": length,
          ...style,
        } as CSSProperties
      }
      {...props}
    >
      <div className="absolute inset-0 overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 opacity-65"
          style={
            {
              background:
                "radial-gradient(circle at 14% 10%, color-mix(in srgb, var(--light-rays-color) 38%, transparent), transparent 62%)",
            } as CSSProperties
          }
        />
        <div
          aria-hidden
          className="absolute inset-0 opacity-35"
          style={
            {
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--light-rays-color) 12%, transparent) 0%, transparent 42%)",
            } as CSSProperties
          }
        />
        {rays.map((ray) => (
          <Ray key={ray.id} {...ray} />
        ))}
      </div>
    </div>
  );
}
