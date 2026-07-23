import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { ArrowRight, CalendarSync, Coins, ReceiptText } from "lucide-react";
import { z } from "zod";

import type {
  BillingCycle,
  CommercePlan,
  SubscriptionStatus,
  WorkspaceCommerceOverview,
} from "@/api/commerce";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Button } from "@arclayer/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { Switch } from "@arclayer/ui/switch";

import {
  useSetSystemWorkspaceSubscription,
  useSystemCommercePlanCatalog,
} from "./workspace-operations-hooks";

type PlanAdjustmentValues = {
  planCode: string;
  billingInterval: BillingCycle;
  status: SubscriptionStatus;
  cancelAtPeriodEnd: boolean;
};

const SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  "trialing",
  "active",
  "past_due",
  "canceled",
];

function initialValues(overview: WorkspaceCommerceOverview | null): PlanAdjustmentValues {
  return {
    planCode: overview?.plan.code ?? "",
    billingInterval: overview?.subscription.billingInterval ?? "monthly",
    status: overview?.subscription.status ?? "active",
    cancelAtPeriodEnd: overview?.subscription.cancelAtPeriodEnd ?? false,
  };
}

function subscriptionStatusKey(status: SubscriptionStatus) {
  return `settings:SETTINGS_SYSTEM_DIRECTORY_SUBSCRIPTION_STATUS_${status.toUpperCase()}`;
}

function ReviewValue(props: { label: string; value: string; emphasized?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-label-secondary">{props.label}</dt>
      <dd
        className={
          props.emphasized
            ? "mt-1 truncate text-headline font-semibold text-label-primary"
            : "mt-1 truncate text-footnote font-medium text-label-primary"
        }
      >
        {props.value}
      </dd>
    </div>
  );
}

function PlanChangeReview(props: {
  current: WorkspaceCommerceOverview;
  nextPlan: CommercePlan | null;
  values: PlanAdjustmentValues;
  locale: string;
}) {
  const { t } = useTranslation(["settings", "commerce"]);
  const number = useMemo(() => new Intl.NumberFormat(props.locale), [props.locale]);
  const nextPlanName = props.nextPlan?.name ?? t("settings:SETTINGS_SYSTEM_DIRECTORY_PLAN_UNKNOWN");
  const nextCreditGrant = props.nextPlan
    ? number.format(props.nextPlan.creditGrantAmount)
    : t("settings:SETTINGS_SYSTEM_DIRECTORY_PLAN_UNKNOWN");

  return (
    <section
      className="rounded-lg border bg-muted/25 p-4"
      aria-label={t("settings:SETTINGS_SYSTEM_DIRECTORY_PLAN_REVIEW_TITLE")}
    >
      <div className="mb-4 flex items-center gap-2">
        <ReceiptText className="size-4 text-label-secondary" aria-hidden="true" />
        <h3 className="text-headline font-semibold text-label-primary">
          {t("settings:SETTINGS_SYSTEM_DIRECTORY_PLAN_REVIEW_TITLE")}
        </h3>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <ReviewValue
          label={t("settings:SETTINGS_SYSTEM_DIRECTORY_PLAN_CURRENT")}
          value={props.current.plan.name}
          emphasized
        />
        <ArrowRight className="size-4 text-label-tertiary" aria-hidden="true" />
        <ReviewValue
          label={t("settings:SETTINGS_SYSTEM_DIRECTORY_PLAN_AFTER")}
          value={nextPlanName}
          emphasized
        />
      </div>

      <dl className="mt-4 grid gap-4 border-t pt-4 sm:grid-cols-2">
        <ReviewValue
          label={t("commerce:BILLING_INTERVAL")}
          value={t(
            props.values.billingInterval === "yearly"
              ? "commerce:BILLING_YEARLY"
              : "commerce:BILLING_MONTHLY",
          )}
        />
        <ReviewValue
          label={t("settings:SETTINGS_SYSTEM_DIRECTORY_SUBSCRIPTION_STATUS")}
          value={t(subscriptionStatusKey(props.values.status))}
        />
        <ReviewValue
          label={t("settings:SETTINGS_SYSTEM_DIRECTORY_PLAN_CREDIT_GRANT_AFTER")}
          value={nextCreditGrant}
        />
        <ReviewValue
          label={t("settings:SETTINGS_SYSTEM_DIRECTORY_PLAN_CANCELLATION")}
          value={t(
            props.values.cancelAtPeriodEnd
              ? "settings:SETTINGS_SYSTEM_DIRECTORY_PLAN_CANCEL_AT_PERIOD_END"
              : "settings:SETTINGS_SYSTEM_DIRECTORY_PLAN_CONTINUES",
          )}
        />
      </dl>
    </section>
  );
}

