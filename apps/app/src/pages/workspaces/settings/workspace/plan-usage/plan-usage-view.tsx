import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { CommercialAccessRecoveryView, WorkspaceCommerceOverview } from "@/api/commerce";
import { CreditLedgerTable } from "@/components/commerce/credit-ledger-table";
import { PlanSelectionDialog } from "@/components/commerce/plan-selection-dialog";
import { SettingsSectionAnchor } from "@/components/layout/settings-screen-provider";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";
import { Skeleton } from "@arclayer/ui/skeleton";
import { DefaultMemberCreditLimitEditor } from "./default-member-credit-limit-editor";
import { MemberCreditUsageTable } from "./member-credit-usage-table";
import { usePlanUsageController } from "./use-plan-usage-controller";

function subscriptionBadgeVariant(status: WorkspaceCommerceOverview["subscription"]["status"]) {
  if (status === "active") return "default" as const;
  if (status === "past_due") return "destructive" as const;
  return "secondary" as const;
}

function Metric(props: { label: string; value: string; supporting: string }) {
  return (
    <div className="min-w-0 border-b border-border/60 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:px-5 sm:first:pl-0 sm:last:border-r-0 sm:last:pr-0">
      <div className="text-footnote text-label-secondary">{props.label}</div>
      <div className="mt-2 truncate text-title2 font-semibold tabular-nums text-label-primary">
        {props.value}
      </div>
      <p className="mt-1 text-caption text-label-secondary">{props.supporting}</p>
    </div>
  );
}

