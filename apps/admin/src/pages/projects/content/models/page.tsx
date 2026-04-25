import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import {
  addContentModelField,
  buildContentModelsQueryKey,
  createContentModel,
  deleteContentModelField,
  getContentModelJsonPreview,
  listAllContentModels,
  reorderContentModelFields,
  updateContentModelField,
} from "@/api/content";
import { AccessNoticeAlert } from "@/components/common/access-notice-alert";
import { useProjectPermissionAccess } from "@/hooks/use-workspace-permission-access";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { notifyError } from "@/lib/notifications";
import {
  getContentTypeDescription,
  getContentTypeLabel,
  sortContentModelsByPresentation,
} from "@/pages/projects/content/content-type-presentation";
import type {
  AdminContentModel,
  AdminContentModelFieldScalar,
  AdminContentModelJsonPreview,
  AdminContentModelKind,
} from "@/types/api";
import { Button } from "@arclayer/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@arclayer/ui/dialog";
import { Input } from "@arclayer/ui/input";
import { Textarea } from "@arclayer/ui/textarea";

type BuilderTab = "fields" | "details" | "groups" | "json" | "sidebar" | "editors" | "taxonomy";

type CreateTab = "manual" | "ai";
type FieldConfigKind = "plain" | "media" | "component" | "dynamic_zone";

type FieldRow = {
  key: string;
  label: string;
  scalar: AdminContentModelFieldScalar;
  required: boolean;
  config: Record<string, unknown> | null;
};

type CreateFormState = {
  key: string;
  name: string;
  description: string;
  modelKind: AdminContentModelKind;
};

type FieldFormState = {
  key: string;
  label: string;
  scalar: AdminContentModelFieldScalar;
  required: boolean;
  configKind: FieldConfigKind;
};

const MODEL_KIND_OPTIONS: AdminContentModelKind[] = ["collection_type", "single_type", "component"];

const FIELD_SCALAR_OPTIONS: AdminContentModelFieldScalar[] = [
  "text",
  "long_text",
  "number",
  "boolean",
  "date_time",
  "json",
];

const CONTENT_TYPE_TABS: BuilderTab[] = [
  "fields",
  "details",
  "groups",
  "json",
  "sidebar",
  "editors",
  "taxonomy",
];

const COMPONENT_TABS: BuilderTab[] = ["fields", "details", "json"];

const DEFAULT_CREATE_FORM: CreateFormState = {
  key: "",
  name: "",
  description: "",
  modelKind: "collection_type",
};

const DEFAULT_FIELD_FORM: FieldFormState = {
  key: "",
  label: "",
  scalar: "text",
  required: false,
  configKind: "plain",
};

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function readFieldRow(key: string, value: unknown): FieldRow {
  const record = readRecord(value) ?? {};
  return {
    key,
    label: readString(record.label) ?? key,
    scalar: (readString(record.scalar) ??
      readString(record.fieldType) ??
      "json") as AdminContentModelFieldScalar,
    required: record.required === true || record.isRequired === true,
    config: readRecord(record.config),
  };
}

function fieldsFromSchema(model: AdminContentModel): FieldRow[] {
  const fieldSchema = readRecord(model.fieldSchema);
  if (fieldSchema) {
    return Object.entries(fieldSchema).map(([key, value]) => readFieldRow(key, value));
  }

  const boundaries = model.contractRegistry?.boundaries;
  return [...(boundaries?.systemFields ?? []), ...(boundaries?.customFields ?? [])].map((field) =>
    readFieldRow(field.key, field),
  );
}

function modelKindLabel(t: (key: string) => string, kind: AdminContentModelKind): string {
  return t(`CONTENT_MODELS_KIND_${kind.toUpperCase()}`);
}

function tabLabel(t: (key: string) => string, tab: BuilderTab): string {
  return t(`CONTENT_MODELS_TAB_${tab.toUpperCase()}`);
}

