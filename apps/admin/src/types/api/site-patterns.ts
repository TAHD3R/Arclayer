import type { PageBlueprintFragment } from "@celestial/block-protocol";

export type SitePattern = {
  id: string;
  siteId: string;
  code: string;
  label: Record<string, string>;
  category: string;
  previewImageUrl?: string | null;
  pageBlueprintFragment: PageBlueprintFragment;
  createdAtMs: number;
};

export type SitePatternCreateIn = {
  code: string;
  label: Record<string, string>;
  category?: string;
  previewImageUrl?: string | null;
  pageBlueprintFragment: PageBlueprintFragment;
};

// Backend `SitePatternUpdateIn` does NOT accept `code` (extra="forbid").
export type SitePatternUpdateIn = Partial<Omit<SitePatternCreateIn, "code">>;
