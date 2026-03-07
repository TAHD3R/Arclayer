import { normalizeOrigin, resolveAdminOrigin } from "./admin-origin";

export type StudioEntrySource = "admin";

export type StudioEntrySearch = {
  source?: StudioEntrySource;
  returnTo?: string;
};

function safeReturnToPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

export function parseStudioEntrySearch(search: Record<string, unknown>): StudioEntrySearch {
  const source: StudioEntrySource | undefined = search.source === "admin" ? "admin" : undefined;
  const returnTo = safeReturnToPath(search.returnTo);

  return Object.assign({}, source ? { source } : {}, returnTo ? { returnTo } : {});
}

export function buildAdminReturnUrl(returnTo: string | undefined): string | null {
  if (typeof window === "undefined") return null;
  const safeReturnTo = safeReturnToPath(returnTo);
  if (!safeReturnTo) return null;

  const adminOrigin = normalizeOrigin(resolveAdminOrigin(window.location.hostname));
  return `${adminOrigin}${safeReturnTo}`;
}
