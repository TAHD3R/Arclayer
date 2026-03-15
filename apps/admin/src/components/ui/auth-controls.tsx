import * as React from "react";

import { cn } from "@celestial/lib/utils";
import { Button } from "@celestial/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@celestial/ui/input-group";
import { PasswordInput } from "@celestial/ui/password-input";

type AuthFieldErrorProps = {
  message?: string;
  className?: string;
};

export function AuthFieldError({ message, className }: AuthFieldErrorProps) {
  if (!message) return null;
  return <p className={cn("text-footnote text-destructive", className)}>{message}</p>;
}

type AuthInputControlProps = React.ComponentProps<typeof InputGroupInput> & {
  inputClassName?: string;
  startIcon?: React.ReactNode;
};

export const AuthInputControl = React.forwardRef<HTMLInputElement, AuthInputControlProps>(
  function AuthInputControl({ className, inputClassName, startIcon, ...props }, ref) {
    return (
      <InputGroup className={className}>
        {startIcon ? <InputGroupAddon>{startIcon}</InputGroupAddon> : null}
        <InputGroupInput ref={ref} className={inputClassName} {...props} />
      </InputGroup>
    );
  },
);

type AuthPasswordControlProps = React.ComponentProps<typeof PasswordInput>;

export const AuthPasswordControl = React.forwardRef<HTMLInputElement, AuthPasswordControlProps>(
  function AuthPasswordControl({ className, ...props }, ref) {
    return <PasswordInput ref={ref} className={className} {...props} />;
  },
);

type AuthLinkButtonProps = React.ComponentProps<typeof Button>;

export function AuthLinkButton({ className, size = "inline", ...props }: AuthLinkButtonProps) {
  return (
    <Button
      variant="link"
      size={size}
      className={cn(
        "inline-flex items-baseline gap-0 align-baseline text-footnote leading-normal",
        className,
      )}
      {...props}
    />
  );
}
