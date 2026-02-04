import { normalizePathname } from "./portal-route-resolver";

export function getTokenFromSearch(
  search: string | URLSearchParams | null | undefined,
): string | undefined {
  if (!search) return undefined;
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const token = params.get("token")?.trim() ?? "";
  return token ? token : undefined;
}

export function buildPreviewHref(pathnameRaw: string, token: string | undefined): string {
  const pathname = normalizePathname(pathnameRaw);
  const base = pathname === "/" ? "/preview" : "/preview" + pathname;
  if (!token) return base;

  const url = new URL(base, "http://localhost");
  url.searchParams.set("token", token);
  return url.pathname + url.search;
}
