import { RotateCcw } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { OperationalSignalAssigneeOut } from "@arclayer/platform-openapi";

import {
  listOperationalSignalEligibleAssignees,
  listOperationalSignals,
} from "@/operations/operations-api";
import {
  hasAttentionFilters,
  operationalSignalQuery,
  type NeedsAttentionSearch,
} from "@/operations/operations-routing";
import { SignalDetailSheet } from "@/operations/signal-detail-sheet";
import { SignalQueueWithAssignees } from "@/operations/signal-queue";
import { useOperationsQuery } from "@/operations/operations-state";
import { OperationsPage, OperationsQueryBoundary, RefreshStatus } from "@/operations/operations-ui";
import { SavedViewsControl } from "@/saved-views/saved-views-control";
import { SAVED_VIEW_DEFINITIONS, type SavedViewState } from "@/saved-views/saved-view-contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type NeedsAttentionPageProps = Readonly<{
  search: NeedsAttentionSearch;
  onSearchChange: (search: NeedsAttentionSearch) => void;
}>;

type ScopeType = "workspace" | "project" | "site";

function operatorLabel(operator: OperationalSignalAssigneeOut): string {
  return operator.displayName?.trim() || operator.username;
}

function savedString(state: SavedViewState, code: string): string | undefined {
  const value = state.filters.find((filter) => filter.code === code)?.value;
  return typeof value === "string" && value.trim() ? value : undefined;
}

function savedBoolean(state: SavedViewState, code: string): boolean | undefined {
  const value = state.filters.find((filter) => filter.code === code)?.value;
  return typeof value === "boolean" ? value : undefined;
}

function scopeType(search: NeedsAttentionSearch): ScopeType | undefined {
  if (search.workspaceId) return "workspace";
  if (search.projectId) return "project";
  if (search.siteId) return "site";
  return search.scopeType;
}

function savedState(search: NeedsAttentionSearch): SavedViewState {
  return {
    ...SAVED_VIEW_DEFINITIONS.operationsSignals.defaultState,
    filters: [
      ...(search.sourceLifecycle
        ? [{ code: "source_lifecycle", value: search.sourceLifecycle }]
        : []),
      ...(search.coordinationState
        ? [{ code: "coordination_state", value: search.coordinationState }]
        : []),
      ...(search.sourceDomain ? [{ code: "source_domain", value: search.sourceDomain }] : []),
      ...(search.severity ? [{ code: "severity", value: search.severity }] : []),
      ...(search.assigneeUserId
        ? [{ code: "assignee_user_id", value: search.assigneeUserId }]
        : []),
      ...(search.workspaceId ? [{ code: "workspace_id", value: search.workspaceId }] : []),
      ...(search.projectId ? [{ code: "project_id", value: search.projectId }] : []),
      ...(search.siteId ? [{ code: "site_id", value: search.siteId }] : []),
      ...(search.includeReminded ? [{ code: "include_reminded", value: true }] : []),
    ],
    ordering: {
      code: search.order ?? "priority",
      direction: search.orderDirection ?? "asc",
    },
  };
}

