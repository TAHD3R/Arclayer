"use client";

import * as React from "react";
import type { VariantProps } from "class-variance-authority";
import type { HTMLMotionProps } from "motion/react";

import { Button as ButtonPrimitive } from "./button-primitive";
import { buttonVariants } from "./button-variants";
import { Spinner } from "./spinner";

const DEFAULT_TAP_SCALE = 0.98;

type NativeButtonProps = Omit<HTMLMotionProps<"button">, "className">;

type ButtonProps = NativeButtonProps &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    className?: string;
    children?: React.ReactNode;
    tapScale?: number;
    loading?: boolean;
  };

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = "default",
    size = "default",
    asChild = false,
    tapScale = DEFAULT_TAP_SCALE,
    loading = false,
    children,
    disabled,
    ...props
  },
  ref,
) {
  const content = loading ? <Spinner className="size-4" /> : children;

  if (asChild) {
    return (
      <ButtonPrimitive
        ref={ref}
        data-slot="button"
        data-variant={variant}
        data-size={size}
        className={buttonVariants({ variant, size, className })}
        asChild
        tapScale={loading ? 1 : tapScale}
        aria-busy={loading || undefined}
        {...props}
      >
        {children as React.ReactElement}
      </ButtonPrimitive>
    );
  }

  return (
    <ButtonPrimitive
      ref={ref}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={buttonVariants({ variant, size, className })}
      tapScale={loading ? 1 : tapScale}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {content}
    </ButtonPrimitive>
  );
});

Button.displayName = "Button";

export { Button, buttonVariants, type ButtonProps };
