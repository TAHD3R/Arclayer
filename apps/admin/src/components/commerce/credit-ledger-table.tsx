import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ColumnDef } from "@tanstack/react-table";

import {
  listWorkspaceCreditLedger,
  type CreditLedgerEntry,
  type CreditLedgerEntryType,
} from "@/api/commerce";
import { BaseTag } from "@/components/ui/tags";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { AdminDataTableSection } from "@/layouts/page-shell/admin-data-table-section";
import { useDataTable } from "@arclayer/ui/data-table";

const ENTRY_LABEL_KEYS: Record<CreditLedgerEntryType, string> = {
  period_grant: "LEDGER_TYPE_PERIOD_GRANT",
  reservation: "LEDGER_TYPE_RESERVATION",
  commit: "LEDGER_TYPE_COMMIT",
  release: "LEDGER_TYPE_RELEASE",
  adjustment: "LEDGER_TYPE_ADJUSTMENT",
  expiration: "LEDGER_TYPE_EXPIRATION",
};

const REFERENCE_LABEL_KEYS: Readonly<Record<string, string>> = {
  ai_request: "LEDGER_REFERENCE_AI_REQUEST",
  operator_adjustment: "LEDGER_REFERENCE_OPERATOR_ACTION",
  operator_change: "LEDGER_REFERENCE_OPERATOR_ACTION",
  period_refresh: "LEDGER_REFERENCE_PERIOD_REFRESH",
  provider_event: "LEDGER_REFERENCE_PROVIDER_EVENT",
  subscription: "LEDGER_REFERENCE_SUBSCRIPTION",
  subscription_period: "LEDGER_REFERENCE_PERIOD_REFRESH",
};

function signedCredits(value: number, formatter: Intl.NumberFormat): string {
  if (value === 0) return "—";
  return `${value > 0 ? "+" : "−"}${formatter.format(Math.abs(value))}`;
}

function TruncatedValue(props: { children: string; mono?: boolean }) {
  return (
    <span
      className={
        props.mono
          ? "block max-w-full truncate font-mono text-footnote"
          : "block max-w-full truncate"
      }
      title={props.children}
    >
      {props.children}
    </span>
  );
}

export function CreditLedgerTable({ workspaceId }: { workspaceId: string }) {
  const { t, i18n } = useTranslation(["commerce", "common"]);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const dateTime = useAdminDateTimeFormatter({ workspaceId });
  const columns = useMemo<ColumnDef<CreditLedgerEntry, unknown>[]>(
    () => [
      {
        id: "event",
        header: t("commerce:LEDGER_COLUMN_EVENT"),
        meta: { title: t("commerce:LEDGER_COLUMN_EVENT"), kind: "primary" },
        cell: ({ row }) => (
          <div className="min-w-0">
            <BaseTag>{t(`commerce:${ENTRY_LABEL_KEYS[row.original.entryType]}`)}</BaseTag>
            <TruncatedValue>{row.original.description}</TruncatedValue>
          </div>
        ),
        size: 280,
        minSize: 220,
      },
      {
        id: "change",
        header: t("commerce:LEDGER_COLUMN_CHANGE"),
        meta: { title: t("commerce:LEDGER_COLUMN_CHANGE"), kind: "meta" },
        cell: ({ row }) => (
          <div className="text-right font-mono tabular-nums">
            <div>{signedCredits(row.original.deltaBalanceCredits, number)}</div>
            <div className="text-caption text-label-secondary">
              {t("commerce:LEDGER_RESERVED_SHORT", {
                value: signedCredits(row.original.deltaReservedCredits, number),
              })}
            </div>
          </div>
        ),
        size: 130,
      },
      {
        id: "available",
        header: t("commerce:CREDITS_AVAILABLE_LABEL"),
        meta: { title: t("commerce:CREDITS_AVAILABLE_LABEL"), kind: "meta" },
        cell: ({ row }) => (
          <span className="block text-right font-mono tabular-nums">
            {number.format(row.original.balanceAfterCredits - row.original.reservedAfterCredits)}
          </span>
        ),
        size: 120,
      },
      {
        id: "reference",
        header: t("commerce:LEDGER_COLUMN_REFERENCE"),
        meta: { title: t("commerce:LEDGER_COLUMN_REFERENCE"), kind: "meta" },
        cell: ({ row }) => (
          <div className="min-w-0">
            <BaseTag>
              {t(
                `commerce:${
                  REFERENCE_LABEL_KEYS[row.original.referenceType] ??
                  "LEDGER_REFERENCE_UNRECOGNIZED"
                }`,
              )}
            </BaseTag>
            <TruncatedValue mono>{row.original.referenceId ?? "—"}</TruncatedValue>
          </div>
        ),
        size: 240,
      },
      {
        id: "createdAt",
        header: t("commerce:LEDGER_COLUMN_TIME"),
        meta: { title: t("commerce:LEDGER_COLUMN_TIME"), kind: "meta" },
        cell: ({ row }) => (
          <TruncatedValue>{dateTime.formatDateTime(row.original.createdAt)}</TruncatedValue>
        ),
        size: 180,
      },
    ],
    [dateTime, number, t],
  );
  const tableHook = useDataTable<CreditLedgerEntry, { workspaceId: string }>({
    tableId: "workspace-plan-usage-ledger",
    columns,
    initialState: { pageSize: 20 },
    extraQuery: { workspaceId },
    features: { sorting: { enabled: false } },
    fetcher: (params) =>
      listWorkspaceCreditLedger(workspaceId, { page: params.page, size: params.size }),
    queryOptions: { retry: false, meta: { silent: true } },
  });

  return (
    <AdminDataTableSection
      table={tableHook.table}
      emptyText={t("commerce:LEDGER_EMPTY_TITLE")}
      emptyTitle={t("commerce:LEDGER_EMPTY_TITLE")}
      emptyDescription={t("commerce:LEDGER_EMPTY_DESCRIPTION")}
      loading={tableHook.isLoading}
      error={tableHook.error}
      onRetry={() => void tableHook.refetch()}
      t={(key, options) => t(key, options)}
      rowHeight="short"
      wrapHeaders
      refreshing={tableHook.isFetching && !tableHook.isLoading}
      infiniteScroll={tableHook.infiniteScroll}
    />
  );
}
