import { useEffect } from "react";

import { Button } from "antd";
import { Link2 } from "lucide-react";
import { useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/components/common/default-page";
import { buildStudioPageEditorUrl, buildStudioWorkspaceUrl } from "@/lib/routing/studio-editor";

export function WorkspaceEditorHandoffPage() {
  const { t } = useTranslation(["content_pages"]);
  const { workspaceId, editorMode, entityId } = useParams({
    from: "/w/$workspaceId/editor/$editorMode/$entityId",
  });

  const isPageMode = editorMode === "page";
  const studioPageUrl = buildStudioPageEditorUrl({
    workspaceId,
    pageId: entityId,
  });
  const studioWorkspaceUrl = buildStudioWorkspaceUrl(workspaceId);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isPageMode) return;
    window.location.replace(studioPageUrl);
  }, [isPageMode, studioPageUrl]);

  return (
    <DefaultPage
      width="fixed"
      title={
        isPageMode
          ? t("content_pages:EDITOR_HANDOFF_TITLE")
          : t("content_pages:EDITOR_HANDOFF_UNSUPPORTED_TITLE")
      }
      description={
        isPageMode
          ? t("content_pages:EDITOR_HANDOFF_DESC")
          : t("content_pages:EDITOR_HANDOFF_UNSUPPORTED_DESC")
      }
      action={
        <Button
          type="primary"
          autoInsertSpace={false}
          icon={<Link2 className="size-4" aria-hidden="true" />}
          href={isPageMode ? studioPageUrl : studioWorkspaceUrl}
        >
          {t("content_pages:EDITOR_HANDOFF_ACTION")}
        </Button>
      }
    />
  );
}
