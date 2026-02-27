import { isDesignDocumentV1 } from "@celestial/site-block-protocol";
import type { DesignDocumentV1 } from "@celestial/site-block-protocol";

import { api } from "@/lib/http";
import { workspacePath } from "@/api/workspace-path";

export type ContentEntryRevisionState = "draft" | "published";

export type ContentEntryRevisionOut = {
  entryId: string;
  state: ContentEntryRevisionState;
  revision: number;
  createdAtMs: number;
  snapshot: unknown;
};

export type ContentEntryDraftSaveIn = {
  document: DesignDocumentV1;
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

export function extractDesignDocumentFromSnapshot(snapshot: unknown): DesignDocumentV1 | null {
  if (!isRecord(snapshot)) return null;
  const raw =
    snapshot.design_document ??
    snapshot.designDocument ??
    snapshot.document_ir ??
    snapshot.documentIr ??
    null;
  if (!raw || !isRecord(raw)) return null;
  return isDesignDocumentV1(raw) ? raw : null;
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
  // Backend schema uses AliasChoices("documentIr","document") etc; we keep the payload
  // aligned to the editor-first design document contract.
  return api.post<ContentEntryDraftSaveOut>(
    workspacePath(workspaceId, `/content/entries/${encodeURIComponent(entryId)}/draft`),
    {
      document: payload.document,
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
