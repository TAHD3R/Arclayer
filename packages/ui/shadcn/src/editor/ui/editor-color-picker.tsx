"use client";

import { CheckIcon, EraserIcon } from "lucide-react";

import { Button } from "@arclayer/ui/button";
import { cn } from "@arclayer/lib/utils";

export type EditorColorPickerOption = {
  active: boolean;
  label: string;
  swatchColor?: string;
  value: string | null;
};

export function EditorColorPicker(props: {
  clearLabel: string;
  onClear: () => void;
  onSelect: (color: string) => void;
  options: readonly EditorColorPickerOption[];
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1.5">
        {props.options.map((option) => {
          const isDefault = option.value === null;

          return (
            <button
              key={option.label}
              type="button"
              aria-label={option.label}
              className={cn(
                "flex h-9 items-center gap-2 rounded-md border px-2.5 text-left text-footnote transition-colors",
                option.active
                  ? "border-primary/60 bg-accent/70 text-label-primary"
                  : "border-border/70 bg-card hover:bg-accent/50 hover:text-label-primary",
              )}
              onClick={() => {
                if (option.value === null) {
                  props.onClear();
                  return;
                }
                props.onSelect(option.value);
              }}
            >
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-sm border",
                  isDefault ? "border-border/70 bg-card" : "border-transparent",
                )}
                style={isDefault ? undefined : { backgroundColor: option.swatchColor }}
              >
                {option.active ? (
                  <CheckIcon
                    className={cn(
                      "size-3",
                      isDefault ? "text-label-primary" : "text-white drop-shadow-sm",
                    )}
                  />
                ) : null}
              </span>
              <span className="truncate">{option.label}</span>
            </button>
          );
        })}
      </div>

      <div className="border-t border-border/70 pt-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start text-label-secondary hover:text-label-primary"
          onClick={props.onClear}
        >
          <EraserIcon className="size-4" />
          {props.clearLabel}
        </Button>
      </div>
    </div>
  );
}
