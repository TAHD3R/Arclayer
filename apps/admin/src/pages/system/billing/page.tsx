import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit3, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ColumnDef } from "@tanstack/react-table";

import {
  listSystemCommercePlans,
  upsertSystemCommercePlan,
  type CommercePlan,
  type CommercePlanUpsert,
} from "@/api/commerce";
import { BaseTag } from "@/components/ui/tags";
import { AdminDataTableSection } from "@/layouts/page-shell/admin-data-table-section";
import { notifySuccessText } from "@/lib/notifications";
import { PlanEditorDialog } from "@/pages/system/billing/plan-editor-dialog";
import {
  SystemSettingItem,
  SystemSettingStack,
} from "@/pages/system/components/system-setting-item";
import { Button } from "@arclayer/ui/button";
import { useDataTableCore } from "@arclayer/ui/data-table";

function formatMoney(valueMicros: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: valueMicros % 1_000_000 === 0 ? 0 : 2,
  }).format(valueMicros / 1_000_000);
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

export function SystemSettingsBillingPage() {
  const { t, i18n } = useTranslation(["commerce", "common"]);
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<CommercePlan | null>(null);
  const catalogQuery = useQuery({
    queryKey: ["system", "commerce", "plans"],
    queryFn: ({ signal }) => listSystemCommercePlans(true, signal),
    retry: false,
  });
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const plans = useMemo(
    () => [...(catalogQuery.data?.items ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [catalogQuery.data?.items],
  );
  const columns = useMemo<ColumnDef<CommercePlan, unknown>[]>(
    () => [
      {
        id: "plan",
        header: t("commerce:SETTINGS_PLAN_NAME"),
        meta: { title: t("commerce:SETTINGS_PLAN_NAME"), kind: "primary" },
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <TruncatedValue>{row.original.name}</TruncatedValue>
              {row.original.isDefault ? (
                <BaseTag className="shrink-0">{t("commerce:SETTINGS_PLAN_DEFAULT")}</BaseTag>
              ) : null}
            </div>
            <TruncatedValue>{row.original.description}</TruncatedValue>
          </div>
        ),
        size: 300,
        minSize: 220,
      },
      {
        id: "status",
        header: t("commerce:SETTINGS_STATUS"),
        meta: { title: t("commerce:SETTINGS_STATUS"), kind: "meta" },
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            <BaseTag color={row.original.isActive ? "green" : "default"}>
              {row.original.isActive
                ? t("commerce:SETTINGS_STATUS_ACTIVE")
                : t("commerce:SETTINGS_STATUS_INACTIVE")}
            </BaseTag>
            <BaseTag>{t(`commerce:TIER_${row.original.tier.toUpperCase()}`)}</BaseTag>
          </div>
        ),
        size: 170,
      },
      {
        id: "credits",
        header: t("commerce:SETTINGS_GRANT"),
        meta: { title: t("commerce:SETTINGS_GRANT"), kind: "meta" },
        cell: ({ row }) => (
          <div className="text-right">
            <div className="font-mono tabular-nums">
              {number.format(row.original.creditGrantAmount)}
            </div>
            <div className="truncate text-caption text-label-secondary">
              {t(`commerce:REFRESH_${row.original.creditRefreshInterval.toUpperCase()}`)}
            </div>
          </div>
        ),
        size: 150,
      },
      {
        id: "monthly",
        header: t("commerce:SETTINGS_PRICE_MONTHLY"),
        meta: { title: t("commerce:SETTINGS_PRICE_MONTHLY"), kind: "meta" },
        cell: ({ row }) => (
          <span className="block text-right font-mono tabular-nums">
            {formatMoney(row.original.priceMonthlyMicros, row.original.currency, locale)}
          </span>
        ),
        size: 130,
      },
      {
        id: "yearly",
        header: t("commerce:SETTINGS_PRICE_YEARLY"),
        meta: { title: t("commerce:SETTINGS_PRICE_YEARLY"), kind: "meta" },
        cell: ({ row }) => (
          <span className="block text-right font-mono tabular-nums">
            {formatMoney(row.original.priceYearlyMicros, row.original.currency, locale)}
          </span>
        ),
        size: 130,
      },
      {
        id: "features",
        header: t("commerce:SETTINGS_FEATURES"),
        meta: { title: t("commerce:SETTINGS_FEATURES"), kind: "meta" },
        cell: ({ row }) => (
          <span className="block text-right font-mono tabular-nums">
            {number.format(row.original.features.filter((feature) => feature.included).length)}
          </span>
        ),
        size: 100,
      },
      {
        id: "actions",
        header: t("commerce:SETTINGS_ACTIONS"),
        meta: { title: t("commerce:SETTINGS_ACTIONS"), kind: "actions" },
        cell: ({ row }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setEditingPlan(row.original);
              setEditorOpen(true);
            }}
          >
            <Edit3 data-icon="inline-start" />
            {t("commerce:SETTINGS_EDIT_PLAN")}
          </Button>
        ),
        size: 120,
      },
    ],
    [locale, number, t],
  );
  const table = useDataTableCore({
    columns,
    data: plans,
    pageCount: plans.length ? 1 : 0,
    initialState: { pageSize: Math.max(plans.length, 10) },
    features: { sorting: { enabled: false } },
  }).table;
  const mutation = useMutation({
    mutationFn: ({ code, payload }: { code: string; payload: CommercePlanUpsert }) =>
      upsertSystemCommercePlan(code, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["system", "commerce", "plans"] });
      notifySuccessText(t("commerce:SETTINGS_PLAN_SAVED"));
      setEditorOpen(false);
      setEditingPlan(null);
    },
  });
  const openNewPlan = () => {
    setEditingPlan(null);
    setEditorOpen(true);
  };

  return (
    <>
      <SystemSettingStack>
        <SystemSettingItem
          id="commerce-billing-provider"
          title={t("commerce:SETTINGS_BILLING_MODE")}
          description={
            catalogQuery.data?.checkoutEnabled
              ? t("commerce:EXTERNAL_CHECKOUT_DESCRIPTION")
              : t("commerce:BILLING_PROVIDER_UNAVAILABLE_DESCRIPTION")
          }
          headerAction={
            <BaseTag color={catalogQuery.data?.checkoutEnabled ? "green" : "gold"}>
              {catalogQuery.data?.billingProvider ?? t("commerce:BILLING_PROVIDER_DISABLED")}
            </BaseTag>
          }
        />

        <section className="flex min-h-[32rem] flex-col gap-3" aria-labelledby="plan-catalog-title">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="plan-catalog-title" className="text-headline text-label-primary">
                {t("commerce:SETTINGS_CATALOG_TITLE")}
              </h2>
              <p className="mt-1 text-callout text-label-secondary">
                {t("commerce:SETTINGS_CATALOG_DESCRIPTION")}
              </p>
            </div>
            <Button type="button" onClick={openNewPlan}>
              <Plus data-icon="inline-start" />
              {t("commerce:SETTINGS_ADD_PLAN")}
            </Button>
          </div>
          <AdminDataTableSection
            table={table}
            emptyText={t("commerce:SETTINGS_EMPTY_TITLE")}
            emptyTitle={t("commerce:SETTINGS_EMPTY_TITLE")}
            emptyDescription={t("commerce:SETTINGS_EMPTY_DESC")}
            loading={catalogQuery.isLoading}
            error={catalogQuery.error ?? mutation.error}
            onRetry={() => void catalogQuery.refetch()}
            t={(key, options) => t(key, options)}
            rowHeight="short"
            wrapHeaders
            refreshing={catalogQuery.isFetching && !catalogQuery.isLoading}
          />
        </section>
      </SystemSettingStack>

      <PlanEditorDialog
        open={editorOpen}
        plan={editingPlan}
        pending={mutation.isPending}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setEditingPlan(null);
        }}
        onSubmit={(code, payload) => mutation.mutateAsync({ code, payload }).then(() => undefined)}
      />
    </>
  );
}
