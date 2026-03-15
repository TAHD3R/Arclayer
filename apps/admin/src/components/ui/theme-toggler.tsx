"use client";

import type * as React from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import type { VariantProps } from "class-variance-authority";

import {
  ThemeToggler as ThemeTogglerPrimitive,
  type ThemeTogglerProps as ThemeTogglerPrimitiveProps,
  type ThemeSelection,
  type Resolved,
} from "@/components/ui/theme-toggler-primitive";
import {
  Button as ButtonPrimitive,
  type ButtonProps as ButtonPrimitiveProps,
} from "@celestial/ui/button-primitive";
import { buttonVariants } from "@celestial/ui/icon-button";
import { cn } from "@celestial/lib/utils";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { setThemePreferenceWithTransition } from "@/components/ui/theme-transition";
import type { ThemePreference } from "@/types/stores";

const getIcon = (effective: ThemeSelection, resolved: Resolved, modes: ThemeSelection[]) => {
  const theme = modes.includes("system") ? effective : resolved;
  return theme === "system" ? <Monitor /> : theme === "dark" ? <Moon /> : <Sun />;
};

const getNextTheme = (effective: ThemeSelection, modes: ThemeSelection[]): ThemeSelection => {
  const i = modes.indexOf(effective);
  if (i === -1) return modes[0];
  return modes[(i + 1) % modes.length];
};

type ThemeTogglerButtonProps = ButtonPrimitiveProps &
  VariantProps<typeof buttonVariants> & {
    modes?: ThemeSelection[];
    onImmediateChange?: ThemeTogglerPrimitiveProps["onImmediateChange"];
    direction?: ThemeTogglerPrimitiveProps["direction"];
  };

function ThemeTogglerButton({
  variant = "default",
  size = "default",
  modes = ["light", "dark", "system"],
  direction = "ltr",
  onImmediateChange,
  onClick,
  className,
  ...props
}: ThemeTogglerButtonProps) {
  const { theme, resolvedTheme, setTheme } = useTheme();

  return (
    <ThemeTogglerPrimitive
      theme={theme as ThemeSelection}
      resolvedTheme={resolvedTheme as Resolved}
      setTheme={setTheme}
      direction={direction}
      onImmediateChange={onImmediateChange}
    >
      {({ effective, resolved, toggleTheme }) => (
        <ButtonPrimitive
          type="button"
          tapScale={1}
          data-slot="theme-toggler-button"
          className={cn(buttonVariants({ variant, size, className }))}
          onClick={(e) => {
            onClick?.(e);
            toggleTheme(getNextTheme(effective, modes));
          }}
          {...props}
        >
          {getIcon(effective, resolved, modes)}
        </ButtonPrimitive>
      )}
    </ThemeTogglerPrimitive>
  );
}

type ThemePreferenceToggleGroupProps = {
  className?: string;
  direction?: ThemeTogglerPrimitiveProps["direction"];
  size?: VariantProps<typeof buttonVariants>["size"];
  labels: { system: string; light: string; dark: string };
};

function ThemePreferenceToggleGroup({
  className,
  direction = "ltr",
  size = "sm",
  labels,
}: ThemePreferenceToggleGroupProps) {
  const themePreference = usePreferencesStore((s) => s.themePreference);

  const items: Array<{ value: ThemePreference; icon: React.ReactNode; label: string }> = [
    { value: "system", icon: <Monitor />, label: labels.system },
    { value: "light", icon: <Sun />, label: labels.light },
    { value: "dark", icon: <Moon />, label: labels.dark },
  ];

  return (
    <div
      role="radiogroup"
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border bg-background p-1",
        className,
      )}
    >
      {items.map((it) => {
        const selected = themePreference === it.value;
        return (
          <ButtonPrimitive
            key={it.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tapScale={1}
            className={cn(
              buttonVariants({
                variant: selected ? "secondary" : "ghost",
                size,
                className: "h-9 w-auto gap-2 px-3",
              }),
            )}
            onClick={() => {
              void setThemePreferenceWithTransition(it.value, { direction });
            }}
          >
            {it.icon}
            <span>{it.label}</span>
          </ButtonPrimitive>
        );
      })}
    </div>
  );
}

export {
  ThemeTogglerButton,
  ThemePreferenceToggleGroup,
  type ThemeTogglerButtonProps,
  type ThemePreferenceToggleGroupProps,
};
