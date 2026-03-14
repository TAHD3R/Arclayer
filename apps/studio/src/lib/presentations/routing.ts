import { resolveStudioPresentationId } from "@/lib/routing/admin-handoff";

export function buildStudioPresentationRoutePath(args: {
  workspaceId: string;
  presentationId: string;
}): string {
  return `/w/${encodeURIComponent(args.workspaceId)}/presentations/${encodeURIComponent(args.presentationId)}/`;
}

export function buildLegacyBlockRoutePath(args: { workspaceId: string; entryId: string }): string {
  return `/w/${encodeURIComponent(args.workspaceId)}/blocks/${encodeURIComponent(args.entryId)}/`;
}

export function resolveLegacyEntryIdFromPresentation(args: {
  presentationId?: string | null;
  pageId?: string | null;
  entryId?: string | null;
}): string {
  const resolved = resolveStudioPresentationId(args);
  if (!resolved) throw new Error("PRESENTATION_ID_REQUIRED");
  return resolved;
}
