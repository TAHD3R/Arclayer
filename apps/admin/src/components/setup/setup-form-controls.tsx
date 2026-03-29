import * as React from "react";

import { cn } from "@arclayer/lib/utils";
import { AuthInputControl, AuthPasswordControl } from "@arclayer/ui/auth-controls";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { Textarea } from "@arclayer/ui/textarea";

type SetupFieldShellProps = {
  label?: React.ReactNode;
  description?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
  className?: string;
};

export function SetupFieldShell({
  label,
  description,
  error,
  children,
  className,
}: SetupFieldShellProps) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      {label ? <label className="text-body font-medium text-label-primary">{label}</label> : null}
      {description ? <div className="text-callout text-label-secondary">{description}</div> : null}
      {children}
      {error ? <p className="text-footnote text-destructive">{error}</p> : null}
    </div>
  );
}

export const SetupInputControl = AuthInputControl;
export const SetupPasswordControl = AuthPasswordControl;

type SetupSelectControlProps = {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
};

export function SetupSelectControl({
  value,
  options,
  onChange,
  disabled,
  className,
  placeholder,
}: SetupSelectControlProps) {
  return (
    <Select value={value} disabled={disabled} onValueChange={onChange}>
      <SelectTrigger className={cn("w-full", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export const SetupTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<typeof Textarea>
>(function SetupTextarea({ className, ...props }, ref) {
  return <Textarea ref={ref} className={cn("min-h-28", className)} {...props} />;
});
