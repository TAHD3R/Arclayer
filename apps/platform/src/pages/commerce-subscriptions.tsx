import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type {
  PlatformCommerceSubscriptionListOut,
  SubscriptionStatus,
} from "@arclayer/platform-openapi";

import { listCommerceSubscriptions } from "@/commerce/commerce-api";
import { CommercePage, CommerceQueryState } from "@/commerce/commerce-ui";
import { formatDateTime } from "@/monitoring/format";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";
import type { CommerceSubscriptionsSearch } from "@/routes/_authenticated/commerce/subscriptions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@arclayer/ui/table";

const statuses: readonly SubscriptionStatus[] = ["active", "past_due", "canceled"];

export function CommerceSubscriptionsPage(
  props: Readonly<{
    search: CommerceSubscriptionsSearch;
    onSearchChange: (search: CommerceSubscriptionsSearch) => void;
  }>,
) {
  const { t } = useTranslation("commerce");
  const page = props.search.page ?? 1;
  const load = useCallback(
    () =>
      listCommerceSubscriptions({
        page,
        pageSize: 25,
        planCode: props.search.planCode,
        status: props.search.status,
        provider: props.search.provider,
      }),
    [page, props.search.planCode, props.search.provider, props.search.status],
  );
  const { state, retry } = useMonitoringQuery(load, [
    page,
    props.search.planCode,
    props.search.provider,
    props.search.status,
  ]);
  const update = (next: Partial<CommerceSubscriptionsSearch>) =>
    props.onSearchChange({ ...props.search, ...next, page: next.page ?? 1 });
  return (
    <CommercePage description={t("SUBSCRIPTIONS_DESCRIPTION")} title={t("SUBSCRIPTIONS_TITLE")}>
      <div className="flex flex-wrap gap-3 rounded-lg border bg-card p-3">
        <Select
          onValueChange={(value) =>
            update({ status: value === "all" ? undefined : (value as SubscriptionStatus) })
          }
          value={props.search.status ?? "all"}
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("STATUS")}</SelectItem>
            {statuses.map((status) => (
              <SelectItem key={status} value={status}>
                {t(
                  status === "past_due"
                    ? "PAST_DUE"
                    : status === "canceled"
                      ? "CANCELED"
                      : "ACTIVE",
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          onValueChange={(value) => update({ provider: value === "all" ? undefined : value })}
          value={props.search.provider ?? "all"}
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder={t("PROVIDER")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("PROVIDER")}</SelectItem>
            <SelectItem value="stripe">Stripe</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <CommerceQueryState
        filtered={Boolean(props.search.status || props.search.provider)}
        isEmpty={(data) => data.items.length === 0}
        retry={retry}
        state={state}
      >
        {(data) => (
          <SubscriptionTable
            data={data}
            onPageChange={(next) => update({ page: next })}
            page={page}
          />
        )}
      </CommerceQueryState>
    </CommercePage>
  );
}

function SubscriptionTable(
  props: Readonly<{
    data: PlatformCommerceSubscriptionListOut;
    page: number;
    onPageChange: (page: number) => void;
  }>,
) {
  const { t } = useTranslation("commerce");
  const pages = Math.max(1, Math.ceil(props.data.total / 25));
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("WORKSPACE")}</TableHead>
              <TableHead>{t("PLAN")}</TableHead>
              <TableHead>{t("STATUS")}</TableHead>
              <TableHead>{t("PROVIDER")}</TableHead>
              <TableHead>{t("PERIOD_END")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.data.items.map((item) => (
              <TableRow key={item.subscriptionId}>
                <TableCell className="font-mono text-caption">{item.workspaceId}</TableCell>
                <TableCell>
                  {item.planCode} · {t("SEQUENCE", { sequence: item.planRevision })}
                </TableCell>
                <TableCell>
                  {t(
                    item.status === "past_due"
                      ? "PAST_DUE"
                      : item.status === "canceled"
                        ? "CANCELED"
                        : "ACTIVE",
                  )}
                  {item.cancelAtPeriodEnd ? ` · ${t("CANCELS_AT_PERIOD_END")}` : ""}
                </TableCell>
                <TableCell>{item.billingProvider}</TableCell>
                <TableCell>{formatDateTime(item.currentPeriodEnd)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between text-footnote text-label-secondary">
        <span>{t("PAGE_OF", { page: props.page, pages, total: props.data.total })}</span>
        <div className="flex gap-2">
          <button
            className="rounded border px-3 py-1 disabled:opacity-40"
            disabled={props.page <= 1}
            onClick={() => props.onPageChange(props.page - 1)}
            type="button"
          >
            {t("PREVIOUS")}
          </button>
          <button
            className="rounded border px-3 py-1 disabled:opacity-40"
            disabled={props.page >= pages}
            onClick={() => props.onPageChange(props.page + 1)}
            type="button"
          >
            {t("NEXT")}
          </button>
        </div>
      </div>
    </div>
  );
}