export function WorkspacePlanAdjustmentDialog(props: {
  open: boolean;
  workspaceId: string | null;
  workspaceName: string | null;
  overview: WorkspaceCommerceOverview | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation(["settings", "commerce", "common"]);
  const catalogQuery = useSystemCommercePlanCatalog(props.open);
  const mutation = useSetSystemWorkspaceSubscription();
  const schema = useMemo(
    () =>
      z.object({
        planCode: z.string().trim().min(1, t("settings:SETTINGS_SYSTEM_DIRECTORY_PLAN_REQUIRED")),
        billingInterval: z.enum(["monthly", "yearly"]),
        status: z.enum(["trialing", "active", "past_due", "canceled"]),
        cancelAtPeriodEnd: z.boolean(),
      }),
    [t],
  );
  const form = useForm<PlanAdjustmentValues>({
    resolver: zodResolver(schema),
    defaultValues: initialValues(props.overview),
  });

  useEffect(() => {
    if (props.open) form.reset(initialValues(props.overview));
  }, [form, props.open, props.overview]);

  const values = form.watch();
  const plans = useMemo(
    () => [...(catalogQuery.data?.items ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [catalogQuery.data?.items],
  );
  const nextPlan = plans.find((plan) => plan.code === values.planCode) ?? null;
  const submit = form.handleSubmit(async (nextValues) => {
    if (!props.workspaceId) return;
    await mutation.mutateAsync({ workspaceId: props.workspaceId, ...nextValues });
    props.onOpenChange(false);
  });

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={(open) => {
        if (!mutation.isPending) props.onOpenChange(open);
      }}
      closeButtonLabel={t("common:CLOSE")}
      title={t("settings:SETTINGS_SYSTEM_DIRECTORY_PLAN_ADJUST_TITLE", {
        workspace: props.workspaceName ?? "",
      })}
      description={t("settings:SETTINGS_SYSTEM_DIRECTORY_PLAN_ADJUST_DESC")}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => props.onOpenChange(false)}
          >
            {t("common:CANCEL")}
          </Button>
          <Button
            type="button"
            loading={mutation.isPending}
            disabled={mutation.isPending || !props.workspaceId || !props.overview}
            onClick={() => void submit()}
          >
            {t("settings:SETTINGS_SYSTEM_DIRECTORY_PLAN_CONFIRM")}
          </Button>
        </div>
      }
    >
      <ContentGuard
        loading={catalogQuery.isLoading}
        error={catalogQuery.error}
        empty={!catalogQuery.isLoading && !catalogQuery.error && plans.length === 0}
        onRetry={() => void catalogQuery.refetch()}
        loadingVariant="form"
        variant="compact"
      >
        {props.overview ? (
          <form onSubmit={submit} className="space-y-5">
            <SettingDialogFields>
              <SettingDialogField
                title={t("settings:SETTINGS_SYSTEM_DIRECTORY_PLAN_AFTER")}
                description={t("settings:SETTINGS_SYSTEM_DIRECTORY_PLAN_SELECT_DESC")}
                error={form.formState.errors.planCode?.message}
              >
                <Controller
                  control={form.control}
                  name="planCode"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger aria-invalid={Boolean(form.formState.errors.planCode)}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {plans.map((plan) => (
                          <SelectItem key={plan.code} value={plan.code}>
                            {plan.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </SettingDialogField>

              <div className="grid gap-5 sm:grid-cols-2">
                <SettingDialogField title={t("commerce:BILLING_INTERVAL")}>
                  <Controller
                    control={form.control}
                    name="billingInterval"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monthly">{t("commerce:BILLING_MONTHLY")}</SelectItem>
                          <SelectItem value="yearly">{t("commerce:BILLING_YEARLY")}</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </SettingDialogField>

                <SettingDialogField
                  title={t("settings:SETTINGS_SYSTEM_DIRECTORY_SUBSCRIPTION_STATUS")}
                >
                  <Controller
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SUBSCRIPTION_STATUSES.map((status) => (
                            <SelectItem key={status} value={status}>
                              {t(subscriptionStatusKey(status))}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </SettingDialogField>
              </div>

              <SettingDialogField
                title={t("settings:SETTINGS_SYSTEM_DIRECTORY_PLAN_CANCELLATION")}
                description={t("settings:SETTINGS_SYSTEM_DIRECTORY_PLAN_CANCELLATION_DESC")}
                controlClassName="flex items-center justify-between rounded-lg border px-4 py-3"
              >
                <span className="text-footnote text-label-primary">
                  {t("settings:SETTINGS_SYSTEM_DIRECTORY_PLAN_CANCEL_AT_PERIOD_END")}
                </span>
                <Controller
                  control={form.control}
                  name="cancelAtPeriodEnd"
                  render={({ field }) => (
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  )}
                />
              </SettingDialogField>
            </SettingDialogFields>

            <PlanChangeReview
              current={props.overview}
              nextPlan={nextPlan}
              values={values}
              locale={i18n.resolvedLanguage ?? i18n.language}
            />

            <Alert variant="destructive">
              <Coins aria-hidden="true" />
              <AlertTitle>{t("settings:SETTINGS_SYSTEM_DIRECTORY_PLAN_EFFECT_TITLE")}</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>{t("settings:SETTINGS_SYSTEM_DIRECTORY_PLAN_EFFECT_CREDITS")}</p>
                <p className="flex items-start gap-2">
                  <CalendarSync className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{t("settings:SETTINGS_SYSTEM_DIRECTORY_PLAN_EFFECT_PERIOD")}</span>
                </p>
                <p>{t("settings:SETTINGS_SYSTEM_DIRECTORY_PLAN_EFFECT_PROVIDER")}</p>
                <p>{t("settings:SETTINGS_SYSTEM_DIRECTORY_PLAN_EFFECT_AUDIT")}</p>
              </AlertDescription>
            </Alert>
          </form>
        ) : null}
      </ContentGuard>
    </SettingDialog>
  );
}
