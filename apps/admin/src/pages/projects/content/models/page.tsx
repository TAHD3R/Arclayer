import * as React from "react";
import type { RowSelectionState } from "@tanstack/react-table";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  BookOpenIcon,
  GlobeIcon,
  MonitorIcon,
  PlusIcon,
  SettingsIcon,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  buildContentModelsQueryKey,
  createContentModel,
  deleteContentModel,
  listAllContentModels,
  listContentModels,
} from "@/api/content";
import { AccessNoticeAlert } from "@/components/common/access-notice-alert";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { useProjectPermissionAccess } from "@/hooks/use-workspace-permission-access";
import { AdminDataTableSection } from "@/layouts/page-shell/admin-data-table-section";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import {
  rangeSelect,
  selectOrClearOnPlainClick,
  toggleSelect,
  type AssetSelectionState,
} from "@/lib/assets/asset-selection";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { projectContentModelsEditPath } from "@/lib/routing/project-content-routing";
import {
  useDataTable,
  useDataTableRowHeightPreference,
  useDataTableWrapHeadersPreference,
} from "@arclayer/ui/data-table";
import { Button } from "@arclayer/ui/button";

import { ContentModelsActionDialogs } from "./components/content-models-action-dialogs";
import { ContentModelsSelectionToolbar } from "./components/content-models-selection-toolbar";
import { buildContentModelsTableColumns } from "./components/content-models-table-columns";
import { ContentModelsToolbar } from "./components/content-models-toolbar";
import type { ContentModelsFilters, ContentModelsTableQuery, ContentModelsTableRow } from "./types";
import {
  buildContentModelsTableId,
  buildDuplicateContentModelPayload,
  buildReusableBlockContentModelPayload,
  buildSitePageContentModelPayload,
  isReusableBlockContentModel,
  isSitePageContentModel,
  toContentModelsTableQuery,
} from "./utils";

type ContentModelsControlCenterPageProps = {
  projectId: string;
};

function readModelTableSelection(
  rowSelection: RowSelectionState,
  lastActiveId: string | null,
): AssetSelectionState {
  const selectedIds = new Set<string>();
  for (const [id, selected] of Object.entries(rowSelection)) {
    if (selected) selectedIds.add(id);
  }
  return {
    selectedIds,
    lastActiveId,
  };
}

function writeModelTableSelection(selection: AssetSelectionState): RowSelectionState {
  return Object.fromEntries(Array.from(selection.selectedIds, (id) => [id, true]));
}

type ContentModelsBlueprintSummary = {
  pageModelCount: number;
  publishableModelCount: number;
  reusableBlockModelCount: number;
  siteBuilderModelCount: number;
  structuredModelCount: number;
};

type ContentModelsWorkflowState = "active" | "pending" | "ready";

type ContentModelsWorkflowStep = {
  description: string;
  id: string;
  label: string;
  state: ContentModelsWorkflowState;
};

type ContentModelsWorkflowLink = {
  href: string;
  icon: LucideIcon;
  id: string;
  label: string;
};

type ContentModelsAiContractItem = {
  description: string;
  id: string;
  title: string;
};

function buildContentModelsBlueprintSummary(
  models: readonly ContentModelsTableRow[],
): ContentModelsBlueprintSummary {
  return models.reduce<ContentModelsBlueprintSummary>(
    (summary, model) => {
      const isSiteBuilder =
        model.category === "site_builder" ||
        model.capabilities.includes("visual_editable") ||
        model.capabilities.includes("routable");
      const isPage = isSitePageContentModel(model);
      const isReusableBlock = isReusableBlockContentModel(model);
      const isStructured = !isSiteBuilder && model.modelKind !== "component";
      return {
        pageModelCount: summary.pageModelCount + (isPage ? 1 : 0),
        publishableModelCount:
          summary.publishableModelCount + (model.capabilities.includes("publishable") ? 1 : 0),
        reusableBlockModelCount: summary.reusableBlockModelCount + (isReusableBlock ? 1 : 0),
        siteBuilderModelCount: summary.siteBuilderModelCount + (isSiteBuilder ? 1 : 0),
        structuredModelCount: summary.structuredModelCount + (isStructured ? 1 : 0),
      };
    },
    {
      pageModelCount: 0,
      publishableModelCount: 0,
      reusableBlockModelCount: 0,
      siteBuilderModelCount: 0,
      structuredModelCount: 0,
    },
  );
}

