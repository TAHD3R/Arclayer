"use client";

import type { ForwardRefExoticComponent, MouseEvent, RefAttributes } from "react";
import { forwardRef, useMemo } from "react";
import { motion } from "motion/react";
import type { LucideIcon as BaseLucideIcon, LucideProps } from "lucide-react";

import { useMediaPrefersReducedMotion } from "@arclayer/hooks/use-media-prefers-reduced-motion";
import { useIconHoverState } from "./use-icon-hover-state";

export type AnimatedLucideProps = LucideProps & {
  isHovered?: boolean;
  active?: boolean;
  expanded?: boolean;
  loop?: boolean;
};

export type AnimationPreset =
  | "lift"
  | "nudge-left"
  | "nudge-right"
  | "nudge-down"
  | "pop"
  | "pulse"
  | "wiggle"
  | "spin"
  | "chevron-down"
  | "chevron-right";

export type LucideIcon = ForwardRefExoticComponent<
  AnimatedLucideProps & RefAttributes<SVGSVGElement>
>;

const EASE = [0.22, 1, 0.36, 1] as const;

function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  if (!ref) return;
  (ref as React.MutableRefObject<T | null>).current = value;
}

function buildAnimation(
  preset: AnimationPreset,
  state: {
    emphasized: boolean;
    expanded: boolean;
    loop: boolean;
  },
) {
  const repeat = state.loop ? Infinity : 0;

  switch (preset) {
    case "nudge-left":
      return {
        animate: state.emphasized ? { x: [0, -1.75, 0] } : { x: 0 },
        transition: { duration: 0.42, ease: EASE, repeat },
      };
    case "nudge-right":
      return {
        animate: state.emphasized ? { x: [0, 1.75, 0] } : { x: 0 },
        transition: { duration: 0.42, ease: EASE, repeat },
      };
    case "nudge-down":
      return {
        animate: state.emphasized ? { y: [0, 1.75, 0] } : { y: 0 },
        transition: { duration: 0.42, ease: EASE, repeat },
      };
    case "pop":
      return {
        animate: state.emphasized ? { scale: [1, 1.08, 1], y: [0, -1, 0] } : { scale: 1, y: 0 },
        transition: { duration: 0.45, ease: EASE, repeat },
      };
    case "pulse":
      return {
        animate: state.emphasized ? { scale: [1, 1.08, 1] } : { scale: 1 },
        transition: { duration: 0.4, ease: EASE, repeat },
      };
    case "wiggle":
      return {
        animate: state.emphasized ? { rotate: [0, -10, 10, -6, 6, 0] } : { rotate: 0 },
        transition: { duration: 0.6, ease: EASE, repeat },
        style: { transformOrigin: "50% 50%" },
      };
    case "spin":
      return {
        animate: state.emphasized ? { rotate: [0, 20, -14, 0] } : { rotate: 0 },
        transition: { duration: state.emphasized ? 0.48 : 0.08, ease: EASE, repeat },
        style: { transformOrigin: "50% 50%" },
      };
    case "chevron-down": {
      const rotate = state.expanded ? 180 : 0;
      return {
        animate: state.emphasized ? { rotate, y: [0, 1.75, 0] } : { rotate, y: 0 },
        transition: {
          rotate: { duration: 0.18, ease: EASE },
          y: { duration: state.emphasized ? 0.42 : 0.08, ease: EASE, repeat },
        },
        style: { transformOrigin: "50% 50%" },
      };
    }
    case "chevron-right": {
      const rotate = state.expanded ? 90 : 0;
      return {
        animate: state.emphasized ? { rotate, x: [0, 1.75, 0] } : { rotate, x: 0 },
        transition: {
          rotate: { duration: 0.18, ease: EASE },
          x: { duration: state.emphasized ? 0.42 : 0.08, ease: EASE, repeat },
        },
        style: { transformOrigin: "50% 50%" },
      };
    }
    case "lift":
    default:
      return {
        animate: state.emphasized ? { y: [0, -1, 0], scale: [1, 1.04, 1] } : { y: 0, scale: 1 },
        transition: { duration: 0.4, ease: EASE, repeat },
      };
  }
}

export function createAnimatedLucideIcon(
  Icon: BaseLucideIcon,
  preset: AnimationPreset = "lift",
): LucideIcon {
  const AnimatedIcon = forwardRef<SVGSVGElement, AnimatedLucideProps>(function AnimatedIcon(
    {
      isHovered,
      active = false,
      expanded = false,
      loop = false,
      onMouseEnter,
      onMouseLeave,
      style,
      values: _values,
      ...props
    },
    ref,
  ) {
    const MotionIcon = useMemo(() => motion.create(Icon) as any, []);
    const reducedMotion = useMediaPrefersReducedMotion();
    const hoverState = useIconHoverState(isHovered);
    const hovered = hoverState.hovered;
    const emphasized = !reducedMotion && (loop || hovered || active);
    const animation = buildAnimation(preset, {
      emphasized,
      expanded,
      loop: !reducedMotion && loop,
    });

    return (
      <MotionIcon
        ref={(node: SVGSVGElement | null) => {
          hoverState.ref.current = node;
          assignRef(ref, node);
        }}
        {...props}
        onMouseEnter={(event: MouseEvent<SVGSVGElement>) => {
          hoverState.onMouseEnter();
          onMouseEnter?.(event);
        }}
        onMouseLeave={(event: MouseEvent<SVGSVGElement>) => {
          hoverState.onMouseLeave();
          onMouseLeave?.(event);
        }}
        style={{ ...animation.style, ...style }}
        animate={animation.animate}
        transition={animation.transition}
      />
    );
  });

  AnimatedIcon.displayName = `Animated${Icon.displayName ?? "LucideIcon"}`;
  return AnimatedIcon;
}
