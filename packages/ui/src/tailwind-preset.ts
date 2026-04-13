import type { Config } from "tailwindcss";

type PartialConfig = Partial<Config>;

type ThemeExtend = NonNullable<Config["theme"]> extends { extend?: infer E } ? E : never;

function withColorToken(variableName: string): string {
  return `var(${variableName})`;
}

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
          background: withColorToken("--color-background"),
          foreground: withColorToken("--color-foreground"),
          card: withColorToken("--color-card"),
          "card-foreground": withColorToken("--color-card-foreground"),
          popover: withColorToken("--color-popover"),
          "popover-foreground": withColorToken("--color-popover-foreground"),
          primary: withColorToken("--color-primary"),
          "primary-hover": withColorToken("--color-primary-hover"),
          "primary-selected": withColorToken("--color-primary-selected"),
          "primary-selected-hover": withColorToken("--color-primary-selected-hover"),
          "primary-highlighted": withColorToken("--color-primary-highlighted"),
          "primary-surface": withColorToken("--color-primary-surface"),
          "primary-foreground": withColorToken("--color-primary-foreground"),
          secondary: withColorToken("--color-secondary"),
          "secondary-foreground": withColorToken("--color-secondary-foreground"),
          muted: withColorToken("--color-muted"),
          "muted-foreground": withColorToken("--color-muted-foreground"),
          accent: withColorToken("--color-accent"),
          "accent-foreground": withColorToken("--color-accent-foreground"),
          destructive: withColorToken("--color-destructive"),
          "destructive-foreground": withColorToken("--color-destructive-foreground"),
          negative: withColorToken("--color-negative"),
          "negative-foreground": withColorToken("--color-negative-foreground"),
          positive: withColorToken("--color-positive"),
          "positive-foreground": withColorToken("--color-positive-foreground"),
          success: withColorToken("--color-success"),
          "success-foreground": withColorToken("--color-success-foreground"),
          warning: withColorToken("--color-warning"),
          "warning-foreground": withColorToken("--color-warning-foreground"),
          border: withColorToken("--color-border"),
          input: withColorToken("--color-input"),
          "ui-border": withColorToken("--color-ui-border"),
          "layout-border": withColorToken("--color-layout-border"),
          ring: withColorToken("--color-ring"),
          link: withColorToken("--color-link"),
          sidebar: withColorToken("--color-sidebar"),
          "sidebar-foreground": withColorToken("--color-sidebar-foreground"),
          "sidebar-primary": withColorToken("--color-sidebar-primary"),
          "sidebar-primary-foreground": withColorToken("--color-sidebar-primary-foreground"),
          "sidebar-accent": withColorToken("--color-sidebar-accent"),
          "sidebar-accent-foreground": withColorToken("--color-sidebar-accent-foreground"),
          "sidebar-border": withColorToken("--color-sidebar-border"),
          "sidebar-ring": withColorToken("--color-sidebar-ring"),
          header: withColorToken("--color-header"),
          "header-foreground": withColorToken("--color-header-foreground"),
          "label-primary": withColorToken("--color-label-primary"),
          "label-secondary": withColorToken("--color-label-secondary"),
          "label-tertiary": withColorToken("--color-label-tertiary"),
          "label-quaternary": withColorToken("--color-label-quaternary"),
          "chart-1": withColorToken("--color-chart-1"),
          "chart-2": withColorToken("--color-chart-2"),
          "chart-3": withColorToken("--color-chart-3"),
          "chart-4": withColorToken("--color-chart-4"),
          "chart-5": withColorToken("--color-chart-5"),
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
