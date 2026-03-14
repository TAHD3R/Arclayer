import {
  getWorkspaceContentEntry,
  getWorkspaceContentEntryRevision,
  publishWorkspaceContentEntry,
  saveWorkspaceContentEntryDraft,
  unpublishWorkspaceContentEntry,
} from "@/api/content-entries";
import type {
  ContentEntryDraftSaveIn,
  ContentEntryDraftSaveOut,
  ContentEntryOut,
  ContentEntryPublishIn,
  ContentEntryPublishOut,
  ContentEntryRevisionOut,
  ContentEntryRevisionState,
  ContentEntryUnpublishOut,
} from "@/types/api/content-entries";

export type PresentationDocumentOut = ContentEntryOut;
export type PresentationRevisionOut = ContentEntryRevisionOut;
export type PresentationRevisionState = ContentEntryRevisionState;
export type PresentationDraftSaveIn = ContentEntryDraftSaveIn;
export type PresentationDraftSaveOut = ContentEntryDraftSaveOut;
export type PresentationPublishIn = ContentEntryPublishIn;
export type PresentationPublishOut = ContentEntryPublishOut;
export type PresentationUnpublishOut = ContentEntryUnpublishOut;

export async function getWorkspacePresentation(
  workspaceId: string,
  presentationId: string,
): Promise<PresentationDocumentOut> {
  return getWorkspaceContentEntry(workspaceId, presentationId);
}

export async function getWorkspacePresentationRevision(
  workspaceId: string,
  presentationId: string,
  state: PresentationRevisionState,
): Promise<PresentationRevisionOut> {
  return getWorkspaceContentEntryRevision(workspaceId, presentationId, state);
}

export async function saveWorkspacePresentationDraft(
  workspaceId: string,
  presentationId: string,
  payload: PresentationDraftSaveIn,
): Promise<PresentationDraftSaveOut> {
  return saveWorkspaceContentEntryDraft(workspaceId, presentationId, payload);
}

export async function publishWorkspacePresentation(
  workspaceId: string,
  presentationId: string,
  payload: PresentationPublishIn = {},
): Promise<PresentationPublishOut> {
  return publishWorkspaceContentEntry(workspaceId, presentationId, payload);
}

export async function unpublishWorkspacePresentation(
  workspaceId: string,
  presentationId: string,
): Promise<PresentationUnpublishOut> {
  return unpublishWorkspaceContentEntry(workspaceId, presentationId);
}
