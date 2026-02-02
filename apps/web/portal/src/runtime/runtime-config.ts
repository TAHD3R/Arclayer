export interface PortalRuntimeConfig {
  theme: {
    cssVars: Record<string, string>;
  };
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
  };
}
