export type WorkspaceSiteOut = {
  siteId: string;
  workspaceId: string;
  slug: string;
  name: string;
  defaultLocale: string;
  fallbackLocale: string;
  isActive: boolean;
};

export type SitePreviewTokenOut = {
  siteId: string;
  token: string;
  expiresAtMs: number;
};

export type SiteRuntimeFontSourceOut = {
  url: string;
  format: "woff2" | "woff" | "truetype" | "opentype" | null;
  weight: string | null;
  style: "normal" | "italic" | "oblique" | null;
};

export type SiteRuntimeFontOut = {
  family: string;
  display: "auto" | "block" | "swap" | "fallback" | "optional" | null;
  sources: SiteRuntimeFontSourceOut[];
};

export type SiteRuntimeOut = {
  siteId: string;
  mode: "public" | "preview";
  theme: {
    cssVars: Record<string, string>;
    presetId: string | null;
    config: Record<string, unknown> | null;
  };
  fonts: SiteRuntimeFontOut[];
  site?: {
    name?: string | null;
    subtitle?: string | null;
    description?: string | null;
    url?: string | null;
    logoUrl?: string | null;
    faviconUrl?: string | null;
    contactEmail?: string | null;
  } | null;
  siteLocalization?: {
    locale?: string | null;
    supportedLocales?: string[] | null;
    defaultLocale?: string | null;
    fallbackLocale?: string | null;
    timezone?: string | null;
    dateFormat?: string | null;
  } | null;
  seo?: {
    defaultTitle?: string | null;
    defaultDescription?: string | null;
    titlePolicyV1?: Record<string, unknown> | null;
  } | null;
};
