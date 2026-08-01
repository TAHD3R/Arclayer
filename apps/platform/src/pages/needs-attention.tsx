import { RotateCcw } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { listOperationalSignals } from "@/operations/operations-api";
import {
  hasAttentionFilters,
  operationalSignalQuery,
  type NeedsAttentionSearch,
} from "@/operations/operations-routing";
import { SignalDetailSheet } from "@/operations/signal-detail-sheet";
import { SignalQueueWithAssignees } from "@/operations/signal-queue";
import { useOperationsQuery } from "@/operations/operations-state";
import { OperationsPage, OperationsQueryBoundary, RefreshStatus } from "@/operations/operations-ui";
import { Button } from "@arclayer/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";

type NeedsAttentionPageProps = Readonly<{
  search: NeedsAttentionSearch;
  onSearchChange: (search: NeedsAttentionSearch) => void;
}>;

export function NeedsAttentionPage({ search, onSearchChange }: NeedsAttentionPageProps) {
  const { t } = useTranslation("inbox");
  const query = useMemo(() => operationalSignalQuery(search), [search]);
  const load = useCallback((signal: AbortSignal) => listOperationalSignals(query, signal), [query]);
  const { state, retry } = useOperationsQuery(load, [query]);
  const filtered = hasAttentionFilters(search);
  const update = (next: Partial<NeedsAttentionSearch>) =>
    onSearchChange({ ...search, ...next, page: next.page ?? 1 });
  const selectedSummary =
    state.status === "ready"
      ? state.data.items?.find((item) => item.id === search.signalId)
      : undefined;

  return (
    <OperationsPage description={t("PAGE_DESCRIPTION")} title={t("PAGE_TITLE")}>
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 md:flex-row md:flex-wrap md:items-center">
        <Select
          onValueChange={(value) =>
            update({
              sourceLifecycle: value as "unresolved" | "resolved" | "all",
            })
          }
          value={search.sourceLifecycle ?? "unresolved"}
        >
          <SelectTrigger aria-label={t("SOURCE_LIFECYCLE_FILTER")} className="w-full md:w-48">
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
                value === "all"
                  ? undefined
                  : (value as "needs_attention" | "in_progress" | "remind_later"),
            })
          }
          value={search.coordinationState ?? "all"}
        >
          <SelectTrigger aria-label={t("COORDINATION_FILTER")} className="w-full md:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("COORDINATION_ALL")}</SelectItem>
            <SelectItem value="needs_attention">{t("TRIAGE_NEEDS_ATTENTION")}</SelectItem>
            <SelectItem value="in_progress">{t("TRIAGE_IN_PROGRESS")}</SelectItem>
            <SelectItem value="remind_later">{t("TRIAGE_REMIND_LATER")}</SelectItem>
          </SelectContent>
        </Select>
        <Select
          onValueChange={(value) => update({ includeReminded: value === "all" })}
          value={search.includeReminded ? "all" : "immediate"}
        >
          <SelectTrigger aria-label={t("REMINDER_VISIBILITY_FILTER")} className="w-full md:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="immediate">{t("IMMEDIATE_WORK")}</SelectItem>
            <SelectItem value="all">{t("INCLUDE_REMINDERS")}</SelectItem>
          </SelectContent>
        </Select>
        {filtered && (
          <Button
            onClick={() =>
              onSearchChange({
                sourceLifecycle: "unresolved",
                includeReminded: false,
                signalId: search.signalId,
              })
            }
            variant="ghost"
          >
            <RotateCcw aria-hidden="true" />
            {t("RESET_FILTERS")}
          </Button>
        )}
      </div>

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
