import type { PortalResolveMode, PortalRuntimeConfig } from "@celestial/portal-types";

export async function getPortalRuntimeConfigForSite(
  siteId: string,
  opts: { mode: PortalResolveMode; token?: string; locale?: string },
): Promise<PortalRuntimeConfig> {
  const { fetchRuntimeConfigFromApi } = await import("./site-api");
  const cfg = await fetchRuntimeConfigFromApi(siteId, opts);
  return {
    theme: cfg.theme,
    fonts: cfg.fonts,
    ...(cfg.site ? { site: cfg.site } : {}),
    ...(cfg.siteLocalization ? { siteLocalization: cfg.siteLocalization } : {}),
    ...(cfg.seo ? { seo: cfg.seo } : {}),
  };
}
