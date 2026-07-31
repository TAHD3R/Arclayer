import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  createWorkspaceCheckoutSession,
  getWorkspaceCommerceOverview,
  listWorkspaceCommercePlans,
  type BillingCycle,
  type WorkspacePlanOption,
} from "@/api/commerce";
import { planAccessConvergenceApi } from "@/api/plan-access-convergence";
import { PlanAccessConvergenceReview } from "@/components/plan-access-convergence";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
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
};

type PlanCheckoutChoice = Readonly<{
  plan: WorkspacePlanOption;
  billingCycle: BillingCycle;
}>;

function PlanCard(props: {
  plan: WorkspacePlanOption;
  checkoutEnabled: boolean;
  onSelect: (plan: WorkspacePlanOption) => void;
}) {
  const { t, i18n } = useTranslation(["commerce"]);
  const number = new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language);
  const selectable =
    props.checkoutEnabled && props.plan.canSelect && props.plan.isSelling && !props.plan.isCurrent;

  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader className="flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-title3">{t(props.plan.nameI18NKey)}</CardTitle>
            <CardDescription className="mt-1">{t(props.plan.descriptionI18NKey)}</CardDescription>
          </div>
          {props.plan.isCurrent ? (
            <Badge variant="secondary">{t("commerce:PLAN_CURRENT")}</Badge>
          ) : null}
        </div>
        <div className="mt-4 text-footnote text-label-secondary">
          {t("commerce:PLAN_REVISION", { sequence: props.plan.sequence })}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div>
          <div className="text-headline text-label-primary">
            {t("commerce:PLAN_CREDITS", {
              count: number.format(props.plan.creditGrantAmount),
            })}
          </div>
          <div className="mt-1 text-footnote text-label-secondary">
            {t(`commerce:REFRESH_${props.plan.creditRefreshInterval.toUpperCase()}`)}
          </div>
        </div>
        <Separator />
        <p className="text-footnote text-label-secondary">
          {t("commerce:PLAN_TERMS_AVAILABLE_AT_CHECKOUT")}
        </p>
      </CardContent>

      <CardFooter>
        <Button
          type="button"
          className="w-full"
          variant={props.plan.isCurrent ? "outline" : "default"}
          disabled={!selectable}
          onClick={() => props.onSelect(props.plan)}
        >
          {props.plan.isCurrent
            ? t("commerce:PLAN_CURRENT")
            : selectable
              ? t("commerce:PLAN_REVIEW_CHANGE_ACTION")
              : t("commerce:PLAN_SELECTION_UNAVAILABLE")}
          {selectable ? <ArrowRight data-icon="inline-end" aria-hidden="true" /> : null}
        </Button>
      </CardFooter>
    </Card>
  );
}

export function PlanSelectionDialog({ workspaceId, open, onOpenChange }: PlanSelectionDialogProps) {
  const { t } = useTranslation(["commerce", "common", "planChange"]);
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [selectedChoice, setSelectedChoice] = useState<PlanCheckoutChoice | null>(null);
  const catalogQuery = useQuery({
    queryKey: ["commerce", "workspace", workspaceId, "plans"],
    queryFn: ({ signal }) => listWorkspaceCommercePlans(workspaceId, signal),
    enabled: open,
    retry: false,
  });
  const overviewQuery = useQuery({
    queryKey: ["commerce", "workspace", workspaceId, "overview"],
    queryFn: ({ signal }) => getWorkspaceCommerceOverview(workspaceId, signal),
    enabled: open,
    retry: false,
  });
  const plans = catalogQuery.data?.items ?? [];
  const checkoutMutation = useMutation({
    mutationFn: async (choice: PlanCheckoutChoice) => {
      const redirect = await createWorkspaceCheckoutSession(workspaceId, {
        planCode: choice.plan.planCode,
        billingInterval: choice.billingCycle,
      });
      window.location.assign(redirect.url);
    },
  });
  const selectedPlan = selectedChoice?.plan ?? null;
  const overview = overviewQuery.data;

  useEffect(() => {
    if (!open) setSelectedChoice(null);
  }, [open]);

  function handleOpenChange(nextOpen: boolean): void {
    if (!nextOpen) setSelectedChoice(null);
    onOpenChange(nextOpen);
  }

  function resolveQueuedEffectLabel(effectType: string): string {
    if (effectType === "site.generate") {
      return t("planChange:QUEUED_EFFECT_SITE_GENERATION");
    }
    throw new Error(`Unsupported plan-access queued effect: ${effectType}`);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-5xl"
        closeButtonLabel={t("common:CLOSE")}
      >
        <DialogHeader>
          <DialogTitle>{t("commerce:PLAN_DIALOG_TITLE")}</DialogTitle>
          <DialogDescription>{t("commerce:PLAN_DIALOG_DESCRIPTION")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {!selectedChoice ? (
            <div className="flex justify-center">
              <Tabs value={cycle} onValueChange={(value) => setCycle(value as BillingCycle)}>
                <TabsList aria-label={t("commerce:BILLING_INTERVAL")}>
                  <TabsTrigger value="monthly">{t("commerce:BILLING_MONTHLY")}</TabsTrigger>
                  <TabsTrigger value="yearly">{t("commerce:BILLING_YEARLY")}</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          ) : null}

          <Alert>
            <ShieldCheck aria-hidden="true" />
            <AlertTitle>
              {catalogQuery.data?.checkoutEnabled
                ? t("commerce:EXTERNAL_CHECKOUT_TITLE")
                : t("commerce:BILLING_PROVIDER_UNAVAILABLE_TITLE")}
            </AlertTitle>
            <AlertDescription>
              {catalogQuery.data?.checkoutEnabled
                ? t("commerce:EXTERNAL_CHECKOUT_DESCRIPTION")
                : t("commerce:BILLING_PROVIDER_UNAVAILABLE_DESCRIPTION")}
            </AlertDescription>
          </Alert>

          <ContentGuard
            loading={catalogQuery.isLoading || overviewQuery.isLoading}
            error={catalogQuery.error ?? overviewQuery.error ?? checkoutMutation.error}
            empty={
              !catalogQuery.isLoading &&
              !overviewQuery.isLoading &&
              !catalogQuery.error &&
              !overviewQuery.error &&
              plans.length === 0
            }
            onRetry={() => void catalogQuery.refetch()}
            loadingVariant="masonry"
            variant="compact"
          >
            {selectedPlan && overview && selectedChoice ? (
              <PlanAccessConvergenceReview
                intent={{
                  workspaceId,
                  sourceRevisionId: overview.planRevision.id,
                  targetRevisionId: selectedPlan.id,
                  expectedSubscriptionRevision: overview.subscription.subscriptionRevision,
                  effectiveAt: overview.subscription.currentPeriodEnd,
                }}
                sourcePlanName={t(overview.planRevision.nameI18NKey)}
                targetPlanName={t(selectedPlan.nameI18NKey)}
                resolveQueuedEffectLabel={resolveQueuedEffectLabel}
                services={planAccessConvergenceApi}
                onNoConvergencePreviewed={() => checkoutMutation.mutate(selectedChoice)}
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {plans.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    checkoutEnabled={catalogQuery.data?.checkoutEnabled ?? false}
                    onSelect={(selectedPlan) =>
                      setSelectedChoice({ plan: selectedPlan, billingCycle: cycle })
                    }
                  />
                ))}
              </div>
            )}
          </ContentGuard>
        </div>
      </DialogContent>
    </Dialog>
  );
}
