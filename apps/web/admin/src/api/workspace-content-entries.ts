import { isPageBlueprint } from "@celestial/site-block-protocol";
import type { PageBlueprint } from "@celestial/site-block-protocol";

import { api } from "@/lib/http";
import { workspacePath } from "@/lib/api";

export type ContentEntryRevisionState = "draft" | "published";

export type ContentEntryRevisionOut = {
  entryId: string;
  state: ContentEntryRevisionState;
  revision: number;
  createdAtMs: number;
  snapshot: unknown;
};

export type ContentEntryDraftSaveIn = {
  document: PageBlueprint;
  expectedRevision?: number | null;
  meta?: Record<string, unknown> | null;
  fieldValues?: Record<string, unknown> | null;
};

export type ContentEntryDraftSaveOut = {
  entryId: string;
  revision: number;
  savedAtMs: number;
};

export type ContentEntryPublishIn = {
  revision?: number | null;
};

export type ContentEntryPublishOut = {
  entryId: string;
  revision: number;
  publishedAtMs: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function extractPageBlueprintFromSnapshot(snapshot: unknown): PageBlueprint | null {
  if (!isRecord(snapshot)) return null;
  const raw =
    snapshot.page_blueprint ??
    snapshot.pageBlueprint ??
    snapshot.design_document ??
    snapshot.designDocument ??
    null;
  if (!raw || !isRecord(raw)) return null;
  if (!isPageBlueprint(raw)) return null;
  return raw as unknown as PageBlueprint;
}

export async function getWorkspaceContentEntryRevision(
  workspaceId: string,
  entryId: string,
  state: ContentEntryRevisionState,
): Promise<ContentEntryRevisionOut> {
  return api.get<ContentEntryRevisionOut>(
    workspacePath(
      workspaceId,
      `/content/entries/${encodeURIComponent(entryId)}/revisions/${encodeURIComponent(state)}`,
    ),
  );
}

export async function saveWorkspaceContentEntryDraft(
  workspaceId: string,
  entryId: string,
  payload: ContentEntryDraftSaveIn,
): Promise<ContentEntryDraftSaveOut> {
  return api.post<ContentEntryDraftSaveOut>(
    workspacePath(workspaceId, `/content/entries/${encodeURIComponent(entryId)}/draft`),
    {
      pageBlueprint: payload.document,
      expectedRevision: payload.expectedRevision ?? null,
      fieldValues: payload.fieldValues ?? null,
      meta: payload.meta ?? null,
    },
  );
}

export async function publishWorkspaceContentEntry(
  workspaceId: string,
  entryId: string,
  payload: ContentEntryPublishIn = {},
): Promise<ContentEntryPublishOut> {
  return api.post<ContentEntryPublishOut>(
    workspacePath(workspaceId, `/content/entries/${encodeURIComponent(entryId)}/publish`),
    payload,
  );
}
