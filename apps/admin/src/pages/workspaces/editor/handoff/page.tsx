import { useEffect } from "react";

import { Button } from "antd";
import { Link2 } from "lucide-react";
import { useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/components/common/default-page";
import {
  buildStudioPresentationEditorUrl,
  buildStudioWorkspaceUrl,
} from "@/lib/routing/studio-editor";

export function WorkspaceEditorHandoffPage() {
  const { t } = useTranslation(["content_pages"]);
  const { workspaceId, editorMode, entityId } = useParams({
    from: "/w/$workspaceId/editor/$editorMode/$entityId",
  });

  const isPresentationMode = editorMode === "presentation";
  const studioPresentationUrl = buildStudioPresentationEditorUrl({
    workspaceId,
    presentationId: entityId,
  });
  const studioWorkspaceUrl = buildStudioWorkspaceUrl(workspaceId);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isPresentationMode) return;
    window.location.replace(studioPresentationUrl);
  }, [isPresentationMode, studioPresentationUrl]);

  return (
    <DefaultPage
      width="fixed"
      title={
        isPresentationMode
          ? t("content_pages:EDITOR_HANDOFF_TITLE")
          : t("content_pages:EDITOR_HANDOFF_UNSUPPORTED_TITLE")
      }
      description={
        isPresentationMode
          ? t("content_pages:EDITOR_HANDOFF_DESC")
          : t("content_pages:EDITOR_HANDOFF_UNSUPPORTED_DESC")
      }
      action={
        <Button
          type="primary"
          autoInsertSpace={false}
          icon={<Link2 className="size-4" aria-hidden="true" />}
          href={isPresentationMode ? studioPresentationUrl : studioWorkspaceUrl}
        >
          {t("content_pages:EDITOR_HANDOFF_ACTION")}
        </Button>
      }
    />
  );
}
