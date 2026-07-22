import { useEffect, useRef, type ComponentProps } from "react";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@arclayer/lib/utils";

const DEFAULT_LABEL = "Loading";
const VIEWBOX_SIZE = 100;
const CURVE_CENTER = VIEWBOX_SIZE / 2;
const BASE_RADIUS = 7;
const DETAIL_AMPLITUDE = 3;
const WEAVE_FREQUENCY = 5;
const CURVE_SCALE = 3.9;
const CURVE_SAMPLE_COUNT = 360;
const PARTICLE_COUNT = 64;
const TRAIL_SPAN = 0.38;
const LOOP_DURATION_MS = 4_600;
const PULSE_DURATION_MS = 4_200;
const ROTATION_DURATION_MS = 28_000;

type CurvePoint = Readonly<{ x: number; y: number }>;
type ParticleFrame = Readonly<CurvePoint & { radius: number; opacity: number }>;
type FrameTargets = Readonly<{
  group: SVGGElement;
  path: SVGPathElement;
  particles: NodeListOf<SVGCircleElement>;
}>;

function normalizeProgress(progress: number): number {
  return ((progress % 1) + 1) % 1;
}

function getPoint(progress: number, detailScale: number): CurvePoint {
  const angle = normalizeProgress(progress) * Math.PI * 2;
  const x =
    BASE_RADIUS * Math.cos(angle) -
    DETAIL_AMPLITUDE * detailScale * Math.cos(WEAVE_FREQUENCY * angle);
  const y =
    BASE_RADIUS * Math.sin(angle) -
    DETAIL_AMPLITUDE * detailScale * Math.sin(WEAVE_FREQUENCY * angle);

  return { x: CURVE_CENTER + x * CURVE_SCALE, y: CURVE_CENTER + y * CURVE_SCALE };
}

function buildPath(detailScale: number): string {
  return Array.from({ length: CURVE_SAMPLE_COUNT + 1 }, (_, index) => {
    const point = getPoint(index / CURVE_SAMPLE_COUNT, detailScale);
    return `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  }).join(" ");
}

function getDetailScale(time: number): number {
  const pulseAngle = ((time % PULSE_DURATION_MS) / PULSE_DURATION_MS) * Math.PI * 2;
  return 0.5 + ((Math.sin(pulseAngle + 0.55) + 1) / 2) * 0.45;
}

function getParticle(index: number, progress: number, detailScale: number): ParticleFrame {
  const tailOffset = index / (PARTICLE_COUNT - 1);
  const point = getPoint(progress - tailOffset * TRAIL_SPAN, detailScale);
  const fade = Math.pow(1 - tailOffset, 0.58);

  return {
    ...point,
    radius: 1.05 + fade * 2.75,
    opacity: 0.08 + fade * 0.92,
  };
}

function renderFrame(targets: FrameTargets, time: number): void {
  const progress = (time % LOOP_DURATION_MS) / LOOP_DURATION_MS;
  const detailScale = getDetailScale(time);
  const rotation = -((time % ROTATION_DURATION_MS) / ROTATION_DURATION_MS) * 360;

  targets.group.setAttribute("transform", `rotate(${rotation} ${CURVE_CENTER} ${CURVE_CENTER})`);
  targets.path.setAttribute("d", buildPath(detailScale));
  targets.particles.forEach((node, index) => {
    const particle = getParticle(index, progress, detailScale);
    node.setAttribute("cx", particle.x.toFixed(2));
    node.setAttribute("cy", particle.y.toFixed(2));
    node.setAttribute("r", particle.radius.toFixed(2));
    node.setAttribute("opacity", particle.opacity.toFixed(3));
  });
}

const STATIC_DETAIL_SCALE = getDetailScale(0);
const STATIC_PATH = buildPath(STATIC_DETAIL_SCALE);
const STATIC_PARTICLES = Array.from({ length: PARTICLE_COUNT }, (_, index) =>
  getParticle(index, 0, STATIC_DETAIL_SCALE),
);

type ArcWeaveLoaderProps = Omit<ComponentProps<"svg">, "aria-label" | "role"> & {
  label?: string;
};

export function ArcWeaveLoader({
  className,
  label = DEFAULT_LABEL,
  ...props
}: ArcWeaveLoaderProps) {
  const reducedMotion = usePrefersReducedMotion();
  const groupRef = useRef<SVGGElement>(null);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) throw new Error("ArcWeaveLoader SVG group is unavailable");

    const path = group.querySelector<SVGPathElement>("[data-arc-weave-path]");
    if (!path) throw new Error("ArcWeaveLoader curve path is unavailable");

    if (reducedMotion) {
      group.setAttribute("transform", `rotate(0 ${CURVE_CENTER} ${CURVE_CENTER})`);
      path.setAttribute("d", STATIC_PATH);
      return;
    }

    const particles = group.querySelectorAll<SVGCircleElement>("[data-arc-weave-particle]");
    if (particles.length !== PARTICLE_COUNT) {
      throw new Error(`ArcWeaveLoader expected ${PARTICLE_COUNT} particles`);
    }

    const targets = { group, path, particles } as const;
    const startedAt = performance.now();
    let animationFrame = 0;

    const tick = (now: number) => {
      renderFrame(targets, now - startedAt);
      animationFrame = window.requestAnimationFrame(tick);
    };

    renderFrame(targets, 0);
    animationFrame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [reducedMotion]);

  return (
    <svg
      {...props}
      role="status"
      aria-live="polite"
      aria-label={label}
      focusable="false"
      viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
      className={cn("size-14 shrink-0 overflow-visible", className)}
    >
      <g ref={groupRef}>
        <path
          data-arc-weave-path
          d={STATIC_PATH}
          fill="none"
          stroke="currentColor"
          strokeWidth={5.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={reducedMotion ? 0.22 : 0.1}
        />
        {reducedMotion
          ? null
          : STATIC_PARTICLES.map((particle, index) => (
              <circle
                key={index}
                data-arc-weave-particle
                cx={particle.x}
                cy={particle.y}
                r={particle.radius}
                fill="currentColor"
                opacity={particle.opacity}
              />
            ))}
      </g>
    </svg>
  );
}
