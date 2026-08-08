import { useCallback, useMemo, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  PlatformCommerceSubscriptionListOut,
  SubscriptionStatus,
} from "@arclayer/platform-openapi";

import {
  cancelSubscriptionRevisionTransition,
  listCommerceSubscriptions,
  previewSubscriptionRevisionTransition,
  scheduleSubscriptionRevisionTransition,
} from "@/commerce/commerce-api";
import { CommercePage, CommerceQueryState } from "@/commerce/commerce-ui";
import { CommerceTableToolbar, type CommerceColumn } from "@/components/commerce-data-table";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingDialog } from "@/components/setting-dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PAGE_SIZE = 25;
const columns: readonly CommerceColumn[] = [
  { id: "workspace", label: "Workspace" },
  { id: "plan", label: "Plan" },
  { id: "status", label: "Status" },
  { id: "provider", label: "Provider" },
  { id: "periodEnd", label: "Period end" },
  { id: "access", label: "Access" },
];

export function CommerceSubscriptionsPage() {
  const { t } = useTranslation("commerce");
  const [query, setQuery] = useState({
    page: 1,
    pageSize: PAGE_SIZE,
    search: "",
    status: undefined as SubscriptionStatus | undefined,
    provider: "",
    planCode: "",
    sortBy: "current_period_end" as "current_period_end" | "status" | "plan_code",
    sortDirection: "desc" as "asc" | "desc",
  });
  const [refreshing, setRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transitionOpen, setTransitionOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState(columns.map((column) => column.id));
  const load = useCallback(
    () =>
      listCommerceSubscriptions({
        ...query,
        search: query.search || undefined,
        provider: query.provider || undefined,
        planCode: query.planCode || undefined,
      }),
    [query],
  );
  const result = useMonitoringQuery(load, [load]);
  const refresh = () => {
    setRefreshing(true);
    result.retry();
    window.setTimeout(() => setRefreshing(false), 300);
  };
  const selected =
    result.state.status === "ready"
      ? (result.state.data.items.find((item) => item.subscriptionId === selectedId) ?? null)
      : null;
  return (
    <CommercePage
      description={t("SUBSCRIPTIONS_DESCRIPTION")}
      primaryAction={
        <Button disabled={!selected} onClick={() => setTransitionOpen(true)}>
          {t("MANAGE_TRANSITION")}
        </Button>
      }
      secondaryActions={
        <Button disabled={refreshing} onClick={refresh} variant="outline">
          {t("REFRESH")}
        </Button>
      }
      title={t("SUBSCRIPTIONS_TITLE")}
    >
      <CommerceQueryState
        isEmpty={(data) => data.items.length === 0}
        retry={result.retry}
        state={result.state}
        filtered={Boolean(query.search || query.status || query.provider || query.planCode)}
      >
        {(data) => (
          <div className="space-y-4">
            <CommerceTableToolbar
              columns={columns.map((column) => ({
                id: column.id,
                label: t(column.id === "periodEnd" ? "PERIOD_END" : column.id.toUpperCase()),
              }))}
              columnsLabel={t("CHOOSE_COLUMNS")}
              filters={
                <div className="flex flex-wrap gap-2">
                  <SubscriptionFilters
                    query={query}
                    onChange={(next) => setQuery((current) => ({ ...current, ...next, page: 1 }))}
                  />
                  <Select
                    onValueChange={(value) =>
                      setQuery((current) => ({
                        ...current,
                        sortBy: value as "current_period_end" | "status" | "plan_code",
                        page: 1,
                      }))
                    }
                    value={query.sortBy}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder={t("SORT_FIELD_PLACEHOLDER")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="current_period_end">{t("PERIOD_END")}</SelectItem>
                      <SelectItem value="status">{t("STATUS")}</SelectItem>
                      <SelectItem value="plan_code">{t("PLAN")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    onValueChange={(value) =>
                      setQuery((current) => ({
                        ...current,
                        sortDirection: value as "asc" | "desc",
                        page: 1,
                      }))
                    }
                    value={query.sortDirection}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue placeholder={t("SORT_ORDER_PLACEHOLDER")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="desc">{t("SORT_NEWEST")}</SelectItem>
                      <SelectItem value="asc">{t("SORT_OLDEST")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              }
              onRefresh={refresh}
              onSearchChange={(value) =>
                setQuery((current) => ({ ...current, search: value, page: 1 }))
              }
              onVisibleColumnsChange={(ids) => setVisibleColumns([...ids])}
              refreshing={refreshing}
              refreshLabel={t("REFRESH")}
              searchPlaceholder={t("SUBSCRIPTIONS_SEARCH")}
              searchValue={query.search}
              visibleColumns={visibleColumns}
            />
            <SubscriptionTable
              data={data}
              onSelect={setSelectedId}
              visibleColumns={visibleColumns}
            />
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {t("PAGE_OF", {
                  page: query.page,
                  pages: Math.max(1, Math.ceil(data.total / PAGE_SIZE)),
                  total: data.total,
                })}
              </span>
              <div className="flex gap-2">
                <Button
                  disabled={query.page <= 1}
                  onClick={() => setQuery((current) => ({ ...current, page: current.page - 1 }))}
                  size="sm"
                  variant="outline"
                >
                  {t("PREVIOUS")}
                </Button>
                <Button
                  disabled={query.page >= Math.ceil(data.total / PAGE_SIZE)}
                  onClick={() => setQuery((current) => ({ ...current, page: current.page + 1 }))}
                  size="sm"
                  variant="outline"
                >
                  {t("NEXT")}
                </Button>
              </div>
            </div>
          </div>
        )}
      </CommerceQueryState>
      <Sheet onOpenChange={(open) => !open && setSelectedId(null)} open={selectedId !== null}>
        <SheetContent className="overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{t("SUBSCRIPTION_DETAIL_TITLE")}</SheetTitle>
            <SheetDescription>
              {selected?.workspaceId ?? t("SUBSCRIPTION_DETAIL_EMPTY")}
            </SheetDescription>
          </SheetHeader>
          {selected ? <SubscriptionDetail subscription={selected} /> : null}
        </SheetContent>
      </Sheet>
      {selected ? (
        <SubscriptionTransitionDialog
          onOpenChange={setTransitionOpen}
          open={transitionOpen}
          subscription={selected}
        />
      ) : null}
    </CommercePage>
  );
}

function SubscriptionFilters({
  query,
  onChange,
}: Readonly<{
  query: { status?: SubscriptionStatus; provider: string; planCode: string };
  onChange: (next: Partial<typeof query>) => void;
}>) {
  const { t } = useTranslation("commerce");
  return (
    <div className="flex flex-wrap gap-2">
      <Select
        onValueChange={(value) =>
          onChange({ status: value === "all" ? undefined : (value as SubscriptionStatus) })
        }
        value={query.status ?? "all"}
      >
        <SelectTrigger className="w-36">
          <SlidersHorizontal aria-hidden="true" />
          <SelectValue placeholder={t("STATUS")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("ALL_STATUSES")}</SelectItem>
          <SelectItem value="active">{t("ACTIVE")}</SelectItem>
          <SelectItem value="past_due">{t("PAST_DUE")}</SelectItem>
          <SelectItem value="canceled">{t("CANCELED")}</SelectItem>
        </SelectContent>
      </Select>
      <Input
        className="w-36"
        onChange={(event) => onChange({ provider: event.target.value })}
        placeholder={t("PROVIDER_FILTER_PLACEHOLDER")}
        value={query.provider}
      />
      <Input
        className="w-36"
        onChange={(event) => onChange({ planCode: event.target.value })}
        placeholder={t("PLAN_FILTER_PLACEHOLDER")}
        value={query.planCode}
      />
    </div>
  );
}

function SubscriptionTable(
  props: Readonly<{
    data: PlatformCommerceSubscriptionListOut;
    onSelect: (id: string) => void;
    visibleColumns: readonly string[];
  }>,
) {
  const { t } = useTranslation("commerce");
  const rows = useMemo(() => props.data.items, [props.data.items]);
  const shown = (id: string) => props.visibleColumns.includes(id);
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            {shown("workspace") ? <TableHead>{t("WORKSPACE")}</TableHead> : null}
            {shown("plan") ? <TableHead>{t("PLAN")}</TableHead> : null}
            {shown("status") ? <TableHead>{t("STATUS")}</TableHead> : null}
            {shown("provider") ? <TableHead>{t("PROVIDER")}</TableHead> : null}
            {shown("periodEnd") ? <TableHead>{t("PERIOD_END")}</TableHead> : null}
            {shown("access") ? <TableHead>{t("ACCESS_STATE")}</TableHead> : null}
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((subscription) => (
            <TableRow
              className="cursor-pointer"
              key={subscription.subscriptionId}
              onClick={() => props.onSelect(subscription.subscriptionId)}
            >
              {shown("workspace") ? (
                <TableCell className="font-mono text-xs">{subscription.workspaceId}</TableCell>
              ) : null}
              {shown("plan") ? (
                <TableCell>
                  {subscription.planCode} · {t("SEQUENCE", { sequence: subscription.planRevision })}
                </TableCell>
              ) : null}
              {shown("status") ? (
                <TableCell>
                  <Badge variant={subscription.status === "past_due" ? "destructive" : "outline"}>
                    {t(statusLabelKey(subscription.status))}
                  </Badge>
                </TableCell>
              ) : null}
              {shown("provider") ? <TableCell>{subscription.billingProvider}</TableCell> : null}
              {shown("periodEnd") ? (
                <TableCell>
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </TableCell>
              ) : null}
              {shown("access") ? (
                <TableCell>
                  {subscription.commercialAccessState
                    ? t(`ACCESS_STATE_${subscription.commercialAccessState.toUpperCase()}`)
                    : t("NOT_APPLICABLE")}
                </TableCell>
              ) : null}
              <TableCell>
                <Button
                  onClick={(event) => {
                    event.stopPropagation();
                    props.onSelect(subscription.subscriptionId);
                  }}
                  size="sm"
                  variant="ghost"
                >
                  {t("VIEW_DETAILS")}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length === 0 ? (
        <div className="flex items-center gap-2 border-t p-6 text-sm text-muted-foreground">
          <Search aria-hidden="true" />
          {t("FILTERED_EMPTY_DESCRIPTION")}
        </div>
      ) : null}
    </div>
  );
}

function SubscriptionDetail({
  subscription,
}: Readonly<{ subscription: PlatformCommerceSubscriptionListOut["items"][number] }>) {
  const { t } = useTranslation("commerce");
  const rows = [
    [t("SUBSCRIPTION_REFERENCE"), subscription.subscriptionId],
    [t("PLAN"), `${subscription.planCode} · ${subscription.planRevision}`],
    [t("REVISION"), subscription.planRevisionId],
    [t("BILLING_CYCLE"), subscription.billingCycle],
    [t("STATUS"), t(statusLabelKey(subscription.status))],
    [
      t("ACCESS_STATE"),
      subscription.commercialAccessState
        ? t(`ACCESS_STATE_${subscription.commercialAccessState.toUpperCase()}`)
        : t("NOT_APPLICABLE"),
    ],
    [t("PERIOD_END"), new Date(subscription.currentPeriodEnd).toLocaleString()],
    [
      t("RECOVERY_DEADLINE"),
      subscription.recoveryDeadlineAt
        ? new Date(subscription.recoveryDeadlineAt).toLocaleString()
        : t("NOT_APPLICABLE"),
    ],
  ] as const;
  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-lg border bg-card p-4">
        {rows.map(([label, value]) => (
          <div className="grid gap-1 border-b py-3 last:border-b-0" key={label}>
            <span className="text-sm text-muted-foreground">{label}</span>
            <span className="break-all text-sm">{value}</span>
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        {subscription.cancelAtPeriodEnd
          ? t("CANCELS_AT_PERIOD_END")
          : t("SUBSCRIPTION_ACTIONS_DESCRIPTION")}
      </p>
    </div>
  );
}

function SubscriptionTransitionDialog(
  props: Readonly<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
    subscription: PlatformCommerceSubscriptionListOut["items"][number];
  }>,
) {
  const { t } = useTranslation("commerce");
  const [targetRevisionId, setTargetRevisionId] = useState("");
  const [effectiveAt, setEffectiveAt] = useState("");
  const [expectedSubscriptionRevision, setExpectedSubscriptionRevision] = useState("1");
  const [retainedAssignmentIds, setRetainedAssignmentIds] = useState("");
  const [transitionId, setTransitionId] = useState("");
  const [expectedTransitionRevision, setExpectedTransitionRevision] = useState("1");
  const [preview, setPreview] = useState<Awaited<
    ReturnType<typeof previewSubscriptionRevisionTransition>
  > | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const previewTransition = async () => {
    const target = targetRevisionId.trim();
    const effective = effectiveAt ? new Date(effectiveAt).toISOString() : "";
    const expected = Number(expectedSubscriptionRevision);
    if (!target || !effective || !Number.isSafeInteger(expected) || expected < 1) {
      setError(t("TRANSITION_REQUIRED_FIELDS"));
      return;
    }
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const result = await previewSubscriptionRevisionTransition({
        workspaceId: props.subscription.workspaceId,
        sourceRevisionId: props.subscription.planRevisionId,
        targetRevisionId: target,
        expectedSubscriptionRevision: expected,
        effectiveAt: effective,
        retainedAssignmentIds: retainedAssignmentIds
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        idempotencyKey: crypto.randomUUID(),
        correlationId: crypto.randomUUID(),
      });
      setPreview(result);
      setMessage(t("TRANSITION_PREVIEW_READY"));
    } catch {
      setError(t("TRANSITION_PREVIEW_ERROR"));
    } finally {
      setPending(false);
    }
  };

  const scheduleTransition = async () => {
    if (!preview) return;
    setPending(true);
    setError(null);
    try {
      const result = await scheduleSubscriptionRevisionTransition({
        previewId: preview.id,
        expectedPreviewRevision: preview.previewRevision,
        convergenceId: null,
        idempotencyKey: crypto.randomUUID(),
        correlationId: preview.correlationId,
      });
      setTransitionId(result.transitionId);
      setExpectedTransitionRevision("1");
      setMessage(t("TRANSITION_SCHEDULED"));
    } catch {
      setError(t("TRANSITION_SCHEDULE_ERROR"));
    } finally {
      setPending(false);
    }
  };

  const cancelTransition = async () => {
    const id = transitionId.trim();
    const revision = Number(expectedTransitionRevision);
    if (!id || !Number.isSafeInteger(revision) || revision < 1) {
      setError(t("TRANSITION_CANCEL_REQUIRED_FIELDS"));
      return;
    }
    setPending(true);
    setError(null);
    try {
      await cancelSubscriptionRevisionTransition(id, {
        expectedRevision: revision,
        idempotencyKey: crypto.randomUUID(),
      });
      setMessage(t("TRANSITION_CANCELED"));
    } catch {
      setError(t("TRANSITION_CANCEL_ERROR"));
    } finally {
      setPending(false);
    }
  };

  return (
    <SettingDialog
      description={t("TRANSITION_DIALOG_DESCRIPTION")}
      footer={
        <Button disabled={pending} onClick={() => props.onOpenChange(false)} variant="outline">
          {t("CLOSE")}
        </Button>
      }
      onOpenChange={(open) => !pending && props.onOpenChange(open)}
      open={props.open}
      title={t("MANAGE_TRANSITION")}
    >
      <div className="space-y-6">
        <section className="space-y-3">
          <h3 className="font-medium">{t("PREVIEW_TRANSITION")}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              onChange={(event) => setTargetRevisionId(event.target.value)}
              placeholder={t("TARGET_REVISION_PLACEHOLDER")}
              value={targetRevisionId}
            />
            <Input
              onChange={(event) => setEffectiveAt(event.target.value)}
              placeholder={t("EFFECTIVE_AT_PLACEHOLDER")}
              type="datetime-local"
              value={effectiveAt}
            />
            <Input
              onChange={(event) => setExpectedSubscriptionRevision(event.target.value)}
              placeholder={t("SUBSCRIPTION_REVISION_PLACEHOLDER")}
              type="number"
              value={expectedSubscriptionRevision}
            />
            <Input
              onChange={(event) => setRetainedAssignmentIds(event.target.value)}
              placeholder={t("RETAINED_ASSIGNMENTS_PLACEHOLDER")}
              value={retainedAssignmentIds}
            />
          </div>
          <Button disabled={pending} onClick={previewTransition} type="button">
            {t("PREVIEW_TRANSITION")}
          </Button>
          {preview ? (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p>{t("PREVIEW_HASH", { hash: preview.snapshotHash })}</p>
              <Button
                className="mt-3"
                disabled={pending}
                onClick={scheduleTransition}
                type="button"
              >
                {t("SCHEDULE_TRANSITION")}
              </Button>
            </div>
          ) : null}
        </section>
        <section className="space-y-3 border-t pt-4">
          <h3 className="font-medium">{t("CANCEL_TRANSITION")}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              onChange={(event) => setTransitionId(event.target.value)}
              placeholder={t("TRANSITION_ID_PLACEHOLDER")}
              value={transitionId}
            />
            <Input
              onChange={(event) => setExpectedTransitionRevision(event.target.value)}
              placeholder={t("TRANSITION_REVISION_PLACEHOLDER")}
              type="number"
              value={expectedTransitionRevision}
            />
          </div>
          <Button disabled={pending} onClick={cancelTransition} type="button" variant="outline">
            {t("CANCEL_TRANSITION")}
          </Button>
        </section>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </div>
    </SettingDialog>
  );
}

function statusLabelKey(status: SubscriptionStatus): "ACTIVE" | "PAST_DUE" | "CANCELED" {
  return status === "active" ? "ACTIVE" : status === "past_due" ? "PAST_DUE" : "CANCELED";
}
