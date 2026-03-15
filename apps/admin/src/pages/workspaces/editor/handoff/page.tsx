import { useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/components/common/default-page";

export function WorkspaceEditorHandoffPage() {
  const { t } = useTranslation(["content_pages"]);
  const { editorMode } = useParams({
    from: "/w/$workspaceId/editor/$editorMode/$entityId",
  });

  const isPresentationMode = editorMode === "presentation";

  return (
    <DefaultPage
      title={t("content_pages:EDITOR_HANDOFF_UNSUPPORTED_TITLE")}
      description={
        isPresentationMode
          ? t("content_pages:EDITOR_HANDOFF_DESC")
          : t("content_pages:EDITOR_HANDOFF_UNSUPPORTED_DESC")
      }
    />
  );
}
