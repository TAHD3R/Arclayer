import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import {
  getContentModelImpactPreview,
  listAllContentModels,
  patchContentModel,
} from "@/api/content";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { notifyError } from "@/lib/notifications";
import {
  getContentTypeDescription,
  getContentTypeLabel,
  sortContentModelsByPresentation,
} from "@/pages/workspaces/content/content-type-presentation";
import { buildContentModelsQueryKey } from "@/pages/workspaces/content/library/utils";
import type {
  AdminContentContinuationPosture,
  AdminContentContinuationRole,
  AdminContentContinuationSurface,
  AdminContentModel,
  AdminContentModelImpactPreview,
  PatchAdminContentModelPayload,
} from "@/types/api";

const CONTINUATION_ROLE_OPTIONS: Array<AdminContentContinuationRole> = [
  "page",
  "article",
  "reusable-section",
  "taxonomy",
  "person",
  "settings",
  "data",
  "general",
];
const CONTINUATION_POSTURE_OPTIONS: Array<AdminContentContinuationPosture> = [
  "page",
  "entry",
  "composition",
  "structured",
];
const CONTINUATION_SURFACE_OPTIONS: Array<AdminContentContinuationSurface> = [
  "writing",
  "canvas",
  "structured",
];

const CAPABILITY_PRESENTATION = {
  versioned: {
    labelKey: "CONTENT_MODELS_CAPABILITY_VERSIONED_LABEL",
    descriptionKey: "CONTENT_MODELS_CAPABILITY_VERSIONED_DESC",
  },
  routable: {
    labelKey: "CONTENT_MODELS_CAPABILITY_ROUTABLE_LABEL",
    descriptionKey: "CONTENT_MODELS_CAPABILITY_ROUTABLE_DESC",
  },
  treeable: {
    labelKey: "CONTENT_MODELS_CAPABILITY_TREEABLE_LABEL",
    descriptionKey: "CONTENT_MODELS_CAPABILITY_TREEABLE_DESC",
  },
  visual_editable: {
    labelKey: "CONTENT_MODELS_CAPABILITY_VISUAL_EDITABLE_LABEL",
    descriptionKey: "CONTENT_MODELS_CAPABILITY_VISUAL_EDITABLE_DESC",
  },
  rich_text_editable: {
    labelKey: "CONTENT_MODELS_CAPABILITY_RICH_TEXT_EDITABLE_LABEL",
    descriptionKey: "CONTENT_MODELS_CAPABILITY_RICH_TEXT_EDITABLE_DESC",
  },
  queryable: {
    labelKey: "CONTENT_MODELS_CAPABILITY_QUERYABLE_LABEL",
    descriptionKey: "CONTENT_MODELS_CAPABILITY_QUERYABLE_DESC",
  },
  has_slots: {
    labelKey: "CONTENT_MODELS_CAPABILITY_HAS_SLOTS_LABEL",
    descriptionKey: "CONTENT_MODELS_CAPABILITY_HAS_SLOTS_DESC",
  },
  has_relations: {
    labelKey: "CONTENT_MODELS_CAPABILITY_HAS_RELATIONS_LABEL",
    descriptionKey: "CONTENT_MODELS_CAPABILITY_HAS_RELATIONS_DESC",
  },
  localizable: {
    labelKey: "CONTENT_MODELS_CAPABILITY_LOCALIZABLE_LABEL",
    descriptionKey: "CONTENT_MODELS_CAPABILITY_LOCALIZABLE_DESC",
  },
  publishable: {
    labelKey: "CONTENT_MODELS_CAPABILITY_PUBLISHABLE_LABEL",
    descriptionKey: "CONTENT_MODELS_CAPABILITY_PUBLISHABLE_DESC",
  },
  schedulable: {
    labelKey: "CONTENT_MODELS_CAPABILITY_SCHEDULABLE_LABEL",
    descriptionKey: "CONTENT_MODELS_CAPABILITY_SCHEDULABLE_DESC",
  },
  seo_managed: {
    labelKey: "CONTENT_MODELS_CAPABILITY_SEO_MANAGED_LABEL",
    descriptionKey: "CONTENT_MODELS_CAPABILITY_SEO_MANAGED_DESC",
  },
} as const satisfies Record<
  AdminContentModel["capabilities"][number],
  { labelKey: string; descriptionKey: string }
