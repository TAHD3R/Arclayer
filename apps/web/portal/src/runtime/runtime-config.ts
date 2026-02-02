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
 * Default runtime config (used as a deterministic fallback).
 */
function getDefaultPortalRuntimeConfig(): PortalRuntimeConfig {
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

/**
 * Portal is API-first (and API-only for content). Runtime theming should also come from API.
 *
 * We keep a deterministic fallback for resilience (theme tokens only; content still comes from API).
 */
export async function getPortalRuntimeConfig(): Promise<PortalRuntimeConfig> {
  const { fetchRuntimeConfigFromApi, getPortalFallbackSiteId } = await import("./site-api");
  try {
    const siteId = getPortalFallbackSiteId();
    const cfg = await fetchRuntimeConfigFromApi(siteId, { mode: "public" });
    return {
      theme: { cssVars: cfg.theme.cssVars },
      fonts: cfg.fonts,
    };
  } catch {
    return getDefaultPortalRuntimeConfig();
  }
}

export async function getPortalRuntimeConfigForSite(
  siteId: string,
  opts: { mode: "public" | "preview"; token?: string },
): Promise<PortalRuntimeConfig> {
  const { fetchRuntimeConfigFromApi } = await import("./site-api");
  try {
    const cfg = await fetchRuntimeConfigFromApi(siteId, opts);
    return {
      theme: { cssVars: cfg.theme.cssVars },
      fonts: cfg.fonts,
    };
  } catch {
    return getDefaultPortalRuntimeConfig();
  }
}
