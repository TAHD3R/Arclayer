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
  startIcon?: React.ReactNode;
};

export const AuthInputControl = React.forwardRef<HTMLInputElement, AuthInputControlProps>(
  function AuthInputControl({ className, startIcon, ...props }, ref) {
    return (
      <InputGroup className={className}>
        {startIcon ? <InputGroupAddon>{startIcon}</InputGroupAddon> : null}
        <InputGroupInput ref={ref} {...props} />
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

export function AuthLinkButton({ className, size = "default", ...props }: AuthLinkButtonProps) {
  return (
    <Button
      variant="link"
      size={size}
      className={cn("h-auto p-0 text-footnote", className)}
      {...props}
    />
  );
}