function buildContentModelsWorkflowSteps(
  summary: ContentModelsBlueprintSummary,
  t: (key: string) => string,
): ContentModelsWorkflowStep[] {
  const hasPageModel = summary.pageModelCount > 0;
  const hasReusableBlockModel = summary.reusableBlockModelCount > 0;
  const hasVisualStructure = hasPageModel && hasReusableBlockModel;
  const hasPublishableModel = summary.publishableModelCount > 0;
  const isAiReady = hasPageModel && hasVisualStructure && hasPublishableModel;

  return [
    {
      id: "page-model",
      label: t("CONTENT_MODELS_WORKFLOW_PAGE_MODEL_LABEL"),
      description: t("CONTENT_MODELS_WORKFLOW_PAGE_MODEL_DESC"),
      state: hasPageModel ? "ready" : "active",
    },
    {
      id: "visual-editing",
      label: t("CONTENT_MODELS_WORKFLOW_VISUAL_LABEL"),
      description: t("CONTENT_MODELS_WORKFLOW_VISUAL_DESC"),
      state: hasVisualStructure ? "ready" : hasPageModel ? "active" : "pending",
    },
    {
      id: "publishing",
      label: t("CONTENT_MODELS_WORKFLOW_PUBLISH_LABEL"),
      description: t("CONTENT_MODELS_WORKFLOW_PUBLISH_DESC"),
      state: hasPublishableModel ? "ready" : hasVisualStructure ? "active" : "pending",
    },
    {
      id: "ai-ready",
      label: t("CONTENT_MODELS_WORKFLOW_AI_LABEL"),
      description: t("CONTENT_MODELS_WORKFLOW_AI_DESC"),
      state: isAiReady ? "ready" : hasPageModel ? "active" : "pending",
    },
  ];
}

function ContentModelsWorkflowStrip(props: {
  steps: readonly ContentModelsWorkflowStep[];
  t: (key: string) => string;
}) {
  const stateClassName: Record<ContentModelsWorkflowState, string> = {
    active: "border-primary bg-primary/5 text-primary",
    pending: "border-border bg-muted/40 text-label-secondary",
    ready: "border-positive/30 bg-positive/5 text-positive",
  };

  return (
    <ol className="grid gap-2 md:grid-cols-4" aria-label={props.t("CONTENT_MODELS_WORKFLOW_LABEL")}>
      {props.steps.map((step, index) => (
        <li
          key={step.id}
          className="min-w-0 rounded-md border border-border bg-background px-3 py-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-caption text-label-tertiary">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span
              className={`rounded-sm border px-2 py-0.5 text-caption font-medium ${stateClassName[step.state]}`}
            >
              {props.t(`CONTENT_MODELS_WORKFLOW_STATE_${step.state.toUpperCase()}`)}
            </span>
          </div>
          <p className="mt-3 text-caption font-semibold text-foreground">{step.label}</p>
          <p className="mt-1 text-footnote text-label-secondary">{step.description}</p>
        </li>
      ))}
    </ol>
  );
}

