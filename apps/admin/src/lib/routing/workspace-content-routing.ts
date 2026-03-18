function safeReturnTo(value: string | null | undefined): string | null {
  const raw = (value || "").trim();
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

function getCurrentReturnTo(): string | null {
  if (typeof window === "undefined") return null;
  return safeReturnTo(
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
  );
}

export function workspaceContentLibraryPath(workspaceId: string): string {
  return `/w/${encodeURIComponent(workspaceId)}/content/library`;
}

export function workspaceContentCreatePath(workspaceId: string): string {
  return `/w/${encodeURIComponent(workspaceId)}/content/create`;
}

export function buildWorkspaceContentEditorUrl(params: {
  siteId: string;
  itemId: string;
  token: string;
  returnTo?: string | null;
}): string {
  const url = new URL(`/editor/site/${encodeURIComponent(params.siteId)}`, window.location.origin);
  url.searchParams.set("token", params.token);
  url.searchParams.set("source", "admin");
  url.searchParams.set("itemId", params.itemId);

  const returnTo = safeReturnTo(params.returnTo) ?? getCurrentReturnTo();
  if (returnTo) url.searchParams.set("returnTo", returnTo);

  return `${url.pathname}${url.search}`;
}
