import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock3 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  listWorkspaceCommercePlans,
  requestWorkspacePlanChange,
  type BillingCycle,
  type WorkspacePlanOption,
} from "@/api/commerce";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { notifySuccessText } from "@/lib/notifications";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@arclayer/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@arclayer/ui/dialog";
import { Separator } from "@arclayer/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@arclayer/ui/tabs";

type PlanSelectionDialogProps = {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingPlanCode?: string | null;
};

function planPrice(plan: WorkspacePlanOption, cycle: BillingCycle): number {
  return cycle === "yearly" ? plan.priceYearlyMicros : plan.priceMonthlyMicros;
}

function formatPrice(valueMicros: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: valueMicros % 1_000_000 === 0 ? 0 : 2,
  }).format(valueMicros / 1_000_000);
}

function PlanCard(props: {
  plan: WorkspacePlanOption;
  cycle: BillingCycle;
  locale: string;
  pending: boolean;
  pendingPlanCode?: string | null;
  onSelect: (plan: WorkspacePlanOption) => void;
}) {
  const { t } = useTranslation(["commerce"]);
  const price = planPrice(props.plan, props.cycle);
  const isRequested = props.pendingPlanCode === props.plan.code;

  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader className="flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-title3">{props.plan.name}</CardTitle>
            <CardDescription className="mt-1">{props.plan.description}</CardDescription>
          </div>
          {props.plan.isCurrent ? (
            <Badge variant="secondary">{t("commerce:PLAN_CURRENT")}</Badge>
          ) : isRequested ? (
            <Badge variant="outline">{t("commerce:PLAN_PENDING")}</Badge>
          ) : null}
        </div>

        <div className="mt-5 flex items-baseline gap-2">
          <span className="text-title1 font-bold text-label-primary">
            {price === 0
              ? t("commerce:PLAN_PRICE_FREE")
              : formatPrice(price, props.plan.currency, props.locale)}
          </span>
          {price > 0 ? (
            <span className="text-footnote text-label-secondary">
              {props.cycle === "yearly"
                ? t("commerce:PLAN_PER_YEAR")
                : t("commerce:PLAN_PER_MONTH")}
            </span>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div>
          <div className="text-headline text-label-primary">
            {t("commerce:PLAN_CREDITS", {
              count: new Intl.NumberFormat(props.locale).format(props.plan.creditGrantAmount),
            })}
          </div>
          <div className="mt-1 text-footnote text-label-secondary">
            {t(`commerce:REFRESH_${props.plan.creditRefreshInterval.toUpperCase()}`)}
          </div>
        </div>

        <Separator />

        <ul className="flex flex-col gap-3">
          {props.plan.features
            .filter((feature) => feature.included)
            .map((feature) => (
              <li key={feature.key} className="flex items-start gap-2 text-footnote">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  <span className="text-label-primary">{feature.label}</span>
                  {feature.description ? (
                    <span className="mt-0.5 block text-label-secondary">{feature.description}</span>
                  ) : null}
                </span>
              </li>
            ))}
        </ul>
      </CardContent>

      <CardFooter>
        <Button
          type="button"
          className="w-full"
          variant={props.plan.isCurrent ? "outline" : "default"}
          disabled={!props.plan.canSelect || props.plan.isCurrent || isRequested || props.pending}
          loading={props.pending}
          onClick={() => props.onSelect(props.plan)}
        >
          {props.plan.isCurrent
            ? t("commerce:PLAN_CURRENT")
            : isRequested
              ? t("commerce:PLAN_PENDING")
              : t("commerce:PLAN_REQUEST_CHANGE")}
        </Button>
      </CardFooter>
    </Card>
  );
}

export function PlanSelectionDialog({
  workspaceId,
  open,
  onOpenChange,
  pendingPlanCode,
}: PlanSelectionDialogProps) {
  const { t, i18n } = useTranslation(["commerce", "common"]);
  const queryClient = useQueryClient();
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const catalogQuery = useQuery({
    queryKey: ["commerce", "workspace", workspaceId, "plans"],
    queryFn: ({ signal }) => listWorkspaceCommercePlans(workspaceId, signal),
    enabled: open,
    retry: false,
  });
  const plans = useMemo(
    () => [...(catalogQuery.data?.items ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [catalogQuery.data?.items],
  );

  const requestMutation = useMutation({
    mutationFn: (plan: WorkspacePlanOption) =>
      requestWorkspacePlanChange(workspaceId, {
        planCode: plan.code,
        billingInterval: cycle,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["commerce", "workspace", workspaceId, "overview"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["commerce", "workspace", workspaceId, "plans"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["system", "commerce", "subscription-change-requests"],
        }),
      ]);
      notifySuccessText(t("commerce:PLAN_REQUEST_SUCCESS"));
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-5xl"
        closeButtonLabel={t("common:CLOSE")}
      >
        <DialogHeader>
          <DialogTitle>{t("commerce:PLAN_DIALOG_TITLE")}</DialogTitle>
          <DialogDescription>{t("commerce:PLAN_DIALOG_DESCRIPTION")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className="flex justify-center">
            <Tabs value={cycle} onValueChange={(value) => setCycle(value as BillingCycle)}>
              <TabsList aria-label={t("commerce:BILLING_INTERVAL")}>
                <TabsTrigger value="monthly">{t("commerce:BILLING_MONTHLY")}</TabsTrigger>
                <TabsTrigger value="yearly">{t("commerce:BILLING_YEARLY")}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <Alert>
            <Clock3 aria-hidden="true" />
            <AlertTitle>{t("commerce:OPERATOR_MANAGED_TITLE")}</AlertTitle>
            <AlertDescription>{t("commerce:OPERATOR_MANAGED_DESCRIPTION")}</AlertDescription>
          </Alert>

          <ContentGuard
            loading={catalogQuery.isLoading}
            error={catalogQuery.error ?? requestMutation.error}
            empty={!catalogQuery.isLoading && !catalogQuery.error && plans.length === 0}
            onRetry={() => void catalogQuery.refetch()}
            loadingVariant="masonry"
            variant="compact"
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {plans.map((plan) => (
                <PlanCard
                  key={plan.code}
                  plan={plan}
                  cycle={cycle}
                  locale={i18n.resolvedLanguage ?? i18n.language}
                  pending={
                    requestMutation.isPending && requestMutation.variables?.code === plan.code
                  }
                  pendingPlanCode={pendingPlanCode}
                  onSelect={(selectedPlan) => requestMutation.mutate(selectedPlan)}
                />
              ))}
            </div>
          </ContentGuard>
        </div>
      </DialogContent>
    </Dialog>
  );
}
