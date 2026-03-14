"use client";

import * as React from "react";
import type { VariantProps } from "class-variance-authority";

import { cn } from "@celestial/lib/utils";

import { Button as ButtonPrimitive } from "./button-primitive";
import { buttonVariants } from "./button-variants";

type NativeButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onDrag">;

type ButtonProps = NativeButtonProps &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    className?: string;
    hoverScale?: number;
    tapScale?: number;
  };

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = "default",
    size = "default",
    hoverScale = 1.02,
    tapScale = 0.98,
    ...props
  },
  ref,
) {
  const Primitive = ButtonPrimitive as React.ComponentType<Record<string, unknown>>;

  return (
    <Primitive
      ref={ref}
      data-slot="button"
      data-variant={variant ?? undefined}
      data-size={size ?? undefined}
      className={cn(buttonVariants({ variant, size }), className)}
      hoverScale={hoverScale}
      tapScale={tapScale}
      {...(props as Record<string, unknown>)}
    />
  );
});

Button.displayName = "Button";

export { Button, buttonVariants, type ButtonProps };
