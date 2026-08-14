import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

import type {
  BuilderChangeSetPreviewOut,
  BuilderChangeSetPreviewRequest,
  BuilderRevisionOut,
} from "@arclayer/openapi";
import { Button } from "@arclayer/ui/button";

import { getErrorMessage } from "@/lib/notifications";
import { EditorFloatingCard } from "@/pages/projects/editor/editor-floating-card";
import { SharedSectionCatalog } from "@/pages/projects/editor/shared-section-manager-catalog";
import { SharedSectionCreateForm } from "@/pages/projects/editor/shared-section-manager-create";
import { SharedSectionNotice } from "@/pages/projects/editor/shared-section-manager-elements";
import { SharedSectionRetirementReview } from "@/pages/projects/editor/shared-section-manager-retirement";
import {
  useSharedSectionManager,
  type SharedSectionManagerFlow,
} from "@/pages/projects/editor/use-shared-section-manager";

interface SharedSectionManagerPanelProps {
  open: boolean;
  anchor: HTMLElement | null;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  revision: BuilderRevisionOut;
  canWrite: boolean;
  permissionReady: boolean;
  onApplied: () => Promise<void>;
  onDraftAutosave: (operations: BuilderChangeSetPreviewRequest["operations"]) => Promise<unknown>;
  onDraftDiscard: () => Promise<void>;
}

export function SharedSectionManagerPanel({
  open,
  anchor,
  onOpenChange,
  projectId,
  revision,
  canWrite,
  permissionReady,
  onApplied,
  onDraftAutosave,
  onDraftDiscard,
}: SharedSectionManagerPanelProps) {
  const { t } = useTranslation("account");
  const manager = useSharedSectionManager({
    projectId,
    revision,
    onOpenChange,
    onApplied,
    onDraftAutosave,
    onDraftDiscard,
  });
  const { state, actions } = manager;
  const titleKey = resolveDialogCopyKey(state.flow, "title");
  const descriptionKey = resolveDialogCopyKey(state.flow, "description");
  return (
    <EditorFloatingCard
      open={open}
      anchor={anchor}
      onOpenChange={actions.handleOpenChange}
      title={t(titleKey)}
      description={t(descriptionKey)}
      widthClass="w-[min(56rem,calc(100vw-2rem))]"
      bodyClassName="min-h-[18rem]"
      footer={
        <ManagerFooter
          flow={state.flow}
          preview={state.preview}
          pending={state.pending}
          canAct={canWrite && state.online}
          blockerCount={state.blockers.length}
          onClose={actions.closeDialog}
          onBack={actions.returnToCatalog}
          onPreviewCreate={actions.previewCreate}
          onApply={actions.apply}
        />
      }
    >
      {!state.online ? (
        <SharedSectionNotice tone="warning" text={t("CREATION_EDITOR_SHARED_SECTIONS_OFFLINE")} />
      ) : null}
      {!canWrite ? (
        <SharedSectionNotice
          tone="neutral"
          text={
            permissionReady
              ? t("CREATION_EDITOR_SHARED_SECTIONS_READ_ONLY")
              : t("CREATION_EDITOR_SHARED_SECTIONS_PERMISSION_LOADING")
          }
        />
      ) : null}
      {state.error ? (
        <SharedSectionNotice tone="danger" text={getErrorMessage(state.error)} />
      ) : null}
      {state.flow.kind === "catalog" ? (
        <SharedSectionCatalog
          revision={revision}
          canWrite={canWrite && state.online}
          onCreate={actions.openCreate}
          onRetire={actions.previewRetirement}
        />
      ) : state.flow.kind === "create" ? (
        <SharedSectionCreateForm
          revision={revision}
          draft={state.draft}
          submitted={state.submitted}
          defaultPropsInvalid={state.defaultPropsInvalid}
          preview={state.preview}
          onChange={actions.updateDraft}
        />
      ) : (
        <SharedSectionRetirementReview
          revision={revision}
          section={state.flow.section}
          preview={state.preview}
          previewing={state.previewing}
        />
      )}
    </EditorFloatingCard>
  );
}

function resolveDialogCopyKey(
  flow: SharedSectionManagerFlow,
  copy: "title" | "description",
): string {
  const keys = {
    catalog: {
      title: "CREATION_EDITOR_SHARED_SECTIONS_TITLE",
      description: "CREATION_EDITOR_SHARED_SECTIONS_DESC",
    },
    create: {
      title: "CREATION_EDITOR_SHARED_SECTIONS_CREATE_TITLE",
      description: "CREATION_EDITOR_SHARED_SECTIONS_CREATE_DESC",
    },
    retire: {
      title: "CREATION_EDITOR_SHARED_SECTIONS_RETIRE_TITLE",
      description: "CREATION_EDITOR_SHARED_SECTIONS_RETIRE_DESC",
    },
  } as const;
  return keys[flow.kind][copy];
}

function ManagerFooter({
  flow,
  preview,
  pending,
  canAct,
  blockerCount,
  onClose,
  onBack,
  onPreviewCreate,
  onApply,
}: {
  flow: SharedSectionManagerFlow;
  preview: BuilderChangeSetPreviewOut | null;
  pending: boolean;
  canAct: boolean;
  blockerCount: number;
  onClose: () => void;
  onBack: () => void;
  onPreviewCreate: () => void;
  onApply: () => void;
}) {
  const { t } = useTranslation("account");
  if (flow.kind === "catalog") {
    return (
      <Button type="button" variant="outline" className="min-h-11" onClick={onClose}>
        {t("CREATION_EDITOR_SHARED_SECTIONS_CLOSE")}
      </Button>
    );
  }
  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-3">
      <Button
        type="button"
        variant="ghost"
        className="min-h-11"
        onClick={onBack}
        disabled={pending}
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("CREATION_EDITOR_SHARED_SECTIONS_BACK")}
      </Button>
      {flow.kind === "create" && !preview ? (
        <Button
          type="button"
          className="min-h-11"
          onClick={onPreviewCreate}
          loading={pending}
          disabled={!canAct}
        >
          {t("CREATION_EDITOR_SHARED_SECTIONS_REVIEW_CREATE")}
        </Button>
      ) : (
        <Button
          type="button"
          variant={flow.kind === "retire" ? "destructive" : "default"}
          className="min-h-11"
          onClick={onApply}
          loading={pending}
          disabled={!preview || blockerCount > 0 || !canAct}
        >
          {flow.kind === "retire"
            ? t("CREATION_EDITOR_SHARED_SECTIONS_APPLY_RETIRE")
            : t("CREATION_EDITOR_SHARED_SECTIONS_APPLY_CREATE")}
        </Button>
      )}
    </div>
  );
}
