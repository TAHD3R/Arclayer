import type { Config } from "tailwindcss";

type PartialConfig = Partial<Config>;

type ThemeExtend = NonNullable<Config["theme"]> extends { extend?: infer E } ? E : never;

function getThemeExtend(theme: Config["theme"] | undefined): ThemeExtend {
  if (!theme || typeof theme !== "object") return {} as ThemeExtend;

  const extend = (theme as { extend?: unknown }).extend;
  if (!extend || typeof extend !== "object") return {} as ThemeExtend;
  return extend as ThemeExtend;
}

function mergeTailwindConfig(base: Config, overrides?: PartialConfig): Config {
  if (!overrides) return base;

  // Keep the merge rules intentionally simple and predictable:
  // - shallow merge for top-level keys
  // - deep merge for theme/extend
  // - concatenate plugins arrays
  const mergedTheme = {
    ...base.theme,
    ...overrides.theme,
    extend: {
      ...getThemeExtend(base.theme),
      ...getThemeExtend(overrides.theme),
    },
  } satisfies Config["theme"];

  return {
    ...base,
    ...overrides,
    theme: mergedTheme,
    plugins: [...(base.plugins ?? []), ...(overrides.plugins ?? [])],
  } satisfies Config;
}

export function createTailwindPreset(overrides?: PartialConfig): Config {
  const base = {
    theme: {
      extend: {
        colors: {
          background: "var(--color-background)",
          foreground: "var(--color-foreground)",
          card: "var(--color-card)",
          "card-foreground": "var(--color-card-foreground)",
          popover: "var(--color-popover)",
          "popover-foreground": "var(--color-popover-foreground)",
          primary: "var(--color-primary)",
          "primary-foreground": "var(--color-primary-foreground)",
          secondary: "var(--color-secondary)",
          "secondary-foreground": "var(--color-secondary-foreground)",
          muted: "var(--color-muted)",
          "muted-foreground": "var(--color-muted-foreground)",
          accent: "var(--color-accent)",
          "accent-foreground": "var(--color-accent-foreground)",
          destructive: "var(--color-destructive)",
          "destructive-foreground": "var(--color-destructive-foreground)",
          border: "var(--color-border)",
          input: "var(--color-input)",
          ring: "var(--color-ring)",
          sidebar: "var(--color-sidebar)",
          "sidebar-foreground": "var(--color-sidebar-foreground)",
          "sidebar-primary": "var(--color-sidebar-primary)",
          "sidebar-primary-foreground": "var(--color-sidebar-primary-foreground)",
          "sidebar-accent": "var(--color-sidebar-accent)",
          "sidebar-accent-foreground": "var(--color-sidebar-accent-foreground)",
          "sidebar-border": "var(--color-sidebar-border)",
          "sidebar-ring": "var(--color-sidebar-ring)",
          "label-primary": "var(--color-label-primary)",
          "label-secondary": "var(--color-label-secondary)",
          "label-tertiary": "var(--color-label-tertiary)",
          "label-quaternary": "var(--color-label-quaternary)",
          "chart-1": "var(--color-chart-1)",
          "chart-2": "var(--color-chart-2)",
          "chart-3": "var(--color-chart-3)",
          "chart-4": "var(--color-chart-4)",
          "chart-5": "var(--color-chart-5)",
        },
        borderRadius: {
          xl: "var(--radius-xl)",
          lg: "var(--radius-lg)",
          md: "var(--radius-md)",
          sm: "var(--radius-sm)",
        },
        fontFamily: {
          sans: "var(--font-sans)",
          mono: "var(--font-mono)",
          serif: "var(--font-serif)",
        },
        boxShadow: {
          "2xs": "var(--shadow-2xs)",
          xs: "var(--shadow-xs)",
          sm: "var(--shadow-sm)",
          DEFAULT: "var(--shadow)",
          md: "var(--shadow-md)",
          lg: "var(--shadow-lg)",
          xl: "var(--shadow-xl)",
          "2xl": "var(--shadow-2xl)",
        },
      },
    },
    plugins: [],
  } satisfies Config;

  return mergeTailwindConfig(base, overrides);
}

const preset = createTailwindPreset();
export default preset;
