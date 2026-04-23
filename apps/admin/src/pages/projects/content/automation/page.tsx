import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import {
  buildAutomationCatalogQueryKey,
  buildAutomationFlowsQueryKey,
  buildAutomationRunsQueryKey,
  createProjectAutomationFlow,
  deleteProjectAutomationFlow,
  getProjectAutomationCatalog,
  listProjectAutomationFlows,
  listProjectAutomationRuns,
  updateProjectAutomationFlow,
} from "@/api/automation";
import { BaseTag } from "@/components/ui/tags";
import { useProjectPermissionAccess } from "@/hooks/use-workspace-permission-access";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import type {
  AdminAutomationCatalog,
  AdminAutomationFlow,
  AdminAutomationFlowStatus,
  AdminAutomationOperationKindValue,
  AdminAutomationRun,
  AdminAutomationTriggerKind,
} from "@/types/api";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { Textarea } from "@arclayer/ui/textarea";

type FlowDraft = {
  description: string;
  id: string | null;
  name: string;
  operationKind: AdminAutomationOperationKindValue;
  operationName: string;
  operationUrl: string;
  status: AdminAutomationFlowStatus;
  triggerKind: AdminAutomationTriggerKind;
};

const DEFAULT_TRIGGER_KIND: AdminAutomationTriggerKind = "publish_completed";
const DEFAULT_OPERATION_KIND: AdminAutomationOperationKindValue = "webhook";

function createEmptyDraft(catalog?: AdminAutomationCatalog): FlowDraft {
  return {
    description: "",
    id: null,
    name: "",
    operationKind: catalog?.operations?.[0]?.kind ?? DEFAULT_OPERATION_KIND,
    operationName: "",
    operationUrl: "",
    status: "active",
    triggerKind: catalog?.triggers?.[0]?.kind ?? DEFAULT_TRIGGER_KIND,
  };
}

function draftFromFlow(flow: AdminAutomationFlow, catalog?: AdminAutomationCatalog): FlowDraft {
  const operation = flow.operations[0] ?? null;
  return {
    description: flow.description ?? "",
    id: flow.id,
    name: flow.name,
    operationKind: operation?.kind ?? catalog?.operations?.[0]?.kind ?? DEFAULT_OPERATION_KIND,
    operationName: operation?.name ?? "",
    operationUrl: typeof operation?.config?.url === "string" ? operation.config.url : "",
    status: flow.status,
    triggerKind: flow.triggerKind,
  };
}

function buildFlowPayload(draft: FlowDraft) {
  const config = draft.operationUrl.trim() ? { url: draft.operationUrl.trim() } : {};
  return {
    description: draft.description.trim() || null,
    name: draft.name.trim(),
    operations: [
      {
        config,
        kind: draft.operationKind,
        name: draft.operationName.trim() || draft.name.trim(),
        sortOrder: 0,
      },
    ],
    status: draft.status,
    triggerKind: draft.triggerKind,
  };
}

function FlowStatusTag(props: { status: AdminAutomationFlowStatus }) {
  const { t } = useTranslation("content");
  return (
    <BaseTag color={props.status === "active" ? "green" : "default"}>
      {props.status === "active"
        ? t("CONTENT_AUTOMATION_STATUS_ACTIVE")
        : t("CONTENT_AUTOMATION_STATUS_DISABLED")}
    </BaseTag>
  );
}

function RunStatusTag(props: { status: AdminAutomationRun["status"] }) {
  const { t } = useTranslation("content");
  const color =
    props.status === "succeeded"
      ? "green"
      : props.status === "failed" || props.status === "dead_letter"
        ? "red"
        : "gold";
  return (
    <BaseTag color={color}>
      {t(`CONTENT_AUTOMATION_RUN_STATUS_${props.status.toUpperCase()}`)}
    </BaseTag>
  );
}

