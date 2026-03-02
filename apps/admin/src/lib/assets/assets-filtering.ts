export type ExplicitAssetsFilteringInput = {
  searchQuery?: string;
  mimePrefix?: string;
  visibility?: string;
  createdFrom?: string;
  createdTo?: string;
  tagIds?: string[];
};

/**
 * Whether the user is explicitly filtering/searching assets.
 *
 * This is used for:
 * - Hiding empty folders only when filters are applied (avoid "new folder disappears").
 * - Choosing the correct empty-state semantics ("no assets" vs "no search results").
 */
export function isExplicitAssetsFilterActive(input: ExplicitAssetsFilteringInput): boolean {
  const hasSearch = Boolean(input.searchQuery?.trim());
  if (hasSearch) return true;

  if (input.mimePrefix) return true;
  if ((input.tagIds?.length ?? 0) > 0) return true;
  if (input.createdFrom || input.createdTo) return true;

  const visibility = (input.visibility || "").trim().toLowerCase();
  // Default visibility in this view is "public"; we treat it as non-explicit.
  if (visibility && visibility !== "public") return true;

  return false;
}