function buildContentModelsWorkflowLinks(
  projectId: string,
  t: (key: string) => string,
): ContentModelsWorkflowLink[] {
  return [
    {
      href: `/projects/${projectId}/editor`,
      icon: MonitorIcon,
      id: "editor",
      label: t("CONTENT_MODELS_WORKFLOW_LINK_EDITOR"),
    },
    {
      href: `/projects/${projectId}/content/library`,
      icon: BookOpenIcon,
      id: "content-library",
      label: t("CONTENT_MODELS_WORKFLOW_LINK_CONTENT_LIBRARY"),
    },
    {
      href: `/projects/${projectId}/website/domain`,
      icon: GlobeIcon,
      id: "website-control",
      label: t("CONTENT_MODELS_WORKFLOW_LINK_WEBSITE_CONTROL"),
    },
    {
      href: `/projects/${projectId}/website/config`,
      icon: SettingsIcon,
      id: "website-config",
      label: t("CONTENT_MODELS_WORKFLOW_LINK_WEBSITE_CONFIG"),
    },
  ];
}

function ContentModelsWorkflowLinks(props: {
  links: readonly ContentModelsWorkflowLink[];
  t: (key: string) => string;
}) {
  return (
    <nav
      aria-label={props.t("CONTENT_MODELS_WORKFLOW_LINKS_LABEL")}
      className="grid gap-2 sm:grid-cols-2"
      data-testid="content-models-workflow-links"
    >
      {props.links.map((link) => {
        const Icon = link.icon;
        return (
          <a
            key={link.id}
            href={link.href}
            className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-footnote font-medium text-label-primary transition-colors hover:bg-muted"
          >
            <Icon className="size-4 shrink-0 text-label-secondary" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{link.label}</span>
          </a>
        );
      })}
    </nav>
  );
}

function buildContentModelsAiContractItems(
  t: (key: string) => string,
): ContentModelsAiContractItem[] {
  return [
    {
      id: "stable-keys",
      title: t("CONTENT_MODELS_BLUEPRINT_AI_CONTRACT_STABLE_KEYS_TITLE"),
      description: t("CONTENT_MODELS_BLUEPRINT_AI_CONTRACT_STABLE_KEYS_DESC"),
    },
    {
      id: "field-schema",
      title: t("CONTENT_MODELS_BLUEPRINT_AI_CONTRACT_FIELD_SCHEMA_TITLE"),
      description: t("CONTENT_MODELS_BLUEPRINT_AI_CONTRACT_FIELD_SCHEMA_DESC"),
    },
    {
      id: "route-surface",
      title: t("CONTENT_MODELS_BLUEPRINT_AI_CONTRACT_ROUTE_SURFACE_TITLE"),
      description: t("CONTENT_MODELS_BLUEPRINT_AI_CONTRACT_ROUTE_SURFACE_DESC"),
    },
    {
      id: "release-source",
      title: t("CONTENT_MODELS_BLUEPRINT_AI_CONTRACT_RELEASE_SOURCE_TITLE"),
      description: t("CONTENT_MODELS_BLUEPRINT_AI_CONTRACT_RELEASE_SOURCE_DESC"),
    },
  ];
}

function ContentModelsAiContractList(props: {
  items: readonly ContentModelsAiContractItem[];
  t: (key: string) => string;
}) {
  return (
    <ul
      aria-label={props.t("CONTENT_MODELS_BLUEPRINT_AI_CONTRACT_CHECKLIST_LABEL")}
      className="mt-3 grid gap-2 sm:grid-cols-2"
      data-testid="content-models-ai-contract-list"
    >
      {props.items.map((item) => (
        <li
          key={item.id}
          className="min-w-0 rounded-sm border border-border bg-background px-3 py-2"
        >
          <p className="text-caption font-semibold text-foreground">{item.title}</p>
          <p className="mt-1 text-footnote text-label-secondary">{item.description}</p>
        </li>
      ))}
    </ul>
  );
}

