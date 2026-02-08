import type { DocumentIR } from "@celestial/site-block-protocol";

import { getPortalApiPrefix } from "@/runtime/site-api";

export function parsePreviewToken(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const token = (data as { token?: unknown }).token;
  if (typeof token !== "string") return null;
  const trimmed = token.trim();
  return trimmed ? trimmed : null;
}

export async function saveRouteDraftToApi(args: {
  siteId: string;
  pathname: string;
  token: string;
  document: DocumentIR;
  expectedRevision: number | null;
}): Promise<{ path: string; revision: number; savedAtMs: number; pageId?: string } | null> {
  const url = `${getPortalApiPrefix()}/sites/${encodeURIComponent(args.siteId)}/routes/draft?token=${encodeURIComponent(
    args.token,
  )}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      path: args.pathname,
      document: args.document,
      ...(args.expectedRevision !== null ? { expectedRevision: args.expectedRevision } : {}),
    }),
  });
  if (!res.ok) {
    const maybe = await res.json().catch(() => null);
    if (res.status === 409) {
      const details = parseConflictMeta(maybe);
      throw new Error(
        details
          ? `Draft conflict: expected ${details.expectedRevision}, current ${details.currentRevision}`
          : "Draft conflict (409)",
      );
    }
    throw new Error(`Save failed (${res.status})`);
  }
  const payload: unknown = await res.json();
  return parseDraftSaveOut(payload);
}

export async function savePageDraftToApi(args: {
  siteId: string;
  pageId: string;
  token: string;
  document: DocumentIR;
  expectedRevision: number | null;
}): Promise<{ path: string; revision: number; savedAtMs: number; pageId?: string } | null> {
  const url = `${getPortalApiPrefix()}/sites/${encodeURIComponent(
    args.siteId,
  )}/pages/${encodeURIComponent(args.pageId)}/revisions/draft?token=${encodeURIComponent(args.token)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      document: args.document,
      ...(args.expectedRevision !== null ? { expectedRevision: args.expectedRevision } : {}),
    }),
  });
  if (!res.ok) {
    const maybe = await res.json().catch(() => null);
    if (res.status === 409) {
      const details = parseConflictMeta(maybe);
      throw new Error(
        details
          ? `Draft conflict: expected ${details.expectedRevision}, current ${details.currentRevision}`
          : "Draft conflict (409)",
      );
    }
    throw new Error(`Save failed (${res.status})`);
  }
  const payload: unknown = await res.json();
  return parsePageDraftSaveOut(payload);
}

export async function saveEntryDraftToApi(args: {
  siteId: string;
  token: string;
  entryTypeCode: string;
  slug: string;
  document: DocumentIR;
  expectedRevision: number;
}): Promise<{ slug: string; entryId: string; revision: number; savedAtMs: number } | null> {
  const url = `${getPortalApiPrefix()}/sites/${encodeURIComponent(args.siteId)}/entries/draft?token=${encodeURIComponent(
    args.token,
  )}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      entryTypeCode: args.entryTypeCode,
      slug: args.slug,
      document: args.document,
      expectedRevision: args.expectedRevision,
    }),
  });
  if (!res.ok) {
    const maybe = await res.json().catch(() => null);
    if (res.status === 409) {
      const details = parseConflictMeta(maybe);
      throw new Error(
        details
          ? `Entry draft conflict: expected ${details.expectedRevision}, current ${details.currentRevision}`
          : "Entry draft conflict (409)",
      );
    }
    throw new Error(`Entry save failed (${res.status})`);
  }
  const payload: unknown = await res.json();
  return parseEntryDraftSaveOut(payload);
}

export async function publishEntryToApi(args: {
  siteId: string;
  token: string;
  entryTypeCode: string;
  slug: string;
  revision: number | null;
}): Promise<boolean> {
  const url = `${getPortalApiPrefix()}/sites/${encodeURIComponent(args.siteId)}/entries/publish?token=${encodeURIComponent(
    args.token,
  )}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      entryTypeCode: args.entryTypeCode,
      slug: args.slug,
      ...(args.revision !== null ? { revision: args.revision } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Entry publish failed (${res.status})`);
  const payload: unknown = await res.json().catch(() => null);
  if (!payload || typeof payload !== "object") return false;
  const data = (payload as { data?: unknown }).data;
  return Boolean(data && typeof data === "object");
}

export async function heartbeatPresenceToApi(args: {
  siteId: string;
  token: string;
  docKey: string;
  clientId: string;
  actor: Record<string, string> | null;
}): Promise<number | null> {
  const url = `${getPortalApiPrefix()}/sites/${encodeURIComponent(args.siteId)}/presence/heartbeat?token=${encodeURIComponent(
    args.token,
  )}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      docKey: args.docKey,
      clientId: args.clientId,
      actor: args.actor,
    }),
  });
  if (!res.ok) return null;
  const payload: unknown = await res.json().catch(() => null);
  if (!payload || typeof payload !== "object") return null;
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const expiresAtMs = (data as { expiresAtMs?: unknown }).expiresAtMs;
  return typeof expiresAtMs === "number" && Number.isFinite(expiresAtMs) ? expiresAtMs : null;
}

