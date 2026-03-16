"use client";

import type { Transition, Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@arclayer/lib/utils";

export interface MenuIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface MenuIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const LINE_TRANSITION: Transition = {
  duration: 0.32,
  ease: [0.22, 1, 0.36, 1],
};

const LINE_VARIANTS: Variants = {
  normal: (custom: number) => ({
    x1: 4,
    x2: 20,
    y1: custom,
    y2: custom,
  }),
  // Keep the icon semantically a hamburger: only choreograph line lengths/offsets.
  animate: (custom: number) => {
    if (custom === 6) {
      return {
        x1: [4, 6, 4],
        x2: [20, 20, 20],
        y1: [6, 6.5, 6],
        y2: [6, 6.5, 6],
        transition: LINE_TRANSITION,
      };
    }

    if (custom === 12) {
      return {
        x1: [4, 8, 4],
        x2: [20, 16, 20],
        y1: [12, 12, 12],
        y2: [12, 12, 12],
        transition: LINE_TRANSITION,
      };
    }

    return {
      x1: [4, 6, 4],
      x2: [20, 18, 20],
      y1: [18, 17.5, 18],
      y2: [18, 17.5, 18],
      transition: LINE_TRANSITION,
    };
  },
};

const MenuIcon = forwardRef<MenuIconHandle, MenuIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
    const controls = useAnimation();
    const isControlledRef = useRef(false);

    useImperativeHandle(ref, () => {
      isControlledRef.current = true;

      return {
        startAnimation: () => controls.start("animate"),
        stopAnimation: () => controls.start("normal"),
      };
    });

    const handleMouseEnter = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseEnter?.(e);
        } else {
          controls.start("animate");
        }
      },
      [controls, onMouseEnter],
    );

    const handleMouseLeave = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseLeave?.(e);
        } else {
          controls.start("normal");
        }
      },
      [controls, onMouseLeave],
    );
    return (
      <div
        className={cn(className)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        <svg
          fill="none"
          height={size}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <motion.line
            animate={controls}
            custom={6}
            variants={LINE_VARIANTS}
            x1="4"
            x2="20"
            y1="6"
            y2="6"
          />
          <motion.line
            animate={controls}
            custom={12}
            variants={LINE_VARIANTS}
            x1="4"
            x2="20"
            y1="12"
            y2="12"
          />
          <motion.line
            animate={controls}
            custom={18}
            variants={LINE_VARIANTS}
            x1="4"
            x2="20"
            y1="18"
            y2="18"
          />
        </svg>
      </div>
    );
  },
);

MenuIcon.displayName = "MenuIcon";

export { MenuIcon };
