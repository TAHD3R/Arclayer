import { getContentItem, getContentItemVersion } from "@/api/content";
import type {
  AdminContentItem,
  AdminContentPresentation,
  AdminContentPresentationKind,
  AdminContentVersion,
} from "@/types/api";

export type ContentLibraryArticleEditorSnapshot = {
  item: AdminContentItem;
  draftVersion: AdminContentVersion | null;
  publishedVersion: AdminContentVersion | null;
  bodyPresentation: AdminContentPresentation | null;
};

export function findArticleEditorPresentation(
  version: AdminContentVersion | null,
  kind: AdminContentPresentationKind,
): AdminContentPresentation | null {
  if (!version) return null;
  return version.presentations.find((presentation) => presentation.kind === kind) ?? null;
}

export async function loadContentLibraryArticleEditorSnapshot(
  workspaceId: string,
  itemId: string,
): Promise<ContentLibraryArticleEditorSnapshot> {
  const item = await getContentItem(workspaceId, itemId);

  const [draftVersion, publishedVersion] = await Promise.all([
    item.draftVersion > 0
      ? getContentItemVersion(workspaceId, itemId, item.draftVersion)
      : Promise.resolve(null),
    item.publishedVersion
      ? getContentItemVersion(workspaceId, itemId, item.publishedVersion)
      : Promise.resolve(null),
  ]);

  return {
    item,
    draftVersion,
    publishedVersion,
    bodyPresentation: findArticleEditorPresentation(draftVersion, "rich_text_document"),
  };
}