function parseDraftSaveOut(
  payload: unknown,
): { path: string; revision: number; savedAtMs: number } | null {
  if (!payload || typeof payload !== "object") return null;
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const rec = data as Record<string, unknown>;
  const path = rec.path;
  const revision = rec.revision;
  const savedAtMs = rec.savedAtMs ?? rec.saved_at_ms;
  if (typeof path !== "string" || !path.startsWith("/")) return null;
  if (typeof revision !== "number" || !Number.isFinite(revision)) return null;
  if (typeof savedAtMs !== "number" || !Number.isFinite(savedAtMs)) return null;
  return { path, revision, savedAtMs };
}

function parsePageDraftSaveOut(
  payload: unknown,
): { path: string; revision: number; savedAtMs: number; pageId?: string } | null {
  const base = parseDraftSaveOut(payload);
  if (!base) return null;
  if (!payload || typeof payload !== "object") return null;
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const rec = data as Record<string, unknown>;
  const pageId = rec.pageId ?? rec.page_id;
  if (typeof pageId === "string" && pageId.trim()) {
    return { ...base, pageId: pageId.trim() };
  }
  return base;
}

function parseEntryDraftSaveOut(
  payload: unknown,
): { slug: string; entryId: string; revision: number; savedAtMs: number } | null {
  if (!payload || typeof payload !== "object") return null;
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const rec = data as Record<string, unknown>;
  const slug = rec.slug;
  const entryId = rec.entryId ?? rec.entry_id;
  const revision = rec.revision;
  const savedAtMs = rec.savedAtMs ?? rec.saved_at_ms;
  if (typeof slug !== "string" || !slug.trim()) return null;
  if (typeof entryId !== "string" || !entryId.trim()) return null;
  if (typeof revision !== "number" || !Number.isFinite(revision)) return null;
  if (typeof savedAtMs !== "number" || !Number.isFinite(savedAtMs)) return null;
  return { slug, entryId, revision, savedAtMs };
}

function parseConflictMeta(
  payload: unknown,
): { expectedRevision: number; currentRevision: number } | null {
  if (!payload || typeof payload !== "object") return null;
  const meta = (payload as { meta?: unknown }).meta;
  if (!meta || typeof meta !== "object") return null;
  const rec = meta as Record<string, unknown>;
  const expectedRevision = rec.expectedRevision;
  const currentRevision = rec.currentRevision;
  if (typeof expectedRevision !== "number" || typeof currentRevision !== "number") return null;
  if (!Number.isFinite(expectedRevision) || !Number.isFinite(currentRevision)) return null;
  return { expectedRevision, currentRevision };
}
