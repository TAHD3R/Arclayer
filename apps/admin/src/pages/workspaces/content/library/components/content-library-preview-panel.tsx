import { useTranslation } from "react-i18next";

import { ContentLibraryArticleEditorShell } from "../article-editor/content-library-article-editor-shell";
import { useContentLibraryArticleEditor } from "../article-editor/use-content-library-article-editor";
import { cn } from "@arclayer/lib/utils";

export function ContentLibraryPreviewPanel(props: {
  workspaceId: string;
  itemId: string;
  initialTitle?: string;
  initialSummary?: string;
  onClose: () => void;
  onOpenPage: () => void;
  className?: string;
}) {
  const { t } = useTranslation("content");
  const editor = useContentLibraryArticleEditor({
    workspaceId: props.workspaceId,
    itemId: props.itemId,
    initialTitle: props.initialTitle,
    initialSummary: props.initialSummary,
  });

  return (
    <aside
      data-slot="content-library-preview-panel"
      className={cn("flex h-full min-h-0 w-full flex-col overflow-hidden", props.className)}
      aria-label={t("CONTENT_LIBRARY_PREVIEW_PANEL_TITLE")}
    >
      <ContentLibraryArticleEditorShell
        workspaceId={props.workspaceId}
        itemId={props.itemId}
        mode="split"
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
        saveState={editor.saveState}
        isPublishing={editor.isPublishing}
        hasPublishableVersion={Boolean(editor.draftVersionNumber)}
        onPublish={editor.publish}
        onClose={props.onClose}
        onOpenPage={props.onOpenPage}
        className="h-full"
      />
    </aside>
  );
}
