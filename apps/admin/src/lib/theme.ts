import type { ThemeMode } from "@arclayer/ui/theme-mode";

import type { ThemePreference } from "@/types/stores";

export function normalizeThemeMode(input: unknown): ThemeMode {
  if (input === "dark" || input === "light") return input;
  return "light";
}

export function normalizeThemePreference(input: unknown): ThemePreference {
  if (input === "system") return "system";
  return normalizeThemeMode(input);
}

export function detectSystemThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
}

export function resolveThemeMode(preference: ThemePreference): ThemeMode {
  if (preference === "system") return detectSystemThemeMode();
  return preference;
}

export function applyThemeModeToDom(mode: ThemeMode): void {
  document.documentElement.dataset.theme = mode;
}
