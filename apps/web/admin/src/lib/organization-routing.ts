export function parseOrganizationIdFromPath(pathname: string): string | null {
  const matched = /^\/o\/([^/]+)/.exec(pathname || "");
  if (!matched?.[1]) return null;
  return decodeURIComponent(matched[1]);
}

export function organizationScopeBasePath(organizationId: string): string {
  return `/o/${encodeURIComponent(String(organizationId))}`;
}

export function buildOrganizationPath(organizationId: string, subPath = ""): string {
  const base = organizationScopeBasePath(organizationId);
  const normalized = String(subPath || "").trim();

  if (!normalized || normalized === "/") return base;
  if (normalized.startsWith("/")) return `${base}${normalized}`;
  return `${base}/${normalized}`;
}
