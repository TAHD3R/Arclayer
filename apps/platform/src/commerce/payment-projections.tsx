import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type {
  CommerceInvoiceStatus,
  CommerceRefundStatus,
  CommerceTransactionKind,
  CommerceTransactionStatus,
} from "@arclayer/platform-openapi";

import {
  listCommerceInvoices,
  listCommerceRefunds,
  listCommerceTransactions,
} from "@/commerce/commerce-api";
import type { AsyncState } from "@/commerce/commerce-ui";
import { CommerceTableToolbar, type CommerceColumn } from "@/components/commerce-data-table";
import { InvoiceTable, RefundTable, TransactionTable } from "@/commerce/payment-projection-tables";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function PaymentProjections() {
  const { t } = useTranslation("commerce");
  const [search, setSearch] = useState("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [sortBy, setSortBy] = useState("occurred_at");
  const [projectionProvider, setProjectionProvider] = useState("");
  const [projectionStatus, setProjectionStatus] = useState<
    CommerceTransactionStatus | CommerceInvoiceStatus | CommerceRefundStatus | undefined
  >();
  const [projectionKind, setProjectionKind] = useState<CommerceTransactionKind | undefined>();
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState("transactions");
  const [refreshing, setRefreshing] = useState(false);
  const transactions = useMonitoringQuery(
    () =>
      listCommerceTransactions({
        page,
        pageSize: 25,
        provider: projectionProvider || undefined,
        status:
          activeTab === "transactions"
            ? (projectionStatus as CommerceTransactionStatus | undefined)
            : undefined,
        kind: projectionKind,
        search: search || undefined,
        sortBy: sortBy === "amount_micros" || sortBy === "status" ? sortBy : "occurred_at",
        sortDirection,
      }),
    [
      activeTab,
      page,
      projectionKind,
      projectionProvider,
      projectionStatus,
      search,
      sortBy,
      sortDirection,
    ],
  );
  const invoices = useMonitoringQuery(
    () =>
      listCommerceInvoices({
        page,
        pageSize: 25,
        provider: projectionProvider || undefined,
        status:
          activeTab === "invoices"
            ? (projectionStatus as CommerceInvoiceStatus | undefined)
            : undefined,
        search: search || undefined,
        sortBy: sortBy === "amount_due_micros" || sortBy === "status" ? sortBy : "issued_at",
        sortDirection,
      }),
    [activeTab, page, projectionProvider, projectionStatus, search, sortBy, sortDirection],
  );
  const refunds = useMonitoringQuery(
    () =>
      listCommerceRefunds({
        page,
        pageSize: 25,
        status:
          activeTab === "refunds"
            ? (projectionStatus as CommerceRefundStatus | undefined)
            : undefined,
        search: search || undefined,
        sortBy: sortBy === "amount_micros" || sortBy === "status" ? sortBy : "created_at",
        sortDirection,
      }),
    [activeTab, page, projectionStatus, search, sortBy, sortDirection],
  );
  const refresh = () => {
    setRefreshing(true);
    transactions.retry();
    invoices.retry();
    refunds.retry();
    window.setTimeout(() => setRefreshing(false), 300);
  };
  const projectionColumns: Record<string, readonly CommerceColumn[]> = {
    transactions: [
      { id: "reference", label: t("REFERENCE") },
      { id: "provider", label: t("PROVIDER") },
      { id: "status", label: t("STATUS") },
      { id: "amount", label: t("AMOUNT") },
      { id: "occurred", label: t("OCCURRED_AT") },
      { id: "actions", label: t("ACTION") },
    ],
    invoices: [
      { id: "reference", label: t("REFERENCE") },
      { id: "provider", label: t("PROVIDER") },
      { id: "status", label: t("STATUS") },
      { id: "amount", label: t("AMOUNT") },
      { id: "issued", label: t("ISSUED_AT") },
    ],
    refunds: [
      { id: "reference", label: t("REFERENCE") },
      { id: "status", label: t("STATUS") },
      { id: "amount", label: t("AMOUNT") },
      { id: "reason", label: t("REASON") },
      { id: "completed", label: t("COMPLETED_AT") },
    ],
  };
  const [visibleProjectionColumns, setVisibleProjectionColumns] = useState<
    Record<string, string[]>
  >(() =>
    Object.fromEntries(
      Object.entries(projectionColumns).map(([key, columns]) => [
        key,
        columns.map((column) => column.id),
      ]),
    ),
  );
  const columns = projectionColumns[activeTab] ?? projectionColumns.transactions;
  const visibleColumns = visibleProjectionColumns[activeTab] ?? columns.map((column) => column.id);
  return (
    <div className="space-y-3 overflow-hidden rounded-lg border bg-card p-3">
      <CommerceTableToolbar
        columns={columns}
        columnsLabel={t("CHOOSE_COLUMNS")}
        filters={
          <div className="flex flex-wrap gap-2">
            <Input
              className="w-36"
              onChange={(event) => {
                setProjectionProvider(event.target.value);
                setPage(1);
              }}
              placeholder={t("PROVIDER_FILTER_PLACEHOLDER")}
              value={projectionProvider}
            />
            <Select
              onValueChange={(value) => {
                setProjectionStatus(
                  value === "all" ? undefined : (value as typeof projectionStatus),
                );
                setPage(1);
              }}
              value={projectionStatus ?? "all"}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder={t("STATUS_FILTER_PLACEHOLDER")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("ALL_STATUSES")}</SelectItem>
                {activeTab === "transactions" ? (
                  <>
                    <SelectItem value="pending">{t("PAYMENT_STATUS_PENDING")}</SelectItem>
                    <SelectItem value="succeeded">{t("PAYMENT_STATUS_SUCCEEDED")}</SelectItem>
                    <SelectItem value="failed">{t("PAYMENT_STATUS_FAILED")}</SelectItem>
                    <SelectItem value="refunded">{t("PAYMENT_STATUS_REFUNDED")}</SelectItem>
                  </>
                ) : activeTab === "invoices" ? (
                  <>
                    <SelectItem value="open">{t("INVOICE_STATUS_OPEN")}</SelectItem>
                    <SelectItem value="paid">{t("INVOICE_STATUS_PAID")}</SelectItem>
                    <SelectItem value="void">{t("INVOICE_STATUS_VOID")}</SelectItem>
                    <SelectItem value="uncollectible">
                      {t("INVOICE_STATUS_UNCOLLECTIBLE")}
                    </SelectItem>
                  </>
                ) : (
                  <>
                    <SelectItem value="pending">{t("REFUND_STATUS_PENDING")}</SelectItem>
                    <SelectItem value="succeeded">{t("REFUND_STATUS_SUCCEEDED")}</SelectItem>
                    <SelectItem value="failed">{t("REFUND_STATUS_FAILED")}</SelectItem>
                    <SelectItem value="canceled">{t("REFUND_STATUS_CANCELED")}</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
            {activeTab === "transactions" ? (
              <Select
                onValueChange={(value) => {
                  setProjectionKind(
                    value === "all" ? undefined : (value as CommerceTransactionKind),
                  );
                  setPage(1);
                }}
                value={projectionKind ?? "all"}
              >
                <SelectTrigger className="w-36">
                  <SelectValue placeholder={t("KIND_FILTER_PLACEHOLDER")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("ALL_KINDS")}</SelectItem>
                  <SelectItem value="subscription">{t("KIND_SUBSCRIPTION")}</SelectItem>
                  <SelectItem value="renewal">{t("KIND_RENEWAL")}</SelectItem>
                  <SelectItem value="top_up">{t("KIND_TOP_UP")}</SelectItem>
                  <SelectItem value="refund">{t("KIND_REFUND")}</SelectItem>
                </SelectContent>
              </Select>
            ) : null}
            <Select
              onValueChange={(value) => {
                setSortBy(value);
                setPage(1);
              }}
              value={sortBy}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder={t("SORT_FIELD_PLACEHOLDER")} />
              </SelectTrigger>
              <SelectContent>
                {activeTab === "transactions" ? (
                  <>
                    <SelectItem value="occurred_at">{t("OCCURRED_AT")}</SelectItem>
                    <SelectItem value="amount_micros">{t("AMOUNT")}</SelectItem>
                    <SelectItem value="status">{t("STATUS")}</SelectItem>
                  </>
                ) : activeTab === "invoices" ? (
                  <>
                    <SelectItem value="issued_at">{t("ISSUED_AT")}</SelectItem>
                    <SelectItem value="amount_due_micros">{t("AMOUNT")}</SelectItem>
                    <SelectItem value="status">{t("STATUS")}</SelectItem>
                  </>
                ) : (
                  <>
                    <SelectItem value="created_at">{t("CREATED_AT")}</SelectItem>
                    <SelectItem value="amount_micros">{t("AMOUNT")}</SelectItem>
                    <SelectItem value="status">{t("STATUS")}</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
            <Select
              onValueChange={(value) => setSortDirection(value as "asc" | "desc")}
              value={sortDirection}
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
        onVisibleColumnsChange={(ids) =>
          setVisibleProjectionColumns((current) => ({ ...current, [activeTab]: [...ids] }))
        }
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        refreshLabel={t("REFRESH")}
        refreshing={refreshing}
        searchPlaceholder={t("PAYMENT_PROJECTIONS_SEARCH")}
        searchValue={search}
        visibleColumns={visibleColumns}
      />
      <Tabs
        onValueChange={(value) => {
          setActiveTab(value);
          setPage(1);
          setProjectionStatus(undefined);
          setProjectionKind(undefined);
          setSortBy(
            value === "transactions"
              ? "occurred_at"
              : value === "invoices"
                ? "issued_at"
                : "created_at",
          );
        }}
        value={activeTab}
      >
        <div className="border-b p-3">
          <TabsList>
            <TabsTrigger value="transactions">{t("TRANSACTIONS")}</TabsTrigger>
            <TabsTrigger value="invoices">{t("INVOICES")}</TabsTrigger>
            <TabsTrigger value="refunds">{t("REFUNDS")}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent className="m-0" value="transactions">
          <ProjectionCard
            data={transactions.state}
            empty={t("NO_TRANSACTIONS")}
            label={t("TRANSACTIONS")}
            render={(data) => (
              <TransactionTable items={data.items} visibleColumns={visibleColumns} />
            )}
          />
        </TabsContent>
        <TabsContent className="m-0" value="invoices">
          <ProjectionCard
            data={invoices.state}
            empty={t("NO_INVOICES")}
            label={t("INVOICES")}
            render={(data) => <InvoiceTable items={data.items} visibleColumns={visibleColumns} />}
          />
        </TabsContent>
        <TabsContent className="m-0" value="refunds">
          <ProjectionCard
            data={refunds.state}
            empty={t("NO_REFUNDS")}
            label={t("REFUNDS")}
            render={(data) => <RefundTable items={data.items} visibleColumns={visibleColumns} />}
          />
        </TabsContent>
      </Tabs>
      <ProjectionPagination
        onNext={() => setPage((current) => current + 1)}
        onPrevious={() => setPage((current) => Math.max(1, current - 1))}
        page={page}
        total={projectionTotal(activeTab, transactions.state, invoices.state, refunds.state)}
      />
    </div>
  );
}

export function ProjectionPagination(
  props: Readonly<{
    page: number;
    pageSize?: number;
    total: number;
    onPrevious: () => void;
    onNext: () => void;
  }>,
) {
  const { t } = useTranslation("commerce");
  const pages = Math.max(1, Math.ceil(props.total / (props.pageSize ?? 25)));
  return (
    <div className="flex items-center justify-between border-t px-3 pt-3 text-sm text-muted-foreground">
      <span>{t("PAGE_OF", { page: props.page, pages, total: props.total })}</span>
      <div className="flex gap-2">
        <Button disabled={props.page <= 1} onClick={props.onPrevious} size="sm" variant="outline">
          {t("PREVIOUS")}
        </Button>
        <Button disabled={props.page >= pages} onClick={props.onNext} size="sm" variant="outline">
          {t("NEXT")}
        </Button>
      </div>
    </div>
  );
}

function projectionTotal(
  activeTab: string,
  transactions: AsyncState<Awaited<ReturnType<typeof listCommerceTransactions>>>,
  invoices: AsyncState<Awaited<ReturnType<typeof listCommerceInvoices>>>,
  refunds: AsyncState<Awaited<ReturnType<typeof listCommerceRefunds>>>,
): number {
  const state =
    activeTab === "transactions" ? transactions : activeTab === "invoices" ? invoices : refunds;
  return state.status === "ready" ? state.data.total : 0;
}

function ProjectionCard<T>(
  props: Readonly<{
    data: AsyncState<T>;
    empty: string;
    label: string;
    render: (data: T) => ReactNode;
  }>,
) {
  return (
    <section className="space-y-3 p-4">
      <h3 className="text-base font-semibold">{props.label}</h3>
      {props.data.status === "ready" ? props.render(props.data.data) : props.empty}
    </section>
  );
}
