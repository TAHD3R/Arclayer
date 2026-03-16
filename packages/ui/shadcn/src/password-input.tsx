"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { cn } from "@arclayer/lib/utils";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "./input-group";

type PasswordInputProps = Omit<React.ComponentProps<"input">, "type"> & {
  startIcon?: React.ReactNode;
  inputClassName?: string;
};

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  { className, inputClassName, startIcon, disabled, ...props },
  ref,
) {
  const [visible, setVisible] = React.useState(false);

  return (
    <InputGroup className={className} data-disabled={disabled ? true : undefined}>
      {startIcon ? <InputGroupAddon>{startIcon}</InputGroupAddon> : null}
      <InputGroupInput
        ref={ref}
        type={visible ? "text" : "password"}
        className={cn("min-w-0", inputClassName)}
        disabled={disabled}
        {...props}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
          disabled={disabled}
        >
          {visible ? <EyeOff /> : <Eye />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
});

PasswordInput.displayName = "PasswordInput";

export { PasswordInput, type PasswordInputProps };
