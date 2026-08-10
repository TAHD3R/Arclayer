import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { ContentGuard } from "@/layouts/page-shell/content-guard";

import {
  useWorkspaceGuidanceController,
  type WorkspaceGuidanceController,
} from "./use-workspace-guidance-controller";
import { WorkspaceGuidanceImpactDialog } from "./workspace-guidance-impact-dialog";
import { GuidanceEditor, WorkspaceKnowledgeEditor } from "./workspace-guidance-authoring";
import { GuidanceHistory } from "./workspace-guidance-history";
import { EffectivePreview, GuidanceReferences } from "./workspace-guidance-context";

export function WorkspaceGuidanceView(props: {
  workspaceId: string;
  onControllerChange?: (controller: WorkspaceGuidanceController | null) => void;
}) {
  return <GuidanceLayerView {...props} />;
}

export function ProjectGuidanceView(props: { workspaceId: string; projectId: string }) {
  return <GuidanceLayerView {...props} />;
}

function GuidanceLayerView(props: {
  workspaceId: string;
  projectId?: string;
  onControllerChange?: (controller: WorkspaceGuidanceController | null) => void;
}) {
  const { t } = useTranslation("knowledge");
  const controller = useWorkspaceGuidanceController(props);
  const isProject = Boolean(props.projectId);

  useEffect(() => {
    props.onControllerChange?.(controller);
  }, [
    controller.draft,
    controller.hasUnsavedChanges,
    controller.layer,
    controller.projectMode,
    controller.publishMutation.isPending,
    controller.saveDraftMutation.isPending,
    controller.saveAndPublishMutation.isPending,
    controller.history.length,
    controller.historyQuery.isLoading,
    props.onControllerChange,
  ]);

  useEffect(() => {
    return () => props.onControllerChange?.(null);
  }, [props.onControllerChange]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 pb-8">
      <ContentGuard
        loading={controller.guidanceQuery.isLoading}
        error={controller.guidanceQuery.error}
        onRetry={() => void controller.guidanceQuery.refetch()}
        loadingVariant={isProject ? "split-detail" : "form"}
      >
        {controller.layer && isProject ? (
          <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <GuidanceEditor controller={controller} />
            <aside
              className="min-w-0 space-y-6 xl:col-start-2 xl:row-start-1 xl:row-span-2"
              aria-label={t("CONTEXT_SIDEBAR_LABEL")}
            >
              <EffectivePreview controller={controller} />
              <GuidanceReferences controller={controller} />
            </aside>
            <GuidanceHistory controller={controller} />
          </div>
        ) : controller.layer ? (
          <WorkspaceKnowledgeEditor controller={controller} />
        ) : null}
      </ContentGuard>

      {controller.pendingPreview ? (
        <WorkspaceGuidanceImpactDialog
          pendingPreview={controller.pendingPreview}
          pending={controller.applyPreviewMutation.isPending}
          error={controller.applyPreviewMutation.error}
          scope={isProject ? "project" : "workspace"}
          onOpenChange={(open) => {
            if (!open) controller.setPendingPreview(null);
          }}
          onApply={() => void controller.applyPendingPreview()}
        />
      ) : null}
    </div>
  );
}
