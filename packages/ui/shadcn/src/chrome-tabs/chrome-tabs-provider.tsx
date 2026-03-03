import { usePrefersReducedMotion } from "@celestial/hooks/use-prefers-reduced-motion";
import { createContext, type ReactNode, useContext } from "react";

export type ChromeTabsLabels = Readonly<{
  scrollLeftAriaLabel: string;
  scrollRightAriaLabel: string;
}>;

export type ChromeTabsProviderProps = Readonly<{
  labels: ChromeTabsLabels;
  userReducedMotion?: boolean;
  children: ReactNode;
}>;

type ChromeTabsConfig = Readonly<{
  labels: ChromeTabsLabels;
  userReducedMotion?: boolean;
}>;

const ChromeTabsConfigContext = createContext<ChromeTabsConfig | null>(null);

function assertNonEmptyText(value: string, field: string): void {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`ChromeTabsProvider: ${field} must be a non-empty string`);
  }
}

export function ChromeTabsProvider({
  labels,
  userReducedMotion,
  children,
}: ChromeTabsProviderProps) {
  assertNonEmptyText(labels.scrollLeftAriaLabel, "labels.scrollLeftAriaLabel");
  assertNonEmptyText(labels.scrollRightAriaLabel, "labels.scrollRightAriaLabel");

  return (
    <ChromeTabsConfigContext.Provider value={{ labels, userReducedMotion }}>
      {children}
    </ChromeTabsConfigContext.Provider>
  );
}

export function useChromeTabsLabels(): ChromeTabsLabels {
  const ctx = useContext(ChromeTabsConfigContext);
  if (!ctx) {
    throw new Error("ChromeTabsProvider is required (missing provider in React tree)");
  }
  return ctx.labels;
}

export function useChromeTabsReducedMotion(): boolean {
  const ctx = useContext(ChromeTabsConfigContext);
  if (!ctx) {
    throw new Error("ChromeTabsProvider is required (missing provider in React tree)");
  }
  return usePrefersReducedMotion({ userReducedMotion: ctx.userReducedMotion });
}