function fieldConfig(kind: FieldConfigKind): Record<string, unknown> | null {
  if (kind === "media") {
    return {
      kind: "media",
      assetScope: "project",
      assetIdStorage: "internal_project_asset_id",
      repeatable: true,
    };
  }
  if (kind === "component") {
    return { kind: "component", componentKey: "seo_card", repeatable: true };
  }
  if (kind === "dynamic_zone") {
    return { kind: "dynamic_zone", components: ["seo_card"], repeatable: true };
  }
  return null;
}

function initialFieldsForKind(kind: AdminContentModelKind) {
  if (kind === "component") return [];
  return [{ key: "title", label: "Title", scalar: "text" as const, required: true }];
}

function replaceModel(models: AdminContentModel[] | undefined, next: AdminContentModel) {
  const existing = models ?? [];
  if (existing.some((model) => model.id === next.id)) {
    return existing.map((model) => (model.id === next.id ? next : model));
  }
  return [next, ...existing];
}

function Panel(props: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[28px] border border-border/60 bg-card/70 p-5">
      <div className="text-sm font-semibold text-foreground">{props.title}</div>
      {props.description ? (
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{props.description}</p>
      ) : null}
      <div className="mt-5">{props.children}</div>
    </section>
  );
}

export function ContentModelsControlCenterPage(props: { projectId: string }) {
  const { t } = useTranslation("content");
  const queryClient = useQueryClient();
  const permissionAccess = useProjectPermissionAccess(props.projectId);
  const queryKey = buildContentModelsQueryKey(props.projectId);
  const canManageModels = permissionAccess.hasAction("project:content:models:write");
  const modelsQuery = useQuery({
    queryKey,
    queryFn: () => listAllContentModels(props.projectId),
  });

  const [selectedModelId, setSelectedModelId] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<BuilderTab>("fields");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createTab, setCreateTab] = React.useState<CreateTab>("manual");
  const [createForm, setCreateForm] = React.useState<CreateFormState>(DEFAULT_CREATE_FORM);
  const [fieldForm, setFieldForm] = React.useState<FieldFormState>(DEFAULT_FIELD_FORM);
  const [jsonPreview, setJsonPreview] = React.useState<AdminContentModelJsonPreview | null>(null);

  const models = React.useMemo(
    () => sortContentModelsByPresentation(modelsQuery.data ?? []),
    [modelsQuery.data],
  );
  const selectedModel = models.find((model) => model.id === selectedModelId) ?? models[0] ?? null;
  const fields = React.useMemo(
    () => (selectedModel ? fieldsFromSchema(selectedModel) : []),
    [selectedModel],
  );
  const availableTabs =
    selectedModel?.modelKind === "component" ? COMPONENT_TABS : CONTENT_TYPE_TABS;

  React.useEffect(() => {
    if (!selectedModelId && models[0]) setSelectedModelId(models[0].id);
  }, [models, selectedModelId]);

  React.useEffect(() => {
    if (!availableTabs.includes(activeTab)) setActiveTab("fields");
    setJsonPreview(null);
  }, [activeTab, availableTabs, selectedModel?.id]);

  const updateCachedModel = React.useCallback(
    (model: AdminContentModel) => {
      queryClient.setQueryData<AdminContentModel[]>(queryKey, (current) =>
        replaceModel(current, model),
      );
      setSelectedModelId(model.id);
    },
    [queryClient, queryKey],
  );

  const createMutation = useMutation({
    mutationFn: () =>
      createContentModel(props.projectId, {
        key: createForm.key.trim(),
        name: createForm.name.trim(),
        description: createForm.description.trim() || null,
        modelKind: createForm.modelKind,
        fields: initialFieldsForKind(createForm.modelKind),
        relations: [],
        capabilities: ["queryable"],
        routing: { mode: "none" },
        workflow: { states: ["draft"], initialState: "draft" },
        views: [],
      }),
    onSuccess: (model) => {
      updateCachedModel(model);
      setCreateOpen(false);
      setCreateForm(DEFAULT_CREATE_FORM);
      setCreateTab("manual");
    },
    onError: notifyError,
  });

  const addFieldMutation = useMutation({
    mutationFn: () => {
      if (!selectedModel) throw new Error("CONTENT_MODELS_SELECT_MODEL_REQUIRED");
      return addContentModelField(props.projectId, selectedModel.id, {
        key: fieldForm.key.trim(),
        label: fieldForm.label.trim(),
        scalar: fieldForm.scalar,
        required: fieldForm.required,
        config: fieldConfig(fieldForm.configKind),
      });
    },
    onSuccess: (model) => {
      updateCachedModel(model);
      setFieldForm(DEFAULT_FIELD_FORM);
    },
    onError: notifyError,
  });

  const updateFieldMutation = useMutation({
    mutationFn: ({ fieldKey }: { fieldKey: string }) => {
      if (!selectedModel) throw new Error("CONTENT_MODELS_SELECT_MODEL_REQUIRED");
      return updateContentModelField(props.projectId, selectedModel.id, fieldKey, {
        required: true,
      });
    },
    onSuccess: updateCachedModel,
    onError: notifyError,
  });

  const reorderFieldMutation = useMutation({
    mutationFn: ({ fieldKey }: { fieldKey: string }) => {
      if (!selectedModel) throw new Error("CONTENT_MODELS_SELECT_MODEL_REQUIRED");
      const index = fields.findIndex((field) => field.key === fieldKey);
      if (index <= 0) return Promise.resolve(selectedModel);
      const fieldKeys = fields.map((field) => field.key);
      const previous = fieldKeys[index - 1];
      fieldKeys[index - 1] = fieldKey;
      fieldKeys[index] = previous ?? fieldKey;
      return reorderContentModelFields(props.projectId, selectedModel.id, { fieldKeys });
    },
    onSuccess: updateCachedModel,
    onError: notifyError,
  });

  const deleteFieldMutation = useMutation({
    mutationFn: ({ fieldKey }: { fieldKey: string }) => {
      if (!selectedModel) throw new Error("CONTENT_MODELS_SELECT_MODEL_REQUIRED");
      return deleteContentModelField(props.projectId, selectedModel.id, fieldKey);
    },
    onSuccess: updateCachedModel,
    onError: notifyError,
  });

  const previewMutation = useMutation({
    mutationFn: () => {
      if (!selectedModel) throw new Error("CONTENT_MODELS_SELECT_MODEL_REQUIRED");
      return getContentModelJsonPreview(props.projectId, selectedModel.id);
    },
    onSuccess: setJsonPreview,
    onError: notifyError,
  });

  const selectedLabel = selectedModel
    ? getContentTypeLabel({
        modelKey: selectedModel.key,
        fallbackName: selectedModel.name,
        fallbackLabel: selectedModel.key,
        t,
      })
    : null;
  const selectedDescription = selectedModel
    ? getContentTypeDescription({
        modelKey: selectedModel.key,
        fallbackDescription: selectedModel.description,
        t,
      })
    : null;

  if (modelsQuery.isLoading) {
    return (
      <DefaultPage title={t("CONTENT_MODELS_TITLE")} showFavoriteToggle={false}>
        <div>{t("CONTENT_MODELS_LOADING")}</div>
      </DefaultPage>
    );
  }

  if (modelsQuery.isError) {
    return (
      <DefaultPage title={t("CONTENT_MODELS_TITLE")} showFavoriteToggle={false}>
        <div>{t("CONTENT_MODELS_ERROR")}</div>
      </DefaultPage>
    );
  }

  return (
    <DefaultPage title={t("CONTENT_MODELS_TITLE")} showFavoriteToggle={false}>
      <div
        className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]"
        data-testid="content-model-builder-surface"
      >
        <aside className="rounded-[28px] border border-border/60 bg-card/70 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-foreground">
                {t("CONTENT_MODELS_LIST_TITLE")}
              </div>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {t("CONTENT_MODELS_LIST_DESC")}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={!canManageModels}
              onClick={() => setCreateOpen(true)}
            >
              {t("CONTENT_MODELS_CREATE_ACTION")}
            </Button>
          </div>

          <div className="mt-4 grid gap-2">
            {models.map((model) => {
              const label = getContentTypeLabel({
                modelKey: model.key,
                fallbackName: model.name,
                fallbackLabel: model.key,
                t,
              });
              const active = model.id === selectedModel?.id;
              return (
                <button
                  key={model.id}
                  type="button"
                  aria-label={label}
                  className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                    active
                      ? "border-border bg-background text-foreground"
                      : "border-border/60 bg-transparent text-muted-foreground hover:bg-muted/40"
                  }`}
                  onClick={() => {
                    setSelectedModelId(model.id);
                    setActiveTab("fields");
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">{label}</span>
                    <span className="rounded-full border border-border/60 px-2 py-0.5 text-[11px]">
                      {modelKindLabel(t, model.modelKind ?? "collection_type")}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{model.key}</div>
                </button>
              );
            })}
            {models.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
                {t("CONTENT_MODELS_EMPTY")}
              </div>
            ) : null}
          </div>
        </aside>

        {selectedModel && selectedLabel ? (
          <section className="space-y-5">
            <div className="rounded-[32px] border border-border/60 bg-card/70 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    {modelKindLabel(t, selectedModel.modelKind ?? "collection_type")}
                  </div>
                  <h2 className="mt-2 text-2xl font-semibold text-foreground">{selectedLabel}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                    {selectedDescription}
                  </p>
                </div>
                <div className="grid gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <div className="text-muted-foreground">
                      {t("CONTENT_MODELS_FIELD_MODEL_KEY")}
                    </div>
                    <div className="mt-1 font-medium text-foreground">{selectedModel.key}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">{t("CONTENT_MODELS_FIELD_COUNT")}</div>
                    <div className="mt-1 font-medium text-foreground">{fields.length}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">{t("CONTENT_MODELS_REVISION")}</div>
                    <div className="mt-1 font-medium text-foreground">
                      {selectedModel.draftContractRevision ?? 1}
                    </div>
                  </div>
                </div>
              </div>

              <div
                className="mt-6 flex flex-wrap gap-2"
                role="tablist"
                aria-label={t("CONTENT_MODELS_TABS_LABEL")}
              >
                {availableTabs.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab}
                    className={`rounded-full border px-3 py-1.5 text-sm ${
                      activeTab === tab
                        ? "border-border bg-background text-foreground"
                        : "border-border/60 text-muted-foreground hover:bg-muted/40"
                    }`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tabLabel(t, tab)}
                  </button>
                ))}
              </div>
            </div>

            {!canManageModels ? (
              <AccessNoticeAlert description={t("CONTENT_MODELS_NO_ACCESS_DESC")} />
            ) : null}

            {activeTab === "fields" ? (
              <Panel
                title={t("CONTENT_MODELS_FIELDS_TITLE")}
                description={t("CONTENT_MODELS_FIELDS_DESC")}
              >
                <div className="grid gap-3">
                  {fields.map((field) => (
                    <div
                      key={field.key}
                      className="grid gap-3 rounded-2xl border border-border/60 bg-background px-4 py-4 lg:grid-cols-[1fr_auto]"
                    >
                      <div>
                        <div className="text-sm font-medium text-foreground">{field.label}</div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {field.key} · {field.scalar}
                          {field.required ? ` · ${t("CONTENT_MODELS_FIELD_REQUIRED")}` : ""}
                        </div>
                        {field.config ? (
                          <pre className="mt-3 overflow-x-auto text-xs leading-5 text-muted-foreground">
                            {JSON.stringify(field.config, null, 2)}
                          </pre>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-start gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={!canManageModels || field.required}
                          onClick={() => updateFieldMutation.mutate({ fieldKey: field.key })}
                        >
                          {t("CONTENT_MODELS_FIELD_MARK_REQUIRED")}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={!canManageModels}
                          onClick={() => reorderFieldMutation.mutate({ fieldKey: field.key })}
                        >
                          {t("CONTENT_MODELS_FIELD_MOVE_UP")}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={!canManageModels}
                          onClick={() => deleteFieldMutation.mutate({ fieldKey: field.key })}
                        >
                          {t("CONTENT_MODELS_FIELD_DELETE")}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 grid gap-3 rounded-2xl border border-border/60 bg-background p-4 lg:grid-cols-[1fr_1fr_160px_120px_190px_auto]">
                  <Input
                    aria-label={t("CONTENT_MODELS_FIELD_KEY")}
                    placeholder={t("CONTENT_MODELS_FIELD_KEY")}
                    value={fieldForm.key}
                    onChange={(event) =>
                      setFieldForm((current) => ({ ...current, key: event.target.value }))
                    }
                  />
                  <Input
                    aria-label={t("CONTENT_MODELS_FIELD_LABEL")}
                    placeholder={t("CONTENT_MODELS_FIELD_LABEL")}
                    value={fieldForm.label}
                    onChange={(event) =>
                      setFieldForm((current) => ({ ...current, label: event.target.value }))
                    }
                  />
                  <select
                    aria-label={t("CONTENT_MODELS_FIELD_SCALAR")}
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={fieldForm.scalar}
                    onChange={(event) =>
                      setFieldForm((current) => ({
                        ...current,
                        scalar: event.target.value as AdminContentModelFieldScalar,
                      }))
                    }
                  >
                    {FIELD_SCALAR_OPTIONS.map((scalar) => (
                      <option key={scalar} value={scalar}>
                        {scalar}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={fieldForm.required}
                      onChange={(event) =>
                        setFieldForm((current) => ({ ...current, required: event.target.checked }))
                      }
                    />
                    {t("CONTENT_MODELS_FIELD_REQUIRED")}
                  </label>
                  <select
                    aria-label={t("CONTENT_MODELS_FIELD_CONFIG_KIND")}
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={fieldForm.configKind}
                    onChange={(event) =>
                      setFieldForm((current) => ({
                        ...current,
                        configKind: event.target.value as FieldConfigKind,
                      }))
                    }
                  >
                    <option value="plain">{t("CONTENT_MODELS_FIELD_CONFIG_PLAIN")}</option>
                    <option value="media">{t("CONTENT_MODELS_FIELD_CONFIG_MEDIA")}</option>
                    <option value="component">{t("CONTENT_MODELS_FIELD_CONFIG_COMPONENT")}</option>
                    <option value="dynamic_zone">
                      {t("CONTENT_MODELS_FIELD_CONFIG_DYNAMIC_ZONE")}
                    </option>
                  </select>
                  <Button
                    type="button"
                    disabled={!canManageModels || !fieldForm.key.trim() || !fieldForm.label.trim()}
                    onClick={() => addFieldMutation.mutate()}
                  >
                    {t("CONTENT_MODELS_FIELD_ADD")}
                  </Button>
                </div>
              </Panel>
            ) : null}

            {activeTab === "details" ? (
              <Panel
                title={t("CONTENT_MODELS_DETAILS_TITLE")}
                description={t("CONTENT_MODELS_DETAILS_DESC")}
              >
                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <div className="text-xs text-muted-foreground">
                      {t("CONTENT_MODELS_FIELD_NAME")}
                    </div>
                    <div className="mt-2 text-sm font-medium text-foreground">
                      {selectedModel.name}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      {t("CONTENT_MODELS_FIELD_DESCRIPTION")}
                    </div>
                    <div className="mt-2 text-sm font-medium text-foreground">
                      {selectedModel.description || t("CONTENT_MODELS_OPTION_UNSET")}
                    </div>
                  </div>
                </div>
              </Panel>
            ) : null}

            {activeTab === "json" ? (
              <Panel
                title={t("CONTENT_MODELS_JSON_TITLE")}
                description={t("CONTENT_MODELS_JSON_DESC")}
              >
                <Button type="button" variant="secondary" onClick={() => previewMutation.mutate()}>
                  {t("CONTENT_MODELS_JSON_REFRESH")}
                </Button>
                <pre className="mt-4 max-h-[520px] overflow-auto rounded-2xl border border-border/60 bg-background p-4 text-xs leading-5">
                  {JSON.stringify(jsonPreview?.payload ?? selectedModel.fieldSchema ?? {}, null, 2)}
                </pre>
              </Panel>
            ) : null}

            {activeTab !== "fields" && activeTab !== "details" && activeTab !== "json" ? (
              <Panel
                title={tabLabel(t, activeTab)}
                description={t("CONTENT_MODELS_RESERVED_TAB_DESC")}
              >
                <div className="text-sm text-muted-foreground">
                  {t("CONTENT_MODELS_RESERVED_TAB_BODY")}
                </div>
              </Panel>
            ) : null}
          </section>
        ) : (
          <section className="rounded-[32px] border border-dashed border-border/70 bg-card/50 p-10 text-sm text-muted-foreground">
            {t("CONTENT_MODELS_EMPTY")}
          </section>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent data-testid="content-model-create-dialog">
          <DialogHeader>
            <DialogTitle>{t("CONTENT_MODELS_CREATE_TITLE")}</DialogTitle>
            <DialogDescription>{t("CONTENT_MODELS_CREATE_DESC")}</DialogDescription>
          </DialogHeader>

          <div
            className="flex gap-2"
            role="tablist"
            aria-label={t("CONTENT_MODELS_CREATE_MODE_LABEL")}
          >
            <button
              type="button"
              role="tab"
              aria-selected={createTab === "manual"}
              className="rounded-full border border-border bg-background px-3 py-1.5 text-sm"
              onClick={() => setCreateTab("manual")}
            >
              {t("CONTENT_MODELS_CREATE_MANUAL_TAB")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={createTab === "ai"}
              className="rounded-full border border-border/60 px-3 py-1.5 text-sm text-muted-foreground"
              onClick={() => setCreateTab("ai")}
            >
              {t("CONTENT_MODELS_CREATE_AI_TAB")}
            </button>
          </div>

          {createTab === "manual" ? (
            <div className="grid gap-3">
              <Input
                aria-label={t("CONTENT_MODELS_FIELD_KEY")}
                placeholder={t("CONTENT_MODELS_FIELD_KEY")}
                value={createForm.key}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, key: event.target.value }))
                }
              />
              <Input
                aria-label={t("CONTENT_MODELS_FIELD_NAME")}
                placeholder={t("CONTENT_MODELS_FIELD_NAME")}
                value={createForm.name}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, name: event.target.value }))
                }
              />
              <Textarea
                aria-label={t("CONTENT_MODELS_FIELD_DESCRIPTION")}
                placeholder={t("CONTENT_MODELS_FIELD_DESCRIPTION")}
                value={createForm.description}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, description: event.target.value }))
                }
              />
              <select
                aria-label={t("CONTENT_MODELS_FIELD_MODEL_KIND")}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={createForm.modelKind}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    modelKind: event.target.value as AdminContentModelKind,
                  }))
                }
              >
                {MODEL_KIND_OPTIONS.map((kind) => (
                  <option key={kind} value={kind}>
                    {modelKindLabel(t, kind)}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="rounded-2xl border border-border/60 bg-background p-4 text-sm text-muted-foreground">
              {t("CONTENT_MODELS_CREATE_AI_UNAVAILABLE")}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
              {t("CONTENT_MODELS_CANCEL_ACTION")}
            </Button>
            <Button
              type="button"
              disabled={
                createTab !== "manual" ||
                !createForm.key.trim() ||
                !createForm.name.trim() ||
                createMutation.isPending
              }
              onClick={() => createMutation.mutate()}
            >
              {t("CONTENT_MODELS_CREATE_CONFIRM")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DefaultPage>
  );
}
