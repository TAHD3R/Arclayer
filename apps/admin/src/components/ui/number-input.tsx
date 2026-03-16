import * as React from "react";

import { cn } from "@arclayer/lib/utils";
import { Input } from "@arclayer/ui/input";

type NumberInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "type" | "value" | "defaultValue" | "onChange"
> & {
  value?: number | null;
  defaultValue?: number | null;
  min?: number;
  max?: number;
  step?: number;
  onValueChange?: (next: number | undefined) => void;
};

export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  function NumberInput(
    { className, value, defaultValue, min, max, step, onValueChange, ...props },
    ref,
  ) {
    const handleChange = React.useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        const raw = event.target.value;
        if (!raw.trim()) {
          onValueChange?.(undefined);
          return;
        }

        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) {
          onValueChange?.(undefined);
          return;
        }

        onValueChange?.(parsed);
      },
      [onValueChange],
    );

    const resolvedValue = value ?? undefined;
    const resolvedDefaultValue = defaultValue ?? undefined;

    return (
      <Input
        ref={ref}
        type="number"
        inputMode="decimal"
        className={cn(
          "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          className,
        )}
        value={resolvedValue}
        defaultValue={resolvedDefaultValue}
        min={min}
        max={max}
        step={step}
        onChange={handleChange}
        {...props}
      />
    );
  },
);
