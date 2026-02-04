export type PortalMode = "public" | "preview";

export type PortalResolveMode = PortalMode;

export type PortalSiteContext = {
  siteId: string;
  defaultLocale: "zh-CN" | "en-US";
  fallbackLocale: "zh-CN" | "en-US";
};

export type PortalRouteMatch = {
  kind: "page" | "route_template" | "redirect" | "not_found";
  params: Record<string, string>;
  redirectTo: string | null;
  redirectStatus: 301 | 302 | null;
  pageId: string | null;
  entryId: string | null;
  variantId: string | null;
  revision: number | null;
  revisionState: "draft" | "published" | null;
  draftRevision: number | null;
  publishedRevision: number | null;
};

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
