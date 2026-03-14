import { resolveStudioOrigin } from "./studio-return";

function normalizeStudioPath(pathname: string): string {
  if (!pathname.startsWith("/")) return `/${pathname}`;
  return pathname;
}

function safeAdminReturnTo(value: string | null | undefined): string | null {
  const raw = (value || "").trim();
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

function getCurrentAdminReturnTo(): string | null {
  if (typeof window === "undefined") return null;
  return safeAdminReturnTo(
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
  );
}

function buildStudioUrl(pathname: string, adminReturnTo?: string | null): string {
  const url = new URL(normalizeStudioPath(pathname), resolveStudioOrigin());
  url.searchParams.set("source", "admin");

  const returnTo = safeAdminReturnTo(adminReturnTo) ?? getCurrentAdminReturnTo();
  if (returnTo) url.searchParams.set("returnTo", returnTo);

  return url.toString();
}

export function buildStudioWorkspaceUrl(
  workspaceId: string,
  opts?: { adminReturnTo?: string | null },
): string {
  return buildStudioUrl(`/w/${encodeURIComponent(workspaceId)}/`, opts?.adminReturnTo);
}

export function buildStudioPresentationEditorUrl(opts: {
  workspaceId: string;
  presentationId: string;
  adminReturnTo?: string | null;
}): string {
  return buildStudioUrl(
    `/w/${encodeURIComponent(opts.workspaceId)}/presentations/${encodeURIComponent(opts.presentationId)}/`,
    opts.adminReturnTo,
  );
}

export function openStudioPresentationEditor(opts: {
  workspaceId: string;
  presentationId: string;
}): void {
  if (typeof window === "undefined") return;
  window.location.assign(buildStudioPresentationEditorUrl(opts));
}

export function buildStudioReusableBlockEditorUrl(opts: {
  workspaceId: string;
  entryId: string;
  adminReturnTo?: string | null;
}): string {
  return buildStudioUrl(
    `/w/${encodeURIComponent(opts.workspaceId)}/blocks/${encodeURIComponent(opts.entryId)}/`,
    opts.adminReturnTo,
  );
}

export function openStudioReusableBlockEditor(opts: {
  workspaceId: string;
  entryId: string;
}): void {
  if (typeof window === "undefined") return;
  window.location.assign(buildStudioReusableBlockEditorUrl(opts));
}