>;

const ROLE_PRESENTATION = {
  page: "CONTENT_MODELS_ROLE_PAGE_LABEL",
  article: "CONTENT_MODELS_ROLE_ARTICLE_LABEL",
  "reusable-section": "CONTENT_MODELS_ROLE_REUSABLE_SECTION_LABEL",
  taxonomy: "CONTENT_MODELS_ROLE_TAXONOMY_LABEL",
  person: "CONTENT_MODELS_ROLE_PERSON_LABEL",
  settings: "CONTENT_MODELS_ROLE_SETTINGS_LABEL",
  data: "CONTENT_MODELS_ROLE_DATA_LABEL",
  general: "CONTENT_MODELS_ROLE_GENERAL_LABEL",
} as const satisfies Record<AdminContentContinuationRole, string>;

const POSTURE_PRESENTATION = {
  page: "CONTENT_MODELS_POSTURE_PAGE_LABEL",
  entry: "CONTENT_MODELS_POSTURE_ENTRY_LABEL",
  composition: "CONTENT_MODELS_POSTURE_COMPOSITION_LABEL",
  structured: "CONTENT_MODELS_POSTURE_STRUCTURED_LABEL",
} as const satisfies Record<AdminContentContinuationPosture, string>;

const SURFACE_PRESENTATION = {
  writing: "CONTENT_MODELS_SURFACE_WRITING_LABEL",
  canvas: "CONTENT_MODELS_SURFACE_CANVAS_LABEL",
  structured: "CONTENT_MODELS_SURFACE_STRUCTURED_LABEL",
} as const satisfies Record<AdminContentContinuationSurface, string>;

const EDITOR_PRESENTATION = {
  form: "CONTENT_MODELS_EDITOR_FORM_LABEL",
  visual: "CONTENT_MODELS_EDITOR_VISUAL_LABEL",
  rich_text: "CONTENT_MODELS_EDITOR_RICH_TEXT_LABEL",
  table: "CONTENT_MODELS_EDITOR_TABLE_LABEL",
} as const satisfies Record<NonNullable<AdminContentModel["defaultEditor"]>, string>;

type ContentModelDraft = {
  defaultRole: AdminContentContinuationRole | null;
  defaultPosture: AdminContentContinuationPosture | null;
  defaultSurface: AdminContentContinuationSurface | null;
  starterPackPolicyText: string;
};

function formatPolicyText(value: Record<string, unknown> | null | undefined): string {
  if (!value) return "";
  return JSON.stringify(value, null, 2);
}

function createDraft(model: AdminContentModel): ContentModelDraft {
  return {
    defaultRole: model.defaultRole ?? null,
    defaultPosture: model.defaultPosture ?? null,
    defaultSurface: model.defaultSurface ?? null,
    starterPackPolicyText: formatPolicyText(model.starterPackPolicy),
  };
}

function parseOptionalPolicy(text: string): Record<string, unknown> | null {
  const normalized = text.trim();
  if (!normalized) return null;
  const parsed = JSON.parse(normalized) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("CONTENT_MODELS_STARTER_PACK_POLICY_INVALID");
  }
  return parsed as Record<string, unknown>;
}

function normalizeValue<T extends string>(value: T | null | undefined): T | null {
  return value ?? null;
}

function stableValue(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function buildPatchPayload(
  model: AdminContentModel,
  draft: ContentModelDraft,
): PatchAdminContentModelPayload {
  const payload: PatchAdminContentModelPayload = {};
  if (normalizeValue(model.defaultRole) !== draft.defaultRole) {
    payload.defaultRole = draft.defaultRole;
  }
  if (normalizeValue(model.defaultPosture) !== draft.defaultPosture) {
    payload.defaultPosture = draft.defaultPosture;
  }
  if (normalizeValue(model.defaultSurface) !== draft.defaultSurface) {
    payload.defaultSurface = draft.defaultSurface;
  }
  const starterPackPolicy = parseOptionalPolicy(draft.starterPackPolicyText);
  if (stableValue(model.starterPackPolicy) !== stableValue(starterPackPolicy)) {
    payload.starterPackPolicy = starterPackPolicy;
  }
  return payload;
}

function ModelFact(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 px-4 py-4">
      <div className="text-xs text-muted-foreground">{props.label}</div>
      <div className="mt-2 text-sm font-medium text-foreground">{props.value}</div>
    </div>
  );
}

