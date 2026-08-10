import { useMutation } from "@tanstack/react-query";
import { useMemo, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

import type {
  BuilderChangeSetPreviewRequest,
  BuilderChangeSetPreviewOut,
  BuilderRevisionGlobalSectionOut,
  BuilderRevisionOut,
  JsonValueInput,
} from "@arclayer/openapi";

import {
  applyProjectBuilderChangeSet,
  previewProjectBuilderChangeSet,
} from "@/api/project-builder";

export interface SharedSectionCreateDraft {
  title: string;
  slug: string;
  locale: string;
  purpose: string;
  defaultProps: string;
}

export type SharedSectionManagerFlow =
  | { kind: "catalog" }
  | { kind: "create" }
  | { kind: "retire"; section: BuilderRevisionGlobalSectionOut };

interface UseSharedSectionManagerInput {
  projectId: string;
  revision: BuilderRevisionOut;
  onOpenChange: (open: boolean) => void;
  onApplied: () => Promise<void>;
  onDraftAutosave: (operations: BuilderChangeSetPreviewRequest["operations"]) => Promise<unknown>;
  onDraftDiscard: () => Promise<void>;
}

function commandKey(prefix: string): string {
  return `${prefix}:${globalThis.crypto.randomUUID()}`;
}

function initialDraft(revision: BuilderRevisionOut): SharedSectionCreateDraft {
  return {
    title: "",
    slug: "",
    locale: revision.contentStructureRevision.snapshot.locales[0] ?? "",
    purpose: "",
    defaultProps: "",
  };
}

function parseDefaultProps(source: string): {
  value?: Record<string, JsonValueInput>;
  invalid: boolean;
} {
  if (!source.trim()) return { invalid: false };
  try {
    const parsed: unknown = JSON.parse(source);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { invalid: true };
    return { value: parsed as Record<string, JsonValueInput>, invalid: false };
  } catch {
    return { invalid: true };
  }
}

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function useOnlineStatus() {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

export function useSharedSectionManager({
  projectId,
  revision,
  onOpenChange,
  onApplied,
  onDraftAutosave,
  onDraftDiscard,
}: UseSharedSectionManagerInput) {
  const { t } = useTranslation("account");
  const online = useOnlineStatus();
  const [flow, setFlow] = useState<SharedSectionManagerFlow>({ kind: "catalog" });
  const [draft, setDraft] = useState<SharedSectionCreateDraft>(() => initialDraft(revision));
  const [submitted, setSubmitted] = useState(false);
  const [preview, setPreview] = useState<BuilderChangeSetPreviewOut | null>(null);
  const defaultProps = useMemo(() => parseDefaultProps(draft.defaultProps), [draft.defaultProps]);

  const previewMutation = useMutation({
    mutationFn: async (request: {
      payload: Parameters<typeof previewProjectBuilderChangeSet>[1];
      key: string;
    }) => {
      await onDraftAutosave(request.payload.operations);
      return previewProjectBuilderChangeSet(projectId, request.payload, request.key);
    },
    onSuccess: setPreview,
  });
  const applyMutation = useMutation({
    mutationFn: () => {
      if (!preview) throw new Error(t("CREATION_EDITOR_SHARED_SECTIONS_PREVIEW_REQUIRED"));
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
        commandKey("global-section-apply"),
      );
    },
    onSuccess: async () => {
      await onDraftDiscard();
      await onApplied();
      closeDialog();
    },
  });

  const pending = previewMutation.isPending || applyMutation.isPending;
  const blockers = preview?.issues.filter((issue) => issue.severity === "blocker") ?? [];

  function resetReview() {
    setPreview(null);
    previewMutation.reset();
    applyMutation.reset();
  }

  function resetDialog() {
    setFlow({ kind: "catalog" });
    setDraft(initialDraft(revision));
    setSubmitted(false);
    resetReview();
  }

  function closeDialog() {
    resetDialog();
    onOpenChange(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && pending) return;
    if (!nextOpen) resetDialog();
    onOpenChange(nextOpen);
  }

  function returnToCatalog() {
    setFlow({ kind: "catalog" });
    setSubmitted(false);
    resetReview();
  }

  function openCreate() {
    setDraft(initialDraft(revision));
    setFlow({ kind: "create" });
    resetReview();
  }

  function updateDraft(patch: Partial<SharedSectionCreateDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    resetReview();
  }

  function previewCreate() {
    setSubmitted(true);
    if (!draft.title.trim() || !draft.slug.trim() || !draft.locale || defaultProps.invalid) return;
    const operationId = commandKey("global-section-create-operation");
    const clientGlobalSectionId = commandKey("global-section-client");
    previewMutation.mutate({
      payload: {
        baseRevisionId: revision.siteRevision.id,
        baseEtag: revision.siteRevision.manifestHash,
        provenanceSource: "human",
        operations: [
          {
            type: "global_section.create",
            operationId,
            clientGlobalSectionId,
            title: draft.title.trim(),
            slug: draft.slug.trim(),
            locale: draft.locale,
            ...(defaultProps.value
              ? { fieldsSnapshot: { props_defaults: defaultProps.value } }
              : {}),
            purpose: draft.purpose.trim() || null,
            sectionIntents: [],
          },
        ],
      },
      key: commandKey("global-section-create-preview"),
    });
  }

  function previewRetirement(section: BuilderRevisionGlobalSectionOut) {
    setFlow({ kind: "retire", section });
    resetReview();
    const operationId = commandKey("global-section-delete-operation");
    previewMutation.mutate({
      payload: {
        baseRevisionId: revision.siteRevision.id,
        baseEtag: revision.siteRevision.manifestHash,
        provenanceSource: "human",
        operations: [
          {
            type: "global_section.delete",
            operationId,
            itemId: section.itemId,
            expectedDraftVersion: section.versionNumber,
          },
        ],
      },
      key: commandKey("global-section-delete-preview"),
    });
  }

  return {
    state: {
      flow,
      draft,
      submitted,
      preview,
      online,
      pending,
      blockers,
      defaultPropsInvalid: defaultProps.invalid,
      previewing: previewMutation.isPending,
      error: previewMutation.error ?? applyMutation.error,
    },
    actions: {
      handleOpenChange,
      closeDialog,
      returnToCatalog,
      openCreate,
      updateDraft,
      previewCreate,
      previewRetirement,
      apply: () => applyMutation.mutate(),
    },
  };
}