function AttentionFilters({
  search,
  update,
}: Readonly<{
  search: NeedsAttentionSearch;
  update: (next: Partial<NeedsAttentionSearch>) => void;
}>) {
  const { t } = useTranslation("inbox");
  const assignees = useOperationsQuery(listOperationalSignalEligibleAssignees, []);
  const activeScope = scopeType(search);
  const scopeId =
    activeScope === "workspace"
      ? search.workspaceId
      : activeScope === "project"
        ? search.projectId
        : search.siteId;
  const selectScope = (nextScope: ScopeType | undefined) =>
    update({
      scopeType: nextScope,
      workspaceId: undefined,
      projectId: undefined,
      siteId: undefined,
    });
  const setScopeId = (value: string) =>
    update({
      workspaceId: activeScope === "workspace" && value ? value : undefined,
      projectId: activeScope === "project" && value ? value : undefined,
      siteId: activeScope === "site" && value ? value : undefined,
    });

  return (
    <div className="grid gap-3 rounded-lg border bg-card p-3 lg:grid-cols-3">
      <Select
        onValueChange={(value) =>
          update({
            sourceLifecycle: value === "all" ? undefined : (value as "unresolved" | "resolved"),
          })
        }
        value={search.sourceLifecycle ?? "unresolved"}
      >
        <SelectTrigger aria-label={t("SOURCE_LIFECYCLE_FILTER")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="unresolved">{t("SOURCE_UNRESOLVED")}</SelectItem>
          <SelectItem value="resolved">{t("SOURCE_RESOLVED")}</SelectItem>
          <SelectItem value="all">{t("SOURCE_ALL")}</SelectItem>
        </SelectContent>
      </Select>
      <Select
        onValueChange={(value) =>
          update({
            coordinationState:
              value === "all" ? undefined : (value as NeedsAttentionSearch["coordinationState"]),
          })
        }
        value={search.coordinationState ?? "all"}
      >
        <SelectTrigger aria-label={t("COORDINATION_FILTER")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("COORDINATION_ALL")}</SelectItem>
          <SelectItem value="unclaimed">{t("TRIAGE_UNCLAIMED")}</SelectItem>
          <SelectItem value="in_progress">{t("TRIAGE_IN_PROGRESS")}</SelectItem>
          <SelectItem value="waiting">{t("TRIAGE_WAITING")}</SelectItem>
          <SelectItem value="source_recovered">{t("TRIAGE_SOURCE_RECOVERED")}</SelectItem>
        </SelectContent>
      </Select>
      <Select
        onValueChange={(value) => update({ includeReminded: value === "all" })}
        value={search.includeReminded ? "all" : "immediate"}
      >
        <SelectTrigger aria-label={t("REMINDER_VISIBILITY_FILTER")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="immediate">{t("IMMEDIATE_WORK")}</SelectItem>
          <SelectItem value="all">{t("INCLUDE_REMINDERS")}</SelectItem>
        </SelectContent>
      </Select>
      <Select
        onValueChange={(value) => update({ sourceDomain: value === "all" ? undefined : "jobs" })}
        value={search.sourceDomain ?? "all"}
      >
        <SelectTrigger aria-label={t("SOURCE_DOMAIN_FILTER")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("SOURCE_DOMAIN_ALL")}</SelectItem>
          <SelectItem value="jobs">{t("SOURCE_DOMAIN_JOBS")}</SelectItem>
        </SelectContent>
      </Select>
      <Select
        onValueChange={(value) => update({ severity: value === "all" ? undefined : "high" })}
        value={search.severity ?? "all"}
      >
        <SelectTrigger aria-label={t("SEVERITY_FILTER")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("SEVERITY_ALL")}</SelectItem>
          <SelectItem value="high">{t("SEVERITY_HIGH")}</SelectItem>
        </SelectContent>
      </Select>
      <Select
        onValueChange={(value) => {
          const [order, orderDirection] = value.split(":") as [
            "priority" | "detected_at",
            "asc" | "desc",
          ];
          update({ order, orderDirection });
        }}
        value={`${search.order ?? "priority"}:${search.orderDirection ?? "asc"}`}
      >
        <SelectTrigger aria-label={t("ORDER_FILTER")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="priority:asc">{t("ORDER_PRIORITY")}</SelectItem>
          <SelectItem value="detected_at:desc">{t("ORDER_NEWEST")}</SelectItem>
          <SelectItem value="detected_at:asc">{t("ORDER_OLDEST")}</SelectItem>
        </SelectContent>
      </Select>
      {assignees.state.status === "ready" ? (
        <Select
          onValueChange={(value) => update({ assigneeUserId: value === "all" ? undefined : value })}
          value={search.assigneeUserId ?? "all"}
        >
          <SelectTrigger aria-label={t("ASSIGNEE_FILTER")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("ASSIGNEE_ALL")}</SelectItem>
            {assignees.state.data.map((operator) => (
              <SelectItem key={operator.userId} value={operator.userId}>
                {operatorLabel(operator)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : assignees.state.status === "error" ? (
        <Alert>
          <AlertDescription>{t("ASSIGNEES_ERROR")}</AlertDescription>
        </Alert>
      ) : (
        <div className="text-sm text-muted-foreground">{t("ASSIGNEES_LOADING")}</div>
      )}
      <Select
        onValueChange={(value) => selectScope(value === "all" ? undefined : (value as ScopeType))}
        value={activeScope ?? "all"}
      >
        <SelectTrigger aria-label={t("SCOPE_FILTER")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("SCOPE_ALL")}</SelectItem>
          <SelectItem value="workspace">{t("SCOPE_WORKSPACE")}</SelectItem>
          <SelectItem value="project">{t("SCOPE_PROJECT")}</SelectItem>
          <SelectItem value="site">{t("SCOPE_SITE")}</SelectItem>
        </SelectContent>
      </Select>
      {activeScope && (
        <div className="space-y-1">
          <Label htmlFor="attention-scope-id">{t("SCOPE_IDENTIFIER")}</Label>
          <Input
            id="attention-scope-id"
            onChange={(event) => setScopeId(event.target.value.trim())}
            value={scopeId ?? ""}
          />
        </div>
      )}
    </div>
  );
}

export function NeedsAttentionPage({ search, onSearchChange }: NeedsAttentionPageProps) {
  const { t } = useTranslation("inbox");
  const query = useMemo(() => operationalSignalQuery(search), [search]);
  const load = useCallback((signal: AbortSignal) => listOperationalSignals(query, signal), [query]);
  const { state, retry } = useOperationsQuery(load, [query]);
  const filtered = hasAttentionFilters(search);
  const update = (next: Partial<NeedsAttentionSearch>) =>
    onSearchChange({ ...search, ...next, page: next.page ?? 1 });
  const applySavedView = (next: SavedViewState) =>
    onSearchChange({
      sourceLifecycle: savedString(
        next,
        "source_lifecycle",
      ) as NeedsAttentionSearch["sourceLifecycle"],
      coordinationState: savedString(
        next,
        "coordination_state",
      ) as NeedsAttentionSearch["coordinationState"],
      sourceDomain: savedString(next, "source_domain") as NeedsAttentionSearch["sourceDomain"],
      severity: savedString(next, "severity") as NeedsAttentionSearch["severity"],
      assigneeUserId: savedString(next, "assignee_user_id"),
      workspaceId: savedString(next, "workspace_id"),
      projectId: savedString(next, "project_id"),
      siteId: savedString(next, "site_id"),
      includeReminded: savedBoolean(next, "include_reminded"),
      order: next.ordering.code as NeedsAttentionSearch["order"],
      orderDirection: next.ordering.direction,
      page: 1,
    });
  const selectedSummary =
    state.status === "ready"
      ? state.data.items?.find((item) => item.id === search.signalId)
      : undefined;

  return (
    <OperationsPage description={t("PAGE_DESCRIPTION")} title={t("PAGE_TITLE")}>
      <SavedViewsControl
        definition={SAVED_VIEW_DEFINITIONS.operationsSignals}
        onApply={applySavedView}
        state={savedState(search)}
      />
      <AttentionFilters search={search} update={update} />
      {filtered && (
        <Button
          className="w-fit"
          onClick={() =>
            onSearchChange({ sourceLifecycle: "unresolved", signalId: search.signalId })
          }
          variant="ghost"
        >
          <RotateCcw aria-hidden="true" />
          {t("RESET_FILTERS")}
        </Button>
      )}

      <OperationsQueryBoundary
        empty={(data) => !data.items?.length}
        filtered={filtered}
        retry={retry}
        state={state}
      >
        {(data, refreshing) => (
          <div className="space-y-3">
            <RefreshStatus refreshing={refreshing} />
            <SignalQueueWithAssignees
              data={data}
              onOpen={(signalId) => update({ signalId, page: search.page })}
              onPageChange={(page) => update({ page })}
            />
          </div>
        )}
      </OperationsQueryBoundary>

      {search.signalId && (
        <SignalDetailSheet
          onClose={() => update({ signalId: undefined, page: search.page })}
          onQueueRefresh={retry}
          signalId={search.signalId}
          summaryTitle={selectedSummary ? t(selectedSummary.copy.titleKey) : undefined}
        />
      )}
    </OperationsPage>
  );
}
