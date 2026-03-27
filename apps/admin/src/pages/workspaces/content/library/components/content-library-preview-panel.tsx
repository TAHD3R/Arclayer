import { useTranslation } from "react-i18next";

import { ContentLibraryArticleEditorShell } from "../article-editor/content-library-article-editor-shell";

export function ContentLibraryPreviewPanel(props: {
  title: string;
  summary: string;
  onTitleChange: (value: string) => void;
  onSummaryChange: (value: string) => void;
  onClose: () => void;
  onOpenPage: () => void;
  className?: string;
}) {
  const { t } = useTranslation("content");

  return (
    <aside
      data-slot="content-library-preview-panel"
      className={props.className}
      aria-label={t("CONTENT_LIBRARY_PREVIEW_PANEL_TITLE")}
    >
      <ContentLibraryArticleEditorShell
        mode="split"
        title={props.title}
        summary={props.summary}
        onTitleChange={props.onTitleChange}
        onSummaryChange={props.onSummaryChange}
        onClose={props.onClose}
        onOpenPage={props.onOpenPage}
        className="h-full"
      />
    </aside>
  );
}
