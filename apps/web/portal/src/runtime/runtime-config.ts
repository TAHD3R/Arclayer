export interface PortalRuntimeConfig {
  theme: {
    cssVars: Record<string, string>;
    themeId?: string;
    version?: string;
    tokensCssUrl?: string;
    baseCssUrl?: string;
    presetId?: string;
    config?: Record<string, unknown>;
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

export async function getPortalRuntimeConfigForSite(
  siteId: string,
  opts: { mode: "public" | "preview"; token?: string },
): Promise<PortalRuntimeConfig> {
  const { fetchRuntimeConfigFromApi } = await import("./site-api");
  const cfg = await fetchRuntimeConfigFromApi(siteId, opts);
  return {
    theme: cfg.theme,
    fonts: cfg.fonts,
  };
}
