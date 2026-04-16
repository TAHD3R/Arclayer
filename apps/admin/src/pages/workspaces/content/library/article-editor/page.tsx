import { AdminRouteContainer } from "@/components/layout/admin-route-container";

import { ContentLibraryArticleEditorShell } from "./components/content-library-article-editor-shell";
import { useContentLibraryArticleEditor } from "./hooks/use-content-library-article-editor";

export function ContentLibraryArticleEditorPage(props: { workspaceId: string; itemId: string }) {
  const editor = useContentLibraryArticleEditor({
    workspaceId: props.workspaceId,
    itemId: props.itemId,
  });

  return (
    <AdminRouteContainer
      className="h-full overflow-hidden"
      innerClassName="h-full min-h-0 flex flex-col overflow-hidden px-0 pt-0 pb-0"
      pageFrame="full"
    >
      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden bg-card"
        data-item-id={props.itemId}
        data-workspace-id={props.workspaceId}
      >
        <ContentLibraryArticleEditorShell
          workspaceId={props.workspaceId}
          itemId={props.itemId}
          mode="page"
          title={editor.title}
          summary={editor.summary}
          onTitleChange={editor.setTitle}
          onSummaryChange={editor.setSummary}
          slug={editor.slug}
          onSlugChange={editor.setSlug}
          status={editor.status}
          visibility={editor.visibility}
          onVisibilityChange={editor.setVisibility}
          coverAssetId={editor.coverAssetId}
          onCoverAssetIdChange={editor.setCoverAssetId}
          seo={editor.seo}
          onSeoChange={editor.setSeo}
          bodyDocument={editor.bodyDocument}
          onBodyDocumentChange={editor.setBodyDocument}
          isLoading={editor.isLoading}
          saveState={editor.saveState}
          saveError={editor.saveError}
          isPublishing={editor.isPublishing}
          hasPublishableVersion={Boolean(editor.draftVersionNumber)}
          onPublish={editor.publish}
          className="min-h-0 flex-1"
        />
      </div>
    </AdminRouteContainer>
  );
}
