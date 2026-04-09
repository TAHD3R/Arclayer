import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import {
  getContentModelImpactPreview,
  listAllContentModels,
  patchContentModel,
} from "@/api/content";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import type {
  AdminContentContinuationPosture,
  AdminContentContinuationRole,
  AdminContentContinuationSurface,
  AdminContentModel,
  AdminContentModelImpactPreview,
  PatchAdminContentModelPayload,
} from "@/types/api";
import {
  getContentTypeDescription,
  getContentTypeLabel,
  getOfficialContentTypePresentation,
  sortContentModelsByPresentation,
} from "@/pages/workspaces/content/content-type-presentation";
import { buildContentModelsQueryKey } from "@/pages/workspaces/content/library/utils";

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

type ContentModelDraft = {
  defaultRole: AdminContentContinuationRole | null;
  defaultPosture: AdminContentContinuationPosture | null;
  defaultSurface: AdminContentContinuationSurface | null;
  starterPackPolicyText: string;
};

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

function ModelFactCard(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/70 px-4 py-4">
      <div className="text-xs text-muted-foreground">{props.label}</div>
      <div className="mt-2 text-sm font-medium text-foreground">{props.value}</div>
    </div>
  );
}

function ModelCapabilityCard(props: { label: string; description: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/70 px-4 py-4">
      <div className="text-sm font-medium text-foreground">{props.label}</div>
      <div className="mt-1 text-sm text-muted-foreground">{props.description}</div>
    </div>
  );
}

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
  const selectedOfficialType = getOfficialContentTypePresentation(selectedModel?.key);
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
    setSelectedModelId(selectedModel.id);
    setDraft(createDraft(selectedModel));
    setPreview(null);
    setPreviewPayloadKey(null);
    setSaveError(null);
  }, [selectedModel]);

  let payload: PatchAdminContentModelPayload | null = null;
  let payloadError: string | null = null;
  if (selectedModel && draft) {
    try {
      payload = buildPatchPayload(selectedModel, draft);
    } catch {
      payloadError = t("CONTENT_MODELS_STARTER_PACK_POLICY_INVALID");
    }
  }
  const payloadKey = JSON.stringify(payload ?? {});
  const hasChanges = Boolean(payload && Object.keys(payload).length > 0);
  const previewIsFresh = previewPayloadKey === payloadKey;

  const previewMutation = useMutation({
    mutationFn: async (nextPayload: PatchAdminContentModelPayload) => {
      if (!selectedModel) {
        throw new Error("Missing selected model");
      }
      return getContentModelImpactPreview(props.workspaceId, selectedModel.id, nextPayload);
    },
    onSuccess: (result) => {
      setPreview(result);
      setPreviewPayloadKey(payloadKey);
      setSaveError(null);
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (nextPayload: PatchAdminContentModelPayload) => {
      if (!selectedModel || !preview) {
        throw new Error("Missing preview context");
      }
      return patchContentModel(props.workspaceId, selectedModel.id, {
        ...nextPayload,
        impactPreviewToken: preview.previewToken,
      });
    },
    onSuccess: (updatedModel) => {
      queryClient.setQueryData<AdminContentModel[]>(
        buildContentModelsQueryKey(props.workspaceId),
        (current) => {
          const items = current ?? [];
          const didReplace = items.some((item) => item.id === updatedModel.id);
          if (!didReplace) return [...items, updatedModel];
          return items.map((item) => (item.id === updatedModel.id ? updatedModel : item));
        },
      );
      setSelectedModelId(updatedModel.id);
      setPreview(null);
      setPreviewPayloadKey(null);
      setSaveError(null);
    },
    onError: (error) => {
      setSaveError(error instanceof Error ? error.message : t("CONTENT_MODELS_SAVE_FAILED"));
    },
  });

  function updateDraft(patch: Partial<ContentModelDraft>) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        ...patch,
      };
    });
    setPreview(null);
    setPreviewPayloadKey(null);
    setSaveError(null);
  }

  async function handlePreview() {
    if (!payload || !hasChanges) return;
    await previewMutation.mutateAsync(payload);
  }

  async function handleSave() {
    if (!payload || !hasChanges || !preview || !previewIsFresh || preview.hasBlockingChanges)
      return;
    await saveMutation.mutateAsync(payload);
  }

  return (
    <DefaultPage
      title={t("CONTENT_MODELS_TITLE")}
      description={t("CONTENT_MODELS_DESC")}
      showFavoriteToggle={false}
    >
      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-border/60 bg-card/70 p-4">
          <h2 className="text-sm font-semibold text-foreground">
            {t("CONTENT_MODELS_LIST_TITLE")}
          </h2>
          <div className="mt-4 space-y-2">
            {models.map((model) => (
              <button
                key={model.id}
                className={[
                  "flex w-full flex-col rounded-xl border px-3 py-3 text-left transition",
                  selectedModel?.id === model.id
                    ? "border-foreground/20 bg-accent/40"
                    : "border-border/60 bg-background hover:bg-accent/20",
                ].join(" ")}
                onClick={() => setSelectedModelId(model.id)}
                type="button"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  {(() => {
                    const presentation = getOfficialContentTypePresentation(model.key);
                    const TypeIcon = presentation?.icon;
                    return TypeIcon ? <TypeIcon className="size-4 text-muted-foreground" /> : null;
                  })()}
                  {getContentTypeLabel({
                    modelKey: model.key,
                    fallbackName: model.name,
                    fallbackLabel: model.key,
                    t,
                  })}
                </span>
                <span className="mt-1 text-xs text-muted-foreground">
                  {model.description?.trim() || model.key}
                </span>
              </button>
            ))}
            {!modelsQuery.isLoading && models.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border/60 px-3 py-4 text-sm text-muted-foreground">
                {t("CONTENT_MODELS_EMPTY")}
              </p>
            ) : null}
          </div>
        </aside>

        <section className="rounded-2xl border border-border/60 bg-card/80 p-6">
          {modelsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">{t("CONTENT_MODELS_LOADING")}</p>
          ) : null}

          {!modelsQuery.isLoading && selectedModel && draft ? (
            <div className="space-y-6">
              <header className="space-y-1">
                <div className="flex items-center gap-3">
                  {selectedOfficialType ? (
                    <span className="inline-flex size-10 items-center justify-center rounded-full border border-border/60 bg-background/70 text-muted-foreground">
                      <selectedOfficialType.icon className="size-5" />
                    </span>
                  ) : null}
                  <div className="space-y-1">
                    <h2 className="text-xl font-semibold text-foreground">
                      {selectedTypeLabel ?? selectedModel.name}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {selectedTypeDescription || selectedModel.description || selectedModel.key}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>
                    {t("CONTENT_MODELS_FIELD_MODEL_KEY")}: {selectedModel.key}
                  </span>
                  <span>·</span>
                  <span>
                    {t("CONTENT_MODELS_FIELD_DEFAULT_EDITOR")}:{" "}
                    {t(
                      selectedModel.defaultEditor
                        ? EDITOR_PRESENTATION[selectedModel.defaultEditor]
                        : "CONTENT_MODELS_OPTION_UNSET",
                    )}
                  </span>
                </div>
              </header>

              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <ModelFactCard
                  label={t("CONTENT_MODELS_FIELD_NAME")}
                  value={selectedTypeLabel ?? selectedModel.name}
                />
                <ModelFactCard
                  label={t("CONTENT_MODELS_FIELD_DESCRIPTION")}
                  value={selectedTypeDescription || t("CONTENT_MODELS_OPTION_UNSET")}
                />
                <ModelFactCard
                  label={t("CONTENT_MODELS_FIELD_DEFAULT_EDITOR")}
                  value={t(
                    selectedModel.defaultEditor
                      ? EDITOR_PRESENTATION[selectedModel.defaultEditor]
                      : "CONTENT_MODELS_OPTION_UNSET",
                  )}
                />
                <ModelFactCard
                  label={t("CONTENT_MODELS_FIELD_CAPABILITY_COUNT")}
                  value={String(selectedModel.capabilities.length)}
                />
              </section>

              <section className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-foreground">
                    {t("CONTENT_MODELS_SECTION_CAPABILITIES_TITLE")}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t("CONTENT_MODELS_SECTION_CAPABILITIES_DESC")}
                  </p>
                </div>
                {selectedModel.capabilities.length > 0 ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {selectedModel.capabilities.map((capability) => (
                      <ModelCapabilityCard
                        key={capability}
                        label={t(CAPABILITY_PRESENTATION[capability].labelKey)}
                        description={t(CAPABILITY_PRESENTATION[capability].descriptionKey)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border/60 px-4 py-4 text-sm text-muted-foreground">
                    {t("CONTENT_MODELS_CAPABILITIES_EMPTY")}
                  </div>
                )}
              </section>

              <section className="space-y-4 rounded-2xl border border-border/60 bg-background/70 p-5">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-foreground">
                    {t("CONTENT_MODELS_SECTION_DEFAULTS_TITLE")}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t("CONTENT_MODELS_SECTION_DEFAULTS_DESC")}
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="space-y-2 text-sm">
                    <span className="font-medium text-foreground">
                      {t("CONTENT_MODELS_FIELD_ROLE")}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {t("CONTENT_MODELS_FIELD_ROLE_HINT")}
                    </span>
                    <select
                      aria-label={t("CONTENT_MODELS_FIELD_ROLE")}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2"
                      value={draft.defaultRole ?? ""}
                      onChange={(event) =>
                        updateDraft({
                          defaultRole: (event.target.value ||
                            null) as AdminContentContinuationRole | null,
                        })
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

                  <label className="space-y-2 text-sm">
                    <span className="font-medium text-foreground">
                      {t("CONTENT_MODELS_FIELD_POSTURE")}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {t("CONTENT_MODELS_FIELD_POSTURE_HINT")}
                    </span>
                    <select
                      aria-label={t("CONTENT_MODELS_FIELD_POSTURE")}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2"
                      value={draft.defaultPosture ?? ""}
                      onChange={(event) =>
                        updateDraft({
                          defaultPosture: (event.target.value ||
                            null) as AdminContentContinuationPosture | null,
                        })
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

                  <label className="space-y-2 text-sm">
                    <span className="font-medium text-foreground">
                      {t("CONTENT_MODELS_FIELD_SURFACE")}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {t("CONTENT_MODELS_FIELD_SURFACE_HINT")}
                    </span>
                    <select
                      aria-label={t("CONTENT_MODELS_FIELD_SURFACE")}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2"
                      value={draft.defaultSurface ?? ""}
                      onChange={(event) =>
                        updateDraft({
                          defaultSurface: (event.target.value ||
                            null) as AdminContentContinuationSurface | null,
                        })
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
                </div>
              </section>

              <details className="rounded-2xl border border-border/60 bg-background/70 p-5">
                <summary className="cursor-pointer list-none text-base font-semibold text-foreground">
                  {t("CONTENT_MODELS_SECTION_ADVANCED_TITLE")}
                </summary>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("CONTENT_MODELS_SECTION_ADVANCED_DESC")}
                </p>
                <label className="mt-4 block space-y-2 text-sm">
                  <span className="font-medium text-foreground">
                    {t("CONTENT_MODELS_FIELD_STARTER_PACK_POLICY")}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {t("CONTENT_MODELS_FIELD_STARTER_PACK_POLICY_HINT")}
                  </span>
                  <textarea
                    aria-label={t("CONTENT_MODELS_FIELD_STARTER_PACK_POLICY")}
                    className="min-h-36 w-full rounded-2xl border border-border bg-background px-3 py-3 font-mono text-xs"
                    value={draft.starterPackPolicyText}
                    onChange={(event) =>
                      updateDraft({
                        starterPackPolicyText: event.target.value,
                      })
                    }
                  />
                </label>
              </details>

              {payloadError ? (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {payloadError}
                </div>
              ) : null}

              {preview ? (
                <div
                  className={[
                    "rounded-2xl border px-4 py-4",
                    preview.hasBlockingChanges
                      ? "border-destructive/30 bg-destructive/10"
                      : "border-border/60 bg-background/80",
                  ].join(" ")}
                  data-testid="content-model-preview-summary"
                >
                  <div className="grid gap-4 md:grid-cols-4">
                    <div>
                      <div className="text-xs text-muted-foreground">
                        {t("CONTENT_MODELS_PREVIEW_AFFECTED")}
                      </div>
                      <div className="mt-1 text-lg font-semibold">{preview.affectedItemsCount}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">
                        {t("CONTENT_MODELS_PREVIEW_RECOVERY")}
                      </div>
                      <div className="mt-1 text-lg font-semibold">{preview.recoveryItemsCount}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">
                        {t("CONTENT_MODELS_PREVIEW_RESHAPE")}
                      </div>
                      <div className="mt-1 text-lg font-semibold">{preview.reshapeItemsCount}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">
                        {t("CONTENT_MODELS_PREVIEW_BREAKING")}
                      </div>
                      <div className="mt-1 text-lg font-semibold">
                        {preview.impact.breakingChanges.length}
                      </div>
                    </div>
                  </div>
                  {preview.hasBlockingChanges ? (
                    <p className="mt-4 text-sm font-medium text-destructive">
                      {t("CONTENT_MODELS_PREVIEW_BLOCKING")}
                    </p>
                  ) : (
                    <p className="mt-4 text-sm text-muted-foreground">
                      {t("CONTENT_MODELS_PREVIEW_READY")}
                    </p>
                  )}
                </div>
              ) : null}

              {saveError ? (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {saveError}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <button
                  className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!hasChanges || Boolean(payloadError) || previewMutation.isPending}
                  onClick={() => void handlePreview()}
                  type="button"
                >
                  {previewMutation.isPending
                    ? t("CONTENT_MODELS_PREVIEW_PENDING")
                    : t("CONTENT_MODELS_PREVIEW_ACTION")}
                </button>
                <button
                  className="rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-background disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={
                    !hasChanges ||
                    Boolean(payloadError) ||
                    !preview ||
                    !previewIsFresh ||
                    preview.hasBlockingChanges ||
                    saveMutation.isPending
                  }
                  onClick={() => void handleSave()}
                  type="button"
                >
                  {saveMutation.isPending
                    ? t("CONTENT_MODELS_SAVE_PENDING")
                    : t("CONTENT_MODELS_SAVE_ACTION")}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </DefaultPage>
  );
}
