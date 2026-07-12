import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit3, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  listSystemCommercePlans,
  upsertSystemCommercePlan,
  type CommercePlan,
  type CommercePlanUpsert,
} from "@/api/commerce";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { notifySuccessText } from "@/lib/notifications";
import { SubscriptionChangeRequestReview } from "@/pages/system/billing/change-request-review";
import { PlanEditorDialog } from "@/pages/system/billing/plan-editor-dialog";
import {
  SystemSettingItem,
  SystemSettingRow,
  SystemSettingStack,
} from "@/pages/system/components/system-setting-item";
import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
import { Separator } from "@arclayer/ui/separator";

function formatMoney(valueMicros: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: valueMicros % 1_000_000 === 0 ? 0 : 2,
  }).format(valueMicros / 1_000_000);
}

function PlanSettingItem(props: {
  plan: CommercePlan;
  locale: string;
  onEdit: (plan: CommercePlan) => void;
}) {
  const { t } = useTranslation(["commerce"]);
  const number = new Intl.NumberFormat(props.locale, { maximumFractionDigits: 0 });

  return (
    <SystemSettingItem
      id={`commerce-plan-${props.plan.code}`}
      title={props.plan.name}
      description={props.plan.description}
      headerAction={
        <Button type="button" variant="outline" size="sm" onClick={() => props.onEdit(props.plan)}>
          <Edit3 data-icon="inline-start" />
          {t("commerce:SETTINGS_EDIT_PLAN")}
        </Button>
      }
    >
      <div className="flex flex-wrap gap-2">
        <Badge variant={props.plan.isActive ? "secondary" : "outline"}>
          {props.plan.isActive
            ? t("commerce:SETTINGS_STATUS_ACTIVE")
            : t("commerce:SETTINGS_STATUS_INACTIVE")}
        </Badge>
        {props.plan.isDefault ? (
          <Badge variant="outline">{t("commerce:SETTINGS_PLAN_DEFAULT")}</Badge>
        ) : null}
        <Badge variant="outline">{t(`commerce:TIER_${props.plan.tier.toUpperCase()}`)}</Badge>
      </div>

      <Separator className="my-4" />

      <div className="grid gap-x-8 lg:grid-cols-2">
        <SystemSettingRow
          title={t("commerce:SETTINGS_GRANT")}
          control={number.format(props.plan.creditGrantAmount)}
        />
        <SystemSettingRow
          title={t("commerce:SETTINGS_CREDIT_VALUE")}
          control={number.format(props.plan.creditValueMicros)}
        />
        <SystemSettingRow
          title={t("commerce:SETTINGS_PRICE_MONTHLY")}
          control={formatMoney(props.plan.priceMonthlyMicros, props.plan.currency, props.locale)}
        />
        <SystemSettingRow
          title={t("commerce:SETTINGS_PRICE_YEARLY")}
          control={formatMoney(props.plan.priceYearlyMicros, props.plan.currency, props.locale)}
        />
      </div>

      {props.plan.features.length > 0 ? (
        <>
          <Separator className="my-4" />
          <div className="flex flex-col gap-3">
            {props.plan.features.map((feature) => (
              <SystemSettingRow
                key={feature.key}
                title={feature.label}
                description={feature.description}
                control={
                  <Badge variant={feature.included ? "secondary" : "outline"}>
                    {feature.included
                      ? t("commerce:SETTINGS_FEATURE_INCLUDED")
                      : t("commerce:SETTINGS_FEATURE_EXCLUDED")}
                  </Badge>
                }
              />
            ))}
          </div>
        </>
      ) : null}
    </SystemSettingItem>
  );
}

export function SystemSettingsBillingPage() {
  const { t, i18n } = useTranslation(["commerce"]);
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<CommercePlan | null>(null);
  const plansQuery = useQuery({
    queryKey: ["system", "commerce", "plans"],
    queryFn: ({ signal }) => listSystemCommercePlans(true, signal),
    retry: false,
  });
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
  const plans = [...(plansQuery.data?.items ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const locale = i18n.resolvedLanguage ?? i18n.language;

  return (
    <>
      <SystemSettingStack>
        <ContentGuard
          loading={plansQuery.isLoading}
          error={plansQuery.error ?? mutation.error}
          empty={!plansQuery.isLoading && !plansQuery.error && plans.length === 0}
          emptyTitle={t("commerce:SETTINGS_EMPTY_TITLE")}
          emptyDescription={t("commerce:SETTINGS_EMPTY_DESC")}
          emptyExtra={
            <Button
              type="button"
              onClick={() => {
                setEditingPlan(null);
                setEditorOpen(true);
              }}
            >
              <Plus data-icon="inline-start" />
              {t("commerce:SETTINGS_ADD_PLAN")}
            </Button>
          }
          onRetry={() => void plansQuery.refetch()}
        >
          <SystemSettingItem
            id="commerce-plan-catalog"
            title={t("commerce:SETTINGS_CATALOG_TITLE")}
            description={t("commerce:SETTINGS_CATALOG_DESCRIPTION")}
            headerAction={
              <Button
                type="button"
                onClick={() => {
                  setEditingPlan(null);
                  setEditorOpen(true);
                }}
              >
                <Plus data-icon="inline-start" />
                {t("commerce:SETTINGS_ADD_PLAN")}
              </Button>
            }
          >
            <SystemSettingRow
              title={t("commerce:SETTINGS_BILLING_MODE")}
              description={t("commerce:OPERATOR_MANAGED_DESCRIPTION")}
              control={<Badge variant="secondary">{t("commerce:OPERATOR_MANAGED_TITLE")}</Badge>}
            />
          </SystemSettingItem>

          {plans.map((plan) => (
            <PlanSettingItem
              key={plan.code}
              plan={plan}
              locale={locale}
              onEdit={(nextPlan) => {
                setEditingPlan(nextPlan);
                setEditorOpen(true);
              }}
            />
          ))}
        </ContentGuard>

        <SubscriptionChangeRequestReview />
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
