export type SitePattern = {
  id: string;
  siteId: string;
  code: string;
  label: Record<string, string>;
  category: string;
  previewImageUrl?: string | null;
  blocks: Array<Record<string, unknown>>;
  createdAtMs: number;
};

export type SitePatternCreateIn = {
  code: string;
  label: Record<string, string>;
  category?: string;
  previewImageUrl?: string | null;
  blocks: Array<Record<string, unknown>>;
};

// Backend `SitePatternUpdateIn` does NOT accept `code` (extra="forbid").
export type SitePatternUpdateIn = Partial<Omit<SitePatternCreateIn, "code">>;
