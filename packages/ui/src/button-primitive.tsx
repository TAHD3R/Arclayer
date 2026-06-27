"use client";

import * as React from "react";
import { motion, type HTMLMotionProps } from "motion/react";

import { Slot, type WithAsChild } from "@arclayer/ui/animate-slot";

type ButtonProps = WithAsChild<
  HTMLMotionProps<"button"> & {
    tapScale?: number;
  }
>;

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { tapScale = 0.95, asChild = false, ...props },
  ref,
) {
  const Component = asChild ? Slot : motion.button;
  const tapProps = tapScale === 1 ? undefined : { whileTap: { scale: tapScale } };

  return <Component ref={ref} {...tapProps} {...props} />;
});
Button.displayName = "ButtonPrimitive";

export { Button, type ButtonProps };