function formatTimestamp(value?: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function FlowList(props: {
  flows: AdminAutomationFlow[];
  onSelect: (flow: AdminAutomationFlow) => void;
  selectedFlowId: string | null;
}) {
  const { t } = useTranslation("content");

  if (props.flows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 bg-background/80 px-5 py-6 text-sm text-muted-foreground">
        {t("CONTENT_AUTOMATION_EMPTY")}
      </div>
    );
  }

  return (
    <div className="grid gap-3" data-testid="content-automation-flow-list">
      {props.flows.map((flow) => {
        const operation = flow.operations[0] ?? null;
        const selected = props.selectedFlowId === flow.id;
        return (
          <button
            key={flow.id}
            type="button"
            onClick={() => props.onSelect(flow)}
            className={
              selected
                ? "grid gap-3 rounded-2xl border border-primary/50 bg-primary/5 px-4 py-4 text-left shadow-sm"
                : "grid gap-3 rounded-2xl border border-border/60 bg-background/80 px-4 py-4 text-left transition hover:border-border hover:bg-background"
            }
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground">{flow.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">{flow.triggerEvent}</div>
              </div>
              <FlowStatusTag status={flow.status} />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <BaseTag color="default">{flow.triggerKind}</BaseTag>
              {operation ? <BaseTag color="blue">{operation.kind}</BaseTag> : null}
              <span>
                {t("CONTENT_AUTOMATION_RETRY_LIMIT")}: {flow.retryLimit}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function RunsPanel(props: { runs: AdminAutomationRun[] }) {
  const { t } = useTranslation("content");
  const latestRun = props.runs[0] ?? null;

  return (
    <section className="rounded-[28px] border border-border/60 bg-card/60 p-5">
      <div className="text-sm font-semibold text-foreground">
        {t("CONTENT_AUTOMATION_RUNS_TITLE")}
      </div>
      <div className="mt-1 text-sm leading-6 text-muted-foreground">
        {t("CONTENT_AUTOMATION_RUNS_DESC")}
      </div>

      <div className="mt-5 grid gap-3">
        {props.runs.length > 0 ? (
          props.runs.slice(0, 5).map((run) => (
            <div
              key={run.id}
              className="rounded-2xl border border-border/60 bg-background/80 px-4 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <RunStatusTag status={run.status} />
                <span className="text-xs text-muted-foreground">
                  {formatTimestamp(run.completedAt ?? run.createdAt)}
                </span>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">{run.triggerEvent}</div>
              {run.error ? <div className="mt-2 text-sm text-destructive">{run.error}</div> : null}
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-border/70 bg-background/80 px-4 py-4 text-sm text-muted-foreground">
            {t("CONTENT_AUTOMATION_RUNS_EMPTY")}
          </div>
        )}
      </div>

      {latestRun?.logs?.length ? (
        <div className="mt-5 border-t border-border/60 pt-4">
          <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {t("CONTENT_AUTOMATION_RUN_LOGS_TITLE")}
          </div>
          <div className="mt-3 grid gap-2">
            {latestRun.logs.slice(0, 4).map((log) => (
              <div
                key={log.id}
                className="rounded-2xl border border-border/60 bg-background/80 px-3 py-3 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <BaseTag color={log.level === "error" ? "red" : "default"}>{log.level}</BaseTag>
                  <span className="text-xs text-muted-foreground">
                    {formatTimestamp(log.createdAt)}
                  </span>
                </div>
                <div className="mt-2 text-foreground">{log.message}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function FlowEditor(props: {
  busy: boolean;
  canManage: boolean;
  catalog?: AdminAutomationCatalog;
  draft: FlowDraft;
  onChange: (draft: FlowDraft) => void;
  onDelete: () => void;
  onNew: () => void;
  onSubmit: () => void;
}) {
  const { t } = useTranslation("content");
  const operationDefinition = props.catalog?.operations?.find(
    (operation) => operation.kind === props.draft.operationKind,
  );
  const requiresUrl = operationDefinition?.requiredFields?.includes("url") ?? false;
  const canSubmit =
    props.canManage &&
    props.draft.name.trim().length > 0 &&
    props.draft.operationName.trim().length > 0 &&
    (!requiresUrl || props.draft.operationUrl.trim().length > 0);

  return (
    <section className="rounded-[28px] border border-border/60 bg-card/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">
            {props.draft.id
              ? t("CONTENT_AUTOMATION_EDITOR_EDIT_TITLE")
              : t("CONTENT_AUTOMATION_EDITOR_CREATE_TITLE")}
          </div>
          <div className="mt-1 text-sm leading-6 text-muted-foreground">
            {t("CONTENT_AUTOMATION_EDITOR_DESC")}
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={props.onNew}>
          {t("CONTENT_AUTOMATION_ACTION_NEW")}
        </Button>
      </div>

      <div className="mt-5 grid gap-4">
        <label className="grid gap-2">
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {t("CONTENT_AUTOMATION_FIELD_NAME")}
          </span>
          <Input
            value={props.draft.name}
            disabled={!props.canManage}
            onChange={(event) => props.onChange({ ...props.draft, name: event.target.value })}
          />
        </label>

        <label className="grid gap-2">
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {t("CONTENT_AUTOMATION_FIELD_DESCRIPTION")}
          </span>
          <Textarea
            value={props.draft.description}
            disabled={!props.canManage}
            onChange={(event) =>
              props.onChange({ ...props.draft, description: event.target.value })
            }
          />
        </label>

        <label className="grid gap-2">
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {t("CONTENT_AUTOMATION_FIELD_TRIGGER")}
          </span>
          <select
            value={props.draft.triggerKind}
            disabled={!props.canManage}
            onChange={(event) =>
              props.onChange({
                ...props.draft,
                triggerKind: event.target.value as AdminAutomationTriggerKind,
              })
            }
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
          >
            {(props.catalog?.triggers ?? []).map((trigger) => (
              <option key={trigger.kind} value={trigger.kind}>
                {trigger.label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-3 rounded-2xl border border-border/60 bg-background/80 p-4">
          <div>
            <div className="text-sm font-medium text-foreground">
              {t("CONTENT_AUTOMATION_OPERATION_TITLE")}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {operationDefinition?.description ?? t("CONTENT_AUTOMATION_OPERATION_DESC")}
            </div>
          </div>
          <label className="grid gap-2">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {t("CONTENT_AUTOMATION_FIELD_OPERATION_KIND")}
            </span>
            <select
              value={props.draft.operationKind}
              disabled={!props.canManage}
              onChange={(event) =>
                props.onChange({
                  ...props.draft,
                  operationKind: event.target.value as AdminAutomationOperationKindValue,
                })
              }
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
            >
              {(props.catalog?.operations ?? []).map((operation) => (
                <option key={operation.kind} value={operation.kind}>
                  {operation.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {t("CONTENT_AUTOMATION_FIELD_OPERATION_NAME")}
            </span>
            <Input
              value={props.draft.operationName}
              disabled={!props.canManage}
              onChange={(event) =>
                props.onChange({ ...props.draft, operationName: event.target.value })
              }
            />
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {t("CONTENT_AUTOMATION_FIELD_OPERATION_URL")}
            </span>
            <Input
              value={props.draft.operationUrl}
              disabled={!props.canManage}
              placeholder="https://example.com/webhook"
              onChange={(event) =>
                props.onChange({ ...props.draft, operationUrl: event.target.value })
              }
            />
          </label>
        </div>

        <label className="grid gap-2">
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {t("CONTENT_AUTOMATION_FIELD_STATUS")}
          </span>
          <select
            value={props.draft.status}
            disabled={!props.canManage}
            onChange={(event) =>
              props.onChange({
                ...props.draft,
                status: event.target.value as AdminAutomationFlowStatus,
              })
            }
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
          >
            <option value="active">{t("CONTENT_AUTOMATION_STATUS_ACTIVE")}</option>
            <option value="disabled">{t("CONTENT_AUTOMATION_STATUS_DISABLED")}</option>
          </select>
        </label>

        {!props.canManage ? (
          <div className="rounded-2xl border border-dashed border-border/70 bg-background/80 px-4 py-4 text-sm text-muted-foreground">
            {t("CONTENT_AUTOMATION_NO_ACCESS_DESC")}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={!canSubmit || props.busy}
            loading={props.busy}
            onClick={props.onSubmit}
          >
            {props.draft.id
              ? t("CONTENT_AUTOMATION_ACTION_SAVE")
              : t("CONTENT_AUTOMATION_ACTION_CREATE")}
          </Button>
          {props.draft.id ? (
            <Button
              type="button"
              variant="outline"
              disabled={!props.canManage || props.busy}
              onClick={props.onDelete}
            >
              {t("CONTENT_AUTOMATION_ACTION_DELETE")}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function ContentAutomationPage(props: { projectId: string }) {
  const { t } = useTranslation("content");
  const queryClient = useQueryClient();
  const permissionAccess = useProjectPermissionAccess(props.projectId);
  const [draft, setDraft] = useState<FlowDraft>(() => createEmptyDraft());
  const canManage =
    !permissionAccess.authzQuery.isFetched ||
    permissionAccess.hasAction("project:automation:manage");

  const catalogQuery = useQuery({
    queryKey: buildAutomationCatalogQueryKey(props.projectId),
    queryFn: async () => getProjectAutomationCatalog(props.projectId),
    enabled: Boolean(props.projectId),
  });
  const flowsQuery = useQuery({
    queryKey: buildAutomationFlowsQueryKey(props.projectId),
    queryFn: async () => listProjectAutomationFlows(props.projectId),
    enabled: Boolean(props.projectId),
  });
  const runsQuery = useQuery({
    queryKey: buildAutomationRunsQueryKey(props.projectId),
    queryFn: async () => listProjectAutomationRuns(props.projectId, { limit: 20 }),
    enabled: Boolean(props.projectId),
  });

  const invalidateAutomationQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: buildAutomationFlowsQueryKey(props.projectId) }),
      queryClient.invalidateQueries({ queryKey: buildAutomationRunsQueryKey(props.projectId) }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: async () => createProjectAutomationFlow(props.projectId, buildFlowPayload(draft)),
    onSuccess: async (flow) => {
      notifySuccessText(t("CONTENT_AUTOMATION_CREATE_SUCCESS"));
      setDraft(draftFromFlow(flow, catalogQuery.data));
      await invalidateAutomationQueries();
    },
    onError: (error) => notifyError(error),
  });
  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!draft.id) throw new Error("Automation flow id is required.");
      return updateProjectAutomationFlow(props.projectId, draft.id, buildFlowPayload(draft));
    },
    onSuccess: async (flow) => {
      notifySuccessText(t("CONTENT_AUTOMATION_SAVE_SUCCESS"));
      setDraft(draftFromFlow(flow, catalogQuery.data));
      await invalidateAutomationQueries();
    },
    onError: (error) => notifyError(error),
  });
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!draft.id) throw new Error("Automation flow id is required.");
      await deleteProjectAutomationFlow(props.projectId, draft.id);
    },
    onSuccess: async () => {
      notifySuccessText(t("CONTENT_AUTOMATION_DELETE_SUCCESS"));
      setDraft(createEmptyDraft(catalogQuery.data));
      await invalidateAutomationQueries();
    },
    onError: (error) => notifyError(error),
  });

  const flows = flowsQuery.data?.items ?? [];
  const runs = runsQuery.data?.items ?? [];
  const activeFlows = flows.filter((flow) => flow.status === "active").length;
  const latestFailedRun = runs.find(
    (run) => run.status === "failed" || run.status === "dead_letter",
  );
  const busy = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  return (
    <DefaultPage
      title={t("CONTENT_AUTOMATION_TITLE")}
      description={t("CONTENT_AUTOMATION_DESC")}
      showFavoriteToggle={false}
      action={
        <Button
          type="button"
          onClick={() => setDraft(createEmptyDraft(catalogQuery.data))}
          disabled={!canManage}
        >
          {t("CONTENT_AUTOMATION_ACTION_NEW")}
        </Button>
      }
      contentContainerClassName="mx-auto w-full max-w-7xl"
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_24rem]">
        <section className="space-y-6">
          <section
            className="rounded-[28px] border border-border/60 bg-card/70 p-6"
            data-testid="content-automation-page"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  {t("CONTENT_AUTOMATION_CANVAS_EYEBROW")}
                </div>
                <h2 className="text-2xl font-semibold text-foreground">
                  {t("CONTENT_AUTOMATION_CANVAS_TITLE")}
                </h2>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  {t("CONTENT_AUTOMATION_CANVAS_DESC")}
                </p>
              </div>
              <BaseTag color={latestFailedRun ? "red" : "green"}>
                {latestFailedRun
                  ? t("CONTENT_AUTOMATION_HEALTH_ATTENTION")
                  : t("CONTENT_AUTOMATION_HEALTH_READY")}
              </BaseTag>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-border/60 bg-background/80 px-4 py-4">
                <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {t("CONTENT_AUTOMATION_METRIC_ACTIVE_FLOWS")}
                </div>
                <div className="mt-2 text-2xl font-semibold text-foreground">{activeFlows}</div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/80 px-4 py-4">
                <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {t("CONTENT_AUTOMATION_METRIC_TRIGGERS")}
                </div>
                <div className="mt-2 text-2xl font-semibold text-foreground">
                  {catalogQuery.data?.triggers?.length ?? 0}
                </div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/80 px-4 py-4">
                <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {t("CONTENT_AUTOMATION_METRIC_RECENT_RUNS")}
                </div>
                <div className="mt-2 text-2xl font-semibold text-foreground">{runs.length}</div>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-border/60 bg-card/60 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">
                  {t("CONTENT_AUTOMATION_FLOWS_TITLE")}
                </div>
                <div className="mt-1 text-sm leading-6 text-muted-foreground">
                  {t("CONTENT_AUTOMATION_FLOWS_DESC")}
                </div>
              </div>
              {flowsQuery.isLoading ? (
                <span className="text-sm text-muted-foreground">
                  {t("CONTENT_AUTOMATION_LOADING")}
                </span>
              ) : null}
            </div>
            <div className="mt-5">
              <FlowList
                flows={flows}
                selectedFlowId={draft.id}
                onSelect={(flow) => setDraft(draftFromFlow(flow, catalogQuery.data))}
              />
            </div>
          </section>
        </section>

        <aside className="space-y-6">
          <FlowEditor
            busy={busy}
            canManage={canManage}
            catalog={catalogQuery.data}
            draft={draft}
            onChange={setDraft}
            onDelete={() => deleteMutation.mutate()}
            onNew={() => setDraft(createEmptyDraft(catalogQuery.data))}
            onSubmit={() => (draft.id ? updateMutation.mutate() : createMutation.mutate())}
          />
          <RunsPanel runs={runs} />
        </aside>
      </div>
    </DefaultPage>
  );
}