function ContentModelsBlueprintPanel(props: {
  canManageModels: boolean;
  creatingPageModel: boolean;
  creatingReusableBlockModel: boolean;
  pageModel: ContentModelsTableRow | null;
  reusableBlockModel: ContentModelsTableRow | null;
  onCreatePageModel: () => void;
  onCreateReusableBlockModel: () => void;
  onOpenModel: (model: ContentModelsTableRow) => void;
  projectId: string;
  summary: ContentModelsBlueprintSummary;
  t: (key: string) => string;
}) {
  const nextActionKey =
    props.summary.pageModelCount === 0
      ? "CONTENT_MODELS_BLUEPRINT_NEXT_PAGE_MODEL"
      : props.summary.reusableBlockModelCount === 0
        ? "CONTENT_MODELS_BLUEPRINT_NEXT_SITE_BUILDER"
        : props.summary.publishableModelCount === 0
          ? "CONTENT_MODELS_BLUEPRINT_NEXT_PUBLISHABLE"
          : "CONTENT_MODELS_BLUEPRINT_NEXT_READY";
  const metrics = [
    {
      id: "page-models",
      label: props.t("CONTENT_MODELS_BLUEPRINT_METRIC_PAGE_MODELS"),
      value: props.summary.pageModelCount,
    },
    {
      id: "site-builder",
      label: props.t("CONTENT_MODELS_BLUEPRINT_METRIC_SITE_BUILDER"),
      value: props.summary.siteBuilderModelCount,
    },
    {
      id: "reusable-blocks",
      label: props.t("CONTENT_MODELS_BLUEPRINT_METRIC_REUSABLE_BLOCKS"),
      value: props.summary.reusableBlockModelCount,
    },
    {
      id: "publishable",
      label: props.t("CONTENT_MODELS_BLUEPRINT_METRIC_PUBLISHABLE"),
      value: props.summary.publishableModelCount,
    },
  ];

  return (
    <section
      aria-label={props.t("CONTENT_MODELS_BLUEPRINT_TITLE")}
      className="mb-6 border-y border-border bg-background py-5"
      data-testid="content-models-blueprint-summary"
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)]">
        <div className="min-w-0 space-y-3">
          <div className="space-y-1">
            <h2 className="font-heading text-lg font-semibold text-foreground">
              {props.t("CONTENT_MODELS_BLUEPRINT_TITLE")}
            </h2>
            <p className="max-w-2xl text-footnote text-label-secondary">
              {props.t("CONTENT_MODELS_BLUEPRINT_DESC")}
            </p>
          </div>
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
            <p className="text-caption font-medium text-foreground">
              {props.t("CONTENT_MODELS_BLUEPRINT_NEXT_LABEL")}
            </p>
            <p className="mt-1 text-footnote text-label-secondary">{props.t(nextActionKey)}</p>
          </div>
          <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
            <p className="text-caption font-medium text-foreground">
              {props.t("CONTENT_MODELS_BLUEPRINT_AI_CONTRACT_TITLE")}
            </p>
            <p className="mt-1 text-footnote text-label-secondary">
              {props.t("CONTENT_MODELS_BLUEPRINT_AI_CONTRACT_DESC")}
            </p>
            <ContentModelsAiContractList
              items={buildContentModelsAiContractItems(props.t)}
              t={props.t}
            />
          </div>
          <ContentModelsWorkflowLinks
            links={buildContentModelsWorkflowLinks(props.projectId, props.t)}
            t={props.t}
          />
          <ContentModelsWorkflowStrip
            steps={buildContentModelsWorkflowSteps(props.summary, props.t)}
            t={props.t}
          />
          <div className="flex flex-wrap items-center gap-2">
            {props.pageModel ? (
              <Button
                type="button"
                variant="default"
                onClick={() => props.onOpenModel(props.pageModel as ContentModelsTableRow)}
              >
                {props.t("CONTENT_MODELS_BLUEPRINT_ACTION_OPEN_PAGE_MODEL")}
              </Button>
            ) : (
              <Button
                type="button"
                variant="default"
                disabled={!props.canManageModels || props.creatingPageModel}
                onClick={props.onCreatePageModel}
              >
                <PlusIcon className="size-4" />
                {props.t("CONTENT_MODELS_BLUEPRINT_ACTION_CREATE_MODEL")}
              </Button>
            )}
            {props.reusableBlockModel ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => props.onOpenModel(props.reusableBlockModel as ContentModelsTableRow)}
              >
                {props.t("CONTENT_MODELS_BLUEPRINT_ACTION_OPEN_REUSABLE_BLOCK_MODEL")}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={!props.canManageModels || props.creatingReusableBlockModel}
                onClick={props.onCreateReusableBlockModel}
              >
                <PlusIcon className="size-4" />
                {props.t("CONTENT_MODELS_BLUEPRINT_ACTION_CREATE_REUSABLE_BLOCK_MODEL")}
              </Button>
            )}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4">
          {metrics.map((item) => (
            <div key={item.id} className="rounded-md border border-border bg-background px-3 py-3">
              <dt className="text-caption text-label-secondary">{item.label}</dt>
              <dd className="mt-2 font-heading text-2xl font-semibold text-foreground">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

export function ContentModelsControlCenterPage({ projectId }: ContentModelsControlCenterPageProps) {
  const { t } = useTranslation(["content", "common"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const permissionAccess = useProjectPermissionAccess(projectId);
  const canManageModels = permissionAccess.hasAction("project:content:models:write");
  const [duplicateModel, setDuplicateModel] = React.useState<ContentModelsTableRow | null>(null);
  const [bulkDuplicateOpen, setBulkDuplicateOpen] = React.useState(false);
  const [deleteModelState, setDeleteModelState] = React.useState<ContentModelsTableRow | null>(
    null,
  );
  const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false);
  const [filters, setFilters] = React.useState<ContentModelsFilters>({});
  const [lastSelectedModelId, setLastSelectedModelId] = React.useState<string | null>(null);
  const tableId = React.useMemo(() => buildContentModelsTableId(projectId), [projectId]);
  const [rowHeight, setRowHeight] = useDataTableRowHeightPreference({ tableId });
  const [wrapHeaders, setWrapHeaders] = useDataTableWrapHeadersPreference({ tableId });
  const dateTime = useAdminDateTimeFormatter({ projectId });

  const refreshModels = React.useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: buildContentModelsQueryKey(projectId) }),
      queryClient.invalidateQueries({ queryKey: ["dataTable", tableId] }),
    ]);
  }, [projectId, queryClient, tableId]);

  const openModelEditor = React.useCallback(
    (model: ContentModelsTableRow) => {
      void navigate({ to: projectContentModelsEditPath(projectId, model.id) });
    },
    [navigate, projectId],
  );

  const duplicateMutation = useMutation({
    mutationFn: async (model: ContentModelsTableRow) => {
      const existingModels = await listAllContentModels(projectId);
      return createContentModel(
        projectId,
        buildDuplicateContentModelPayload({ model, existingModels, t }),
      );
    },
    onSuccess: async (model) => {
      await refreshModels();
      setDuplicateModel(null);
      openModelEditor(model);
      notifySuccessText(t("content:CONTENT_MODELS_DUPLICATE_SUCCESS"));
    },
    onError: notifyError,
  });

  const bulkDuplicateMutation = useMutation({
    mutationFn: async (models: ContentModelsTableRow[]) => {
      const existingModels = await listAllContentModels(projectId);
      const knownModels = [...existingModels];
      const payloads = models.map((model) => {
        const payload = buildDuplicateContentModelPayload({
          model,
          existingModels: knownModels,
          t,
        });
        knownModels.push({
          ...model,
          singularKey: payload.singularKey,
          pluralKey: payload.pluralKey,
          name: payload.name,
        });
        return payload;
      });

      return Promise.all(payloads.map((payload) => createContentModel(projectId, payload)));
    },
    onSuccess: async (models) => {
      await refreshModels();
      setBulkDuplicateOpen(false);
      tableHook.table.resetRowSelection();
      setLastSelectedModelId(null);
      if (models[0]) openModelEditor(models[0]);
      notifySuccessText(
        t("content:CONTENT_MODELS_BULK_DUPLICATE_SUCCESS", { count: models.length }),
      );
    },
    onError: notifyError,
  });

  const createSitePageModelMutation = useMutation({
    mutationFn: async () => {
      const existingModels = await listAllContentModels(projectId);
      const existingPageModel = existingModels.find(isSitePageContentModel);
      if (existingPageModel) return { created: false, model: existingPageModel };

      const model = await createContentModel(projectId, buildSitePageContentModelPayload());
      return { created: true, model };
    },
    onSuccess: async ({ created, model }) => {
      if (created) {
        await refreshModels();
        notifySuccessText(t("content:CONTENT_MODELS_BLUEPRINT_CREATE_SUCCESS"));
      }
      openModelEditor(model);
    },
    onError: notifyError,
  });

  const createReusableBlockModelMutation = useMutation({
    mutationFn: async () => {
      const existingModels = await listAllContentModels(projectId);
      const existingReusableBlockModel = existingModels.find(isReusableBlockContentModel);
      if (existingReusableBlockModel) return { created: false, model: existingReusableBlockModel };

      const model = await createContentModel(projectId, buildReusableBlockContentModelPayload());
      return { created: true, model };
    },
    onSuccess: async ({ created, model }) => {
      if (created) {
        await refreshModels();
        notifySuccessText(t("content:CONTENT_MODELS_BLUEPRINT_CREATE_REUSABLE_BLOCK_SUCCESS"));
      }
      openModelEditor(model);
    },
    onError: notifyError,
  });

  const deleteMutation = useMutation({
    mutationFn: async (modelId: string) => deleteContentModel(projectId, modelId),
    onError: notifyError,
  });

  const columns = React.useMemo(
    () =>
      buildContentModelsTableColumns({
        t,
        canManageModels,
        pending:
          duplicateMutation.isPending ||
          bulkDuplicateMutation.isPending ||
          deleteMutation.isPending,
        formatDateTime: (value) => dateTime.formatDateTime(value, { emptyValue: "" }),
        onEdit: openModelEditor,
        onDuplicate: setDuplicateModel,
        onDelete: setDeleteModelState,
      }),
    [
      bulkDuplicateMutation.isPending,
      canManageModels,
      dateTime.formatDateTime,
      deleteMutation.isPending,
      duplicateMutation.isPending,
      openModelEditor,
      t,
    ],
  );

  const tableQuery = React.useMemo(() => toContentModelsTableQuery(filters), [filters]);
  const tableHook = useDataTable<ContentModelsTableRow, ContentModelsTableQuery>({
    tableId,
    columns,
    fetcher: (params) => listContentModels(projectId, params),
    extraQuery: tableQuery,
    initialState: {
      pageSize: 50,
      sorting: [{ id: "updatedAt", desc: true }],
    },
    rowSelection: {
      enabled: true,
      getRowId: (row) => row.id,
    },
    storage: {
      visibility: { keyPrefix: "arclayer:admin:dataTable:visibility", version: "v3" },
      preferences: { keyPrefix: "arclayer:admin:dataTable:preferences", version: "v3" },
    },
  });

  const selectedModels = tableHook.table.getSelectedRowModel().rows.map((row) => row.original);
  const selectedCount = selectedModels.length;
  const hasActiveQuery = Boolean(tableHook.searchInput.trim()) || Object.keys(filters).length > 0;
  const orderedModelIds = tableHook.table.getRowModel().rows.map((row) => row.original.id);
  const visibleModels = tableHook.table.getRowModel().rows.map((row) => row.original);
  const blueprintSummary = React.useMemo(
    () => buildContentModelsBlueprintSummary(visibleModels),
    [visibleModels],
  );
  const firstSiteModel = React.useMemo(
    () => visibleModels.find((model) => isSitePageContentModel(model)) ?? null,
    [visibleModels],
  );
  const reusableBlockModel = React.useMemo(
    () => visibleModels.find((model) => isReusableBlockContentModel(model)) ?? null,
    [visibleModels],
  );
  const openCreateModel = React.useCallback(() => {
    void navigate({
      to: "/projects/$projectId/content/models/edit",
      params: { projectId },
      search: { create: true },
    });
  }, [navigate, projectId]);
  const handleRowClick = React.useCallback(
    (
      model: ContentModelsTableRow,
      event: Pick<
        React.MouseEvent<HTMLTableRowElement>,
        "detail" | "metaKey" | "ctrlKey" | "shiftKey" | "preventDefault"
      >,
    ) => {
      if (event.detail >= 2) {
        event.preventDefault();
        openModelEditor(model);
        return;
      }

      const currentSelection = readModelTableSelection(
        tableHook.table.getState().rowSelection,
        lastSelectedModelId,
      );
      const nextSelection = event.shiftKey
        ? rangeSelect(currentSelection, model.id, orderedModelIds)
        : event.metaKey || event.ctrlKey
          ? toggleSelect(currentSelection, model.id)
          : selectOrClearOnPlainClick(currentSelection, model.id, event.detail);

      tableHook.table.setRowSelection(writeModelTableSelection(nextSelection));
      setLastSelectedModelId(nextSelection.lastActiveId);
    },
    [lastSelectedModelId, openModelEditor, orderedModelIds, tableHook.table],
  );
  const toolbar = (
    <ContentModelsToolbar
      t={t}
      table={tableHook.table}
      sorting={tableHook.sorting}
      onSortingChange={tableHook.setSorting}
      searchInput={tableHook.searchInput}
      onSearchInputChange={tableHook.setSearchInput}
      filters={filters}
      onFiltersChange={setFilters}
      rowHeight={rowHeight}
      onRowHeightChange={setRowHeight}
      wrapHeaders={wrapHeaders}
      onWrapHeadersChange={setWrapHeaders}
      onRefresh={() => void tableHook.refetch()}
      refreshing={tableHook.isFetching && !tableHook.isLoading}
      onResetColumnVisibility={tableHook.resetColumnVisibility}
    />
  );

  return (
    <>
      <DefaultPage
        title={t("CONTENT_MODELS_TITLE")}
        showFavoriteToggle
        action={
          <Button type="button" disabled={!canManageModels} onClick={openCreateModel}>
            <PlusIcon className="size-4" />
            {t("CONTENT_MODELS_CREATE_CONTENT_TYPE_ACTION")}
          </Button>
        }
      >
        {!canManageModels ? (
          <AccessNoticeAlert
            className="mb-4"
            description={t("content:CONTENT_MODELS_NO_ACCESS_DESC")}
            data-testid="content-models-no-access"
          />
        ) : null}
        <ContentModelsBlueprintPanel
          t={(key) => t(`content:${key}`)}
          summary={blueprintSummary}
          canManageModels={canManageModels}
          creatingPageModel={createSitePageModelMutation.isPending}
          creatingReusableBlockModel={createReusableBlockModelMutation.isPending}
          onCreatePageModel={() => void createSitePageModelMutation.mutateAsync()}
          onCreateReusableBlockModel={() => void createReusableBlockModelMutation.mutateAsync()}
          onOpenModel={openModelEditor}
          pageModel={firstSiteModel}
          projectId={projectId}
          reusableBlockModel={reusableBlockModel}
        />
        <AdminDataTableSection
          table={tableHook.table}
          emptyText={t("content:CONTENT_MODELS_TABLE_EMPTY_TEXT")}
          emptyTitle={
            hasActiveQuery
              ? t("content:CONTENT_MODELS_EMPTY_SEARCH_TITLE")
              : t("content:CONTENT_MODELS_EMPTY_TITLE")
          }
          emptyDescription={
            hasActiveQuery
              ? t("content:CONTENT_MODELS_EMPTY_SEARCH_DESC")
              : t("content:CONTENT_MODELS_EMPTY_DESC")
          }
          emptyExtra={
            hasActiveQuery ? (
              <Button
                variant="default"
                onClick={() => {
                  tableHook.setSearchInput("");
                  setFilters({});
                }}
              >
                {t("content:CONTENT_MODELS_FILTER_RESET")}
              </Button>
            ) : null
          }
          loading={tableHook.isLoading}
          error={tableHook.error}
          onRetry={() => void tableHook.refetch()}
          infiniteScroll={tableHook.infiniteScroll}
          t={t}
          rowHeight={rowHeight}
          wrapHeaders={wrapHeaders}
          refreshing={tableHook.isFetching && !tableHook.isLoading}
          toolbar={toolbar}
          rowClassName={(row) =>
            row.getIsSelected()
              ? "select-none cursor-pointer bg-accent/35 hover:bg-accent/45"
              : "select-none cursor-pointer"
          }
          onRowClick={(row, _rowIndex, event) => handleRowClick(row.original, event)}
        />
      </DefaultPage>
      <ContentModelsSelectionToolbar
        t={t}
        selectedCount={selectedCount}
        canManageModels={canManageModels}
        duplicatePending={bulkDuplicateMutation.isPending}
        deletePending={deleteMutation.isPending}
        onClearSelection={() => {
          tableHook.table.resetRowSelection();
          setLastSelectedModelId(null);
        }}
        onOpenDuplicate={() => setBulkDuplicateOpen(true)}
        onOpenDelete={() => setBulkDeleteOpen(true)}
      />
      <ContentModelsActionDialogs
        duplicateDialog={{
          row: duplicateModel,
          pending: duplicateMutation.isPending,
          onOpenChange: (open) => {
            if (!open && !duplicateMutation.isPending) setDuplicateModel(null);
          },
          onConfirm: async () => {
            if (!duplicateModel) return;
            await duplicateMutation.mutateAsync(duplicateModel);
          },
        }}
        deleteDialog={{
          row: deleteModelState,
          pending: deleteMutation.isPending,
          onOpenChange: (open) => {
            if (!open && !deleteMutation.isPending) setDeleteModelState(null);
          },
          onConfirm: async () => {
            const targetModel = deleteModelState;
            if (!targetModel) return;
            await deleteMutation.mutateAsync(targetModel.id);
            await refreshModels();
            setDeleteModelState(null);
            tableHook.table.resetRowSelection();
            setLastSelectedModelId(null);
            notifySuccessText(t("content:CONTENT_MODELS_DELETE_SUCCESS"));
          },
        }}
        bulkDuplicateDialog={{
          count: selectedCount,
          open: bulkDuplicateOpen,
          pending: bulkDuplicateMutation.isPending,
          onOpenChange: (open) => {
            if (!open && !bulkDuplicateMutation.isPending) setBulkDuplicateOpen(false);
          },
          onConfirm: async () => {
            const targets = selectedModels;
            await bulkDuplicateMutation.mutateAsync(targets);
          },
        }}
        bulkDeleteDialog={{
          count: selectedCount,
          open: bulkDeleteOpen,
          pending: deleteMutation.isPending,
          onOpenChange: (open) => {
            if (!open && !deleteMutation.isPending) setBulkDeleteOpen(false);
          },
          onConfirm: async () => {
            const targets = selectedModels;
            await Promise.all(targets.map((model) => deleteMutation.mutateAsync(model.id)));
            await refreshModels();
            setBulkDeleteOpen(false);
            tableHook.table.resetRowSelection();
            setLastSelectedModelId(null);
            notifySuccessText(
              t("content:CONTENT_MODELS_BULK_DELETE_SUCCESS", { count: targets.length }),
            );
          },
        }}
      />
    </>
  );
}
