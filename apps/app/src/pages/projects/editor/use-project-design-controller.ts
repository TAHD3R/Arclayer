import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  BuilderChangeSetPreviewOut,
  BuilderChangeSetPreviewRequest,
  BuilderComponentCatalogOut,
  BuilderRevisionOut,
  BuilderRevisionPageOut,
} from "@arclayer/openapi";

import {
  applyProjectBuilderChangeSet,
  buildProjectBuilderPageRenderDocumentQueryKey,
  buildProjectBuilderQueryKey,
  getProjectBuilderPageRenderDocument,
  previewProjectBuilderChangeSet,
} from "@/api/project-builder";

type BuilderChangeOperation = BuilderChangeSetPreviewRequest["operations"][number];
export type DesignChangeOperation = Extract<BuilderChangeOperation, { type: `design.${string}` }>;

interface ProjectDesignControllerInput {
  projectId: string;
  revision: BuilderRevisionOut | null;
  page: BuilderRevisionPageOut | null;
  componentCatalog: BuilderComponentCatalogOut | null;
  enabled: boolean;
  recoveredPreview?: BuilderChangeSetPreviewOut | null;
  onDraftAutosave: (operations: BuilderChangeSetPreviewRequest["operations"]) => Promise<unknown>;
  onDraftDiscard: () => Promise<void>;
}

function commandKey(prefix: string): string {
  return `${prefix}:${globalThis.crypto.randomUUID()}`;
}

export function useProjectDesignController({
  projectId,
  revision,
  page,
  componentCatalog,
  enabled,
  recoveredPreview,
  onDraftAutosave,
  onDraftDiscard,
}: ProjectDesignControllerInput) {
  const { t } = useTranslation("account");
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<BuilderChangeSetPreviewOut | null>(null);
  const locale = page?.routes?.find((route) => route.isActive)?.locale ?? null;
  const themeKey = componentCatalog?.defaultThemeKey ?? null;
  const revisionId = revision?.siteRevision.id ?? null;
  const pageItemId = page?.itemId ?? null;

  useEffect(() => setPreview(null), [pageItemId, revisionId]);

  useEffect(() => {
    if (recoveredPreview) setPreview(recoveredPreview);
  }, [pageItemId, recoveredPreview, revisionId]);

  const renderQuery = useQuery({
    queryKey: buildProjectBuilderPageRenderDocumentQueryKey(
      projectId,
      revisionId,
      pageItemId,
      locale,
      themeKey,
    ),
    queryFn: ({ signal }) =>
      getProjectBuilderPageRenderDocument(
        projectId,
        revisionId!,
        pageItemId!,
        locale!,
        themeKey,
        signal,
      ),
    enabled: enabled && Boolean(revisionId && pageItemId && locale && themeKey && page?.wireframe),
    retry: false,
  });

  const previewChange = useMutation({
    mutationFn: async (operations: readonly DesignChangeOperation[]) => {
      if (!revision) throw new Error(t("CREATION_EDITOR_DESIGN_REVISION_REQUIRED"));
      await onDraftAutosave([...operations]);
      return previewProjectBuilderChangeSet(
        projectId,
        {
          baseRevisionId: revision.siteRevision.id,
          baseEtag: revision.siteRevision.manifestHash,
          operations: [...operations],
          provenanceSource: "human",
        },
        commandKey("design-preview"),
      );
    },
    onSuccess: setPreview,
  });

  const applyChange = useMutation({
    mutationFn: () => {
      if (!preview) throw new Error(t("CREATION_EDITOR_DESIGN_PREVIEW_REQUIRED"));
      return applyProjectBuilderChangeSet(
        projectId,
        preview.changeSetId,
        {
          previewToken: preview.previewToken,
          approval: preview.approval
            ? {
                approvalId: preview.approval.approvalId,
                decision: "approve",
                expectedApprovalClass: preview.approval.approvalClass,
              }
            : undefined,
        },
        commandKey("design-apply"),
      );
    },
    onSuccess: async () => {
      await onDraftDiscard();
      await queryClient.invalidateQueries({ queryKey: buildProjectBuilderQueryKey(projectId) });
      setPreview(null);
    },
  });

  return {
    renderQuery,
    preview,
    previewChange,
    applyChange,
    discardPreview: () => setPreview(null),
    operationError: previewChange.error ?? applyChange.error,
  };
}
