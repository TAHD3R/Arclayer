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

  const models = modelsQuery.data ?? [];
  const selectedModel = models.find((model) => model.id === selectedModelId) ?? models[0] ?? null;

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
                <span className="text-sm font-medium text-foreground">{model.name}</span>
                <span className="text-xs text-muted-foreground">{model.key}</span>
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
                <h2 className="text-xl font-semibold text-foreground">{selectedModel.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {selectedModel.description || selectedModel.key}
                </p>
              </header>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="space-y-2 text-sm">
                  <span className="font-medium text-foreground">
                    {t("CONTENT_MODELS_FIELD_ROLE")}
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
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2 text-sm">
                  <span className="font-medium text-foreground">
                    {t("CONTENT_MODELS_FIELD_POSTURE")}
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
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2 text-sm">
                  <span className="font-medium text-foreground">
                    {t("CONTENT_MODELS_FIELD_SURFACE")}
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
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block space-y-2 text-sm">
                <span className="font-medium text-foreground">
                  {t("CONTENT_MODELS_FIELD_STARTER_PACK_POLICY")}
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
