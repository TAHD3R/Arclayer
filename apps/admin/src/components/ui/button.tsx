import * as React from "react";

import {
  Button as SharedButton,
  buttonVariants,
  type ButtonProps as SharedButtonProps,
} from "@arclayer/ui/button";

export type ButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  asChild?: boolean;
  className?: string;
  children?: React.ReactNode;
  tapScale?: number;
  loading?: boolean;
  variant?: SharedButtonProps["variant"];
  size?: SharedButtonProps["size"];
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(props, ref) {
  return <SharedButton ref={ref} {...(props as SharedButtonProps)} />;
});

Button.displayName = "Button";

export { Button, buttonVariants };
