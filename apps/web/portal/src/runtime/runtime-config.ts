export interface PortalRuntimeConfig {
  theme: {
    cssVars: Record<string, string>;
  };
  fonts?: Array<{
    family: string;
    display?: "auto" | "block" | "swap" | "fallback" | "optional";
    sources: Array<{
      url: string;
      format?: "woff2" | "woff" | "truetype" | "opentype";
      weight?: string;
      style?: "normal" | "italic" | "oblique";
    }>;
  }>;
}

/**
 * Sprint 1: hardcode runtime config to validate SSR head injection.
 * Future: fetch from API, domain resolver, or preview token.
 */
export function getPortalRuntimeConfig(): PortalRuntimeConfig {
  return {
    theme: {
      cssVars: {
        "--color-primary": "#1677ff",
        "--color-background": "#ffffff",
        "--color-foreground": "#111827",
        "--color-border": "rgba(17, 24, 39, 0.12)",
        "--font-sans": "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
      },
    },
    // Sprint 1: empty by default (no bundled font files in repo).
    // To validate self-hosted font injection:
    // - add a .woff2 file under apps/web/portal/public/fonts/
    // - then add a font entry here and include the family in --font-sans
    fonts: [],
  };
}