function CanvasNode(props: { title: string; description: string }) {
  return (
    <div className="rounded-[24px] border border-border/70 bg-background px-5 py-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-foreground">{props.title}</div>
        <span className="rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Locked
        </span>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{props.description}</p>
    </div>
  );
}

function ImpactMetric(props: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/70 px-4 py-4">
      <div className="text-xs text-muted-foreground">{props.label}</div>
      <div className="mt-2 text-xl font-semibold text-foreground">{props.value}</div>
    </div>
  );
}

export function ContentModelsControlCenterPage(props: { workspaceId: string }) {
  const { t } = useTranslation("content");
  const queryClient = useQueryClient();
  const modelsQuery = useQuery({
    queryKey: buildContentModelsQueryKey(props.workspaceId),
    queryFn: () => listAllContentModels(props.workspaceId),
  });
  const [selectedModelId, setSelectedModelId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<ContentModelDraft | null>(null);
  const [preview, setPreview] = React.useState<AdminContentModelImpactPreview | null>(null);
  const [previewPayloadKey, setPreviewPayloadKey] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const models = React.useMemo(
    () => sortContentModelsByPresentation(modelsQuery.data ?? []),
    [modelsQuery.data],
  );
  const selectedModel = models.find((model) => model.id === selectedModelId) ?? models[0] ?? null;
  const selectedTypeLabel = selectedModel
    ? getContentTypeLabel({
        modelKey: selectedModel.key,
        fallbackName: selectedModel.name,
        fallbackLabel: selectedModel.key,
        t,
      })
    : null;
  const selectedTypeDescription = selectedModel
    ? getContentTypeDescription({
        modelKey: selectedModel.key,
        fallbackDescription: selectedModel.description,
        t,
      })
    : null;

  React.useEffect(() => {
    if (!selectedModelId && models[0]) {
      setSelectedModelId(models[0].id);
    }
  }, [models, selectedModelId]);

  React.useEffect(() => {
    if (!selectedModel) {
      setDraft(null);
      setPreview(null);
      setPreviewPayloadKey(null);
      setSaveError(null);
      return;
    }
    setDraft(createDraft(selectedModel));
    setPreview(null);
    setPreviewPayloadKey(null);
    setSaveError(null);
  }, [selectedModel]);

  const currentPayloadState = React.useMemo(() => {
    if (!selectedModel || !draft) return { payload: null, error: null as string | null };
    try {
      return {
        payload: buildPatchPayload(selectedModel, draft),
        error: null as string | null,
      };
    } catch (error) {
      return {
        payload: null,
        error: error instanceof Error ? error.message : "CONTENT_MODELS_SAVE_FAILED",
      };
    }
  }, [draft, selectedModel]);
  React.useEffect(() => {
    setSaveError((current) => {
      if (currentPayloadState.error) return currentPayloadState.error;
      if (current === "CONTENT_MODELS_STARTER_PACK_POLICY_INVALID") return null;
      return current;
    });
  }, [currentPayloadState.error]);
  const currentPayload = currentPayloadState.payload;
  const currentPayloadKey = React.useMemo(
    () => stableValue(currentPayload ?? {}),
    [currentPayload],
  );
  const previewIsCurrent =
    preview !== null && previewPayloadKey !== null && previewPayloadKey === currentPayloadKey;
  const hasPendingChanges = Boolean(currentPayload && Object.keys(currentPayload).length > 0);

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!selectedModel || !draft) return null;
      const payload = buildPatchPayload(selectedModel, draft);
      if (Object.keys(payload).length === 0) return null;
      const result = await getContentModelImpactPreview(
        props.workspaceId,
        selectedModel.id,
        payload,
      );
      return { payloadKey: stableValue(payload), result };
    },
    onSuccess: (value) => {
      setSaveError(null);
      setPreview(value?.result ?? null);
      setPreviewPayloadKey(value?.payloadKey ?? null);
    },
    onError: (error) => {
      setSaveError(error instanceof Error ? error.message : "CONTENT_MODELS_SAVE_FAILED");
      notifyError(error);
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedModel || !draft || !preview || !previewIsCurrent) {
        throw new Error("CONTENT_MODELS_PREVIEW_REQUIRED");
      }
      const payload = buildPatchPayload(selectedModel, draft);
      return patchContentModel(props.workspaceId, selectedModel.id, {
        ...payload,
        impactPreviewToken: preview.previewToken,
      });
    },
    onSuccess: async (updatedModel) => {
      setSaveError(null);
      setPreview(null);
      setPreviewPayloadKey(null);
      setDraft(createDraft(updatedModel));
      await queryClient.invalidateQueries({
        queryKey: buildContentModelsQueryKey(props.workspaceId),
      });
    },
    onError: (error) => {
      setSaveError(error instanceof Error ? error.message : "CONTENT_MODELS_SAVE_FAILED");
      notifyError(error);
    },
  });

  if (modelsQuery.isLoading) {
    return (
      <DefaultPage
        title={t("CONTENT_MODELS_TITLE")}
        description={t("CONTENT_MODELS_DESC")}
        showFavoriteToggle={false}
      >
        <div>{t("CONTENT_MODELS_LOADING")}</div>
      </DefaultPage>
    );
  }

  if (modelsQuery.isError) {
    return (
      <DefaultPage
        title={t("CONTENT_MODELS_TITLE")}
        description={t("CONTENT_MODELS_DESC")}
        showFavoriteToggle={false}
      >
        <div>{t("CONTENT_MODELS_EMPTY")}</div>
      </DefaultPage>
    );
  }

  if (!selectedModel || !draft || !selectedTypeLabel) {
    return (
      <DefaultPage
        title={t("CONTENT_MODELS_TITLE")}
        description={t("CONTENT_MODELS_DESC")}
        showFavoriteToggle={false}
      >
        <div>{t("CONTENT_MODELS_EMPTY")}</div>
      </DefaultPage>
    );
  }

  const systemNodes = [
    {
      title: t("CONTENT_MODELS_SYSTEM_NODE_ROUTING_TITLE"),
      description: t("CONTENT_MODELS_SYSTEM_NODE_ROUTING_DESC"),
    },
    {
      title: t("CONTENT_MODELS_SYSTEM_NODE_DELIVERY_TITLE"),
      description: t("CONTENT_MODELS_SYSTEM_NODE_DELIVERY_DESC"),
    },
    {
      title: t("CONTENT_MODELS_SYSTEM_NODE_WORKFLOW_TITLE"),
      description: t("CONTENT_MODELS_SYSTEM_NODE_WORKFLOW_DESC"),
    },
  ];

  return (
    <DefaultPage
      title={t("CONTENT_MODELS_TITLE")}
      description={t("CONTENT_MODELS_DESC")}
      showFavoriteToggle={false}
    >
      <div
        className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)_340px]"
        data-testid="content-models-governance-surface"
      >
        <aside className="rounded-[28px] border border-border/60 bg-card/60 p-4">
          <div className="text-sm font-semibold text-foreground">
            {t("CONTENT_MODELS_LIST_TITLE")}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {t("CONTENT_MODELS_PROTOCOL_LIST_DESC")}
          </div>
          <div className="mt-4 grid gap-2">
            {models.map((model) => {
              const active = model.id === selectedModel.id;
              const label = getContentTypeLabel({
                modelKey: model.key,
                fallbackName: model.name,
                fallbackLabel: model.key,
                t,
              });
              return (
                <button
                  key={model.id}
                  type="button"
                  className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                    active
                      ? "border-border bg-background text-foreground"
                      : "border-border/60 bg-transparent text-muted-foreground hover:bg-muted/40"
                  }`}
                  onClick={() => setSelectedModelId(model.id)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">{label}</div>
                    <span className="rounded-full border border-border/60 px-2 py-0.5 text-[11px] uppercase tracking-[0.14em]">
                      {t("CONTENT_MODELS_LOCKED_BADGE")}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{model.key}</div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="space-y-6">
          <div className="rounded-[32px] border border-border/60 bg-card/70 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  {t("CONTENT_MODELS_PROTOCOL_CANVAS_EYEBROW")}
                </div>
                <h2 className="text-2xl font-semibold text-foreground">{selectedTypeLabel}</h2>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  {selectedTypeDescription}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <ModelFact label={t("CONTENT_MODELS_FIELD_MODEL_KEY")} value={selectedModel.key} />
                <ModelFact
                  label={t("CONTENT_MODELS_FIELD_DEFAULT_EDITOR")}
                  value={
                    selectedModel.defaultEditor
                      ? t(EDITOR_PRESENTATION[selectedModel.defaultEditor])
                      : t("CONTENT_MODELS_OPTION_UNSET")
                  }
                />
                <ModelFact
                  label={t("CONTENT_MODELS_FIELD_CAPABILITY_COUNT")}
                  value={String(selectedModel.capabilities.length)}
                />
                <ModelFact
                  label={t("CONTENT_MODELS_FIELD_SURFACE")}
                  value={
                    draft.defaultSurface
                      ? t(SURFACE_PRESENTATION[draft.defaultSurface])
                      : t("CONTENT_MODELS_OPTION_UNSET")
                  }
                />
              </div>
            </div>

            <div className="mt-6 rounded-[28px] border border-dashed border-border/70 bg-background/80 p-5">
              <div className="text-sm font-semibold text-foreground">
                {t("CONTENT_MODELS_PROTOCOL_CANVAS_TITLE")}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {t("CONTENT_MODELS_PROTOCOL_CANVAS_DESC")}
              </div>
              <div
                className="mt-5 grid gap-4 md:grid-cols-3"
                data-testid="content-models-governance-canvas"
              >
                {systemNodes.map((node) => (
                  <CanvasNode key={node.title} title={node.title} description={node.description} />
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-[28px] border border-border/60 bg-card/60 p-5">
              <div className="text-sm font-semibold text-foreground">
                {t("CONTENT_MODELS_SECTION_CAPABILITIES_TITLE")}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {t("CONTENT_MODELS_SECTION_CAPABILITIES_DESC")}
              </div>
              <div className="mt-4 grid gap-3">
                {selectedModel.capabilities.map((capability) => (
                  <div
                    key={capability}
                    className="rounded-2xl border border-border/60 bg-background px-4 py-4"
                  >
                    <div className="text-sm font-medium text-foreground">
                      {t(CAPABILITY_PRESENTATION[capability].labelKey)}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {t(CAPABILITY_PRESENTATION[capability].descriptionKey)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-border/60 bg-card/60 p-5">
              <div className="text-sm font-semibold text-foreground">
                {t("CONTENT_MODELS_SECTION_DEFAULTS_TITLE")}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {t("CONTENT_MODELS_SECTION_EXTENSIONS_DESC")}
              </div>
              <div className="mt-4 grid gap-4">
                <label className="grid gap-2 text-sm">
                  <span className="font-medium text-foreground">
                    {t("CONTENT_MODELS_FIELD_ROLE")}
                  </span>
                  <select
                    aria-label={t("CONTENT_MODELS_FIELD_ROLE")}
                    className="h-11 rounded-xl border border-border/70 bg-background px-3 text-sm"
                    value={draft.defaultRole ?? ""}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              defaultRole: event.target.value
                                ? (event.target.value as AdminContentContinuationRole)
                                : null,
                            }
                          : current,
                      )
                    }
                  >
                    <option value="">{t("CONTENT_MODELS_OPTION_UNSET")}</option>
                    {CONTINUATION_ROLE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {t(ROLE_PRESENTATION[option])}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2 text-sm">
                  <span className="font-medium text-foreground">
                    {t("CONTENT_MODELS_FIELD_POSTURE")}
                  </span>
                  <select
                    aria-label={t("CONTENT_MODELS_FIELD_POSTURE")}
                    className="h-11 rounded-xl border border-border/70 bg-background px-3 text-sm"
                    value={draft.defaultPosture ?? ""}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              defaultPosture: event.target.value
                                ? (event.target.value as AdminContentContinuationPosture)
                                : null,
                            }
                          : current,
                      )
                    }
                  >
                    <option value="">{t("CONTENT_MODELS_OPTION_UNSET")}</option>
                    {CONTINUATION_POSTURE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {t(POSTURE_PRESENTATION[option])}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2 text-sm">
                  <span className="font-medium text-foreground">
                    {t("CONTENT_MODELS_FIELD_SURFACE")}
                  </span>
                  <select
                    aria-label={t("CONTENT_MODELS_FIELD_SURFACE")}
                    className="h-11 rounded-xl border border-border/70 bg-background px-3 text-sm"
                    value={draft.defaultSurface ?? ""}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              defaultSurface: event.target.value
                                ? (event.target.value as AdminContentContinuationSurface)
                                : null,
                            }
                          : current,
                      )
                    }
                  >
                    <option value="">{t("CONTENT_MODELS_OPTION_UNSET")}</option>
                    {CONTINUATION_SURFACE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {t(SURFACE_PRESENTATION[option])}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2 text-sm">
                  <span className="font-medium text-foreground">
                    {t("CONTENT_MODELS_FIELD_STARTER_PACK_POLICY")}
                  </span>
                  <textarea
                    value={draft.starterPackPolicyText}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              starterPackPolicyText: event.target.value,
                            }
                          : current,
                      )
                    }
                    className="min-h-36 rounded-2xl border border-border/70 bg-background px-3 py-3 font-mono text-sm"
                  />
                </label>
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-4 rounded-[28px] border border-border/60 bg-card/60 p-5">
          <div>
            <div className="text-sm font-semibold text-foreground">
              {t("CONTENT_MODELS_INSPECTOR_TITLE")}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {t("CONTENT_MODELS_INSPECTOR_DESC")}
            </div>
          </div>

          {preview ? (
            <div className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <ImpactMetric
                  label={t("CONTENT_MODELS_PREVIEW_AFFECTED")}
                  value={preview.affectedItemsCount}
                />
                <ImpactMetric
                  label={t("CONTENT_MODELS_PREVIEW_RECOVERY")}
                  value={preview.recoveryItemsCount}
                />
                <ImpactMetric
                  label={t("CONTENT_MODELS_PREVIEW_RESHAPE")}
                  value={preview.reshapeItemsCount}
                />
              </div>
              <div className="rounded-2xl border border-border/60 bg-background px-4 py-4 text-sm text-muted-foreground">
                {preview.hasBlockingChanges
                  ? t("CONTENT_MODELS_PREVIEW_BLOCKING")
                  : t("CONTENT_MODELS_PREVIEW_READY")}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border/70 bg-background/80 px-4 py-4 text-sm text-muted-foreground">
              {t("CONTENT_MODELS_INSPECTOR_EMPTY")}
            </div>
          )}

          {saveError ? (
            <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-4 text-sm text-destructive">
              {t(saveError)}
            </div>
          ) : null}

          <div className="grid gap-3">
            <button
              type="button"
              className="h-11 rounded-xl border border-border/70 bg-background px-4 text-sm font-medium text-foreground disabled:opacity-60"
              disabled={!hasPendingChanges || previewMutation.isPending}
              onClick={() => previewMutation.mutate()}
            >
              {previewMutation.isPending
                ? t("CONTENT_MODELS_PREVIEW_PENDING")
                : t("CONTENT_MODELS_PREVIEW_ACTION")}
            </button>
            <button
              type="button"
              className="h-11 rounded-xl bg-foreground px-4 text-sm font-medium text-background disabled:opacity-60"
              disabled={
                !hasPendingChanges ||
                !previewIsCurrent ||
                preview?.hasBlockingChanges === true ||
                saveMutation.isPending
              }
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending
                ? t("CONTENT_MODELS_SAVE_PENDING")
                : t("CONTENT_MODELS_SAVE_ACTION")}
            </button>
          </div>
        </aside>
      </div>
    </DefaultPage>
  );
}