function PlanSummary(props: {
  overview: WorkspaceCommerceOverview;
  canManage: boolean;
  accessStatus: "loading" | "error" | "view" | "manage";
  portalPending: boolean;
  onManageSubscription: () => void;
  onComparePlans: () => void;
}) {
  const { t, i18n } = useTranslation(["commerce"]);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const date = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }), [locale]);
  const isFreePlan = props.overview.planRevision.planCode === "free";

  return (
    <Card>
      <CardHeader className="gap-4 border-b sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-title2">
              {t(props.overview.planRevision.nameI18NKey)}
            </CardTitle>
            <Badge variant={subscriptionBadgeVariant(props.overview.subscription.status)}>
              {t(
                `commerce:SUBSCRIPTION_STATUS_${props.overview.subscription.status.toUpperCase()}`,
              )}
            </Badge>
          </div>
          <CardDescription className="mt-1">
            {t(props.overview.planRevision.descriptionI18NKey)}
          </CardDescription>
        </div>
        {props.accessStatus === "loading" ? (
          <div
            className="flex gap-2"
            aria-label={t("commerce:PLAN_ACTIONS_LOADING")}
            aria-live="polite"
            role="status"
          >
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-28" />
          </div>
        ) : props.canManage ? (
          <div className="flex flex-wrap gap-2">
            {!isFreePlan ? (
              <Button
                variant="outline"
                loading={props.portalPending}
                onClick={props.onManageSubscription}
              >
                {t("commerce:PLAN_MANAGE_SUBSCRIPTION")}
              </Button>
            ) : null}
            <Button onClick={props.onComparePlans}>{t("commerce:PLAN_COMPARE_ACTION")}</Button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid sm:grid-cols-3">
          <Metric
            label={t("commerce:CREDITS_AVAILABLE_LABEL")}
            value={number.format(props.overview.credits.available)}
            supporting={t("commerce:PLAN_CREDITS_INCLUDED", {
              count: number.format(props.overview.planRevision.creditGrantAmount),
            })}
          />
          <Metric
            label={t("commerce:CREDITS_RESERVED")}
            value={number.format(props.overview.credits.reserved)}
            supporting={t("commerce:CREDITS_RESERVED_DESCRIPTION")}
          />
          <Metric
            label={t("commerce:USAGE_REQUESTS")}
            value={number.format(props.overview.usage.requests)}
            supporting={t("commerce:USAGE_REQUESTS_DESCRIPTION")}
          />
        </div>
        <dl className="grid gap-4 border-t border-border/60 pt-5 text-footnote sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-label-secondary">{t("commerce:CREDITS_PERIOD")}</dt>
            <dd className="mt-1 text-label-primary">
              {t("commerce:CREDITS_PERIOD_RANGE", {
                start: date.format(new Date(props.overview.credits.periodStart)),
                end: date.format(new Date(props.overview.credits.periodEnd)),
              })}
            </dd>
          </div>
          <div>
            <dt className="text-label-secondary">{t("commerce:CREDITS_NEXT_REFRESH")}</dt>
            <dd className="mt-1 text-label-primary">
              {props.overview.credits.nextRefreshAt
                ? t("commerce:CREDITS_REFRESH_DATE", {
                    date: date.format(new Date(props.overview.credits.nextRefreshAt)),
                  })
                : t("commerce:CREDITS_NO_AUTOMATIC_REFRESH")}
            </dd>
          </div>
          {!isFreePlan ? (
            <div>
              <dt className="text-label-secondary">{t("commerce:SUBSCRIPTION_STATUS_LABEL")}</dt>
              <dd className="mt-1 text-label-primary">
                {props.overview.subscription.cancelAtPeriodEnd
                  ? t("commerce:SUBSCRIPTION_CANCELS_AT", {
                      date: date.format(new Date(props.overview.subscription.currentPeriodEnd)),
                    })
                  : t("commerce:SUBSCRIPTION_RENEWS_AT", {
                      date: date.format(new Date(props.overview.subscription.currentPeriodEnd)),
                    })}
              </dd>
            </div>
          ) : null}
        </dl>
      </CardContent>
    </Card>
  );
}

function PaymentRecoverySummary(props: {
  recovery: CommercialAccessRecoveryView;
  pending: boolean;
  onRecover: () => void;
}) {
  const { t, i18n } = useTranslation(["commerce"]);
  const date = useMemo(
    () => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, { dateStyle: "medium" }),
    [i18n.language, i18n.resolvedLanguage],
  );
  const restricted = props.recovery.state === "payment_restricted";
  const grace = props.recovery.state === "payment_grace";
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>{t("commerce:PAYMENT_RECOVERY_TITLE")}</CardTitle>
            <CardDescription>{t("commerce:PAYMENT_RECOVERY_DESCRIPTION")}</CardDescription>
          </div>
          <Badge variant={restricted ? "destructive" : grace ? "secondary" : "default"}>
            {t(`commerce:PAYMENT_STATE_${props.recovery.state.toUpperCase()}`)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-callout text-label-secondary">
          {props.recovery.recoveryDeadline
            ? t("commerce:PAYMENT_RECOVERY_DEADLINE", {
                date: date.format(new Date(props.recovery.recoveryDeadline)),
              })
            : t("commerce:PAYMENT_RECOVERY_CURRENT")}
        </p>
        {props.recovery.permittedRecoveryAction ? (
          <Button loading={props.pending} onClick={props.onRecover} variant="outline">
            {t("commerce:OPEN_PAYMENT_RECOVERY")}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function WorkspacePlanUsageView({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation(["commerce", "common"]);
  const [plansOpen, setPlansOpen] = useState(false);
  const controller = usePlanUsageController(workspaceId);
  const overview = controller.overviewQuery.data;

  return (
    <ContentGuard
      loading={controller.overviewQuery.isLoading}
      error={controller.overviewQuery.error}
      onRetry={() => void controller.overviewQuery.refetch()}
      loadingVariant="form"
    >
      {overview ? (
        <div className="flex flex-col gap-8 pb-8">
          <PlanSummary
            overview={overview}
            canManage={controller.canManageCommerce}
            accessStatus={controller.managementAccessStatus}
            portalPending={controller.billingPortalMutation.isPending}
            onManageSubscription={() => controller.billingPortalMutation.mutate()}
            onComparePlans={() => setPlansOpen(true)}
          />

          {controller.canManageCommerce && controller.recoveryQuery.data ? (
            <PaymentRecoverySummary
              recovery={controller.recoveryQuery.data}
              pending={controller.billingPortalMutation.isPending}
              onRecover={() => controller.billingPortalMutation.mutate()}
            />
          ) : null}

          {controller.managementAccessStatus === "error" ? (
            <Alert>
              <AlertTitle>{t("commerce:PLAN_MANAGEMENT_ACCESS_ERROR_TITLE")}</AlertTitle>
              <AlertDescription>
                <p>{t("commerce:PLAN_MANAGEMENT_ACCESS_ERROR_DESCRIPTION")}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void controller.retryPermission()}
                >
                  {t("common:RETRY")}
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          {controller.canManageCommerce ? (
            <ContentGuard
              loading={controller.limitsQuery.isLoading}
              error={controller.limitsQuery.error}
              onRetry={() => void controller.limitsQuery.refetch()}
              loadingVariant="form"
            >
              {controller.limitsQuery.data ? (
                <SettingsSectionAnchor section="default-member-credit-limit">
                  <DefaultMemberCreditLimitEditor
                    limit={controller.limitsQuery.data.defaultLimit}
                    configurationRevision={controller.limitsQuery.data.configurationRevision}
                    pending={controller.defaultLimitPending}
                    feedback={controller.defaultLimitFeedback}
                    onEdit={controller.clearDefaultLimitFeedback}
                    onSave={controller.saveDefaultLimit}
                  />
                </SettingsSectionAnchor>
              ) : null}
            </ContentGuard>
          ) : null}

          <section
            className="flex min-h-[24rem] flex-col gap-3"
            aria-labelledby="member-usage-title"
          >
            <div>
              <h2 id="member-usage-title" className="text-headline text-label-primary">
                {t("commerce:MEMBER_USAGE_TITLE")}
              </h2>
              <p className="mt-1 text-callout text-label-secondary">
                {controller.canManageCommerce
                  ? t("commerce:MEMBER_USAGE_WORKSPACE_DESCRIPTION")
                  : t("commerce:MEMBER_USAGE_SELF_DESCRIPTION")}
              </p>
            </div>
            <MemberCreditUsageTable workspaceId={workspaceId} />
          </section>

          {controller.canManageCommerce ? (
            <section
              className="flex min-h-[30rem] flex-col gap-3 border-t border-border/60 pt-8"
              aria-labelledby="credit-ledger-title"
            >
              <div>
                <h2 id="credit-ledger-title" className="text-headline text-label-primary">
                  {t("commerce:LEDGER_DIALOG_TITLE")}
                </h2>
                <p className="mt-1 text-callout text-label-secondary">
                  {t("commerce:LEDGER_SECONDARY_DESCRIPTION")}
                </p>
              </div>
              <CreditLedgerTable workspaceId={workspaceId} />
            </section>
          ) : null}

          {controller.canManageCommerce ? (
            <PlanSelectionDialog
              workspaceId={workspaceId}
              open={plansOpen}
              onOpenChange={setPlansOpen}
            />
          ) : null}
        </div>
      ) : null}
    </ContentGuard>
  );
}
