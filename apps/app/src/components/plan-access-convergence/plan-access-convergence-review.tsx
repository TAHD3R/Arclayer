import { ArrowRight, CircleCheck, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

import { PlanAccessImpactList } from "@/components/plan-access-convergence/plan-access-impact-list";
import {
  type PlanAccessConvergenceIntent,
  usePlanAccessConvergence,
} from "@/components/plan-access-convergence/use-plan-access-convergence";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Button } from "@arclayer/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";
import { Checkbox } from "@arclayer/ui/checkbox";
import { Separator } from "@arclayer/ui/separator";
import type {
  ConvergencePreview,
  PlanAccessConvergenceApi,
  RenewalTransitionScheduleOut,
} from "@/api/plan-access-convergence";

export type PlanAccessConvergenceReviewProps = Readonly<{
  intent: PlanAccessConvergenceIntent;
  sourcePlanName: string;
  targetPlanName: string;
  resolveQueuedEffectLabel: (effectType: string) => string;
  services: PlanAccessConvergenceApi;
  onNoConvergencePreviewed?: (preview: ConvergencePreview) => void;
  onScheduled?: (result: RenewalTransitionScheduleOut) => void;
}>;

function planName(value: string): string {
  const name = value.trim();
  if (!name) throw new Error("Plan access review requires both plan display names");
  return name;
}

export function PlanAccessConvergenceReview(props: PlanAccessConvergenceReviewProps) {
  const { t, i18n } = useTranslation(["planChange"]);
  const controller = usePlanAccessConvergence(props.intent, {
    services: props.services,
    ...(props.onNoConvergencePreviewed
      ? {
          onPreviewed: (preview) => {
            if (!preview.snapshot.requiresConvergence) {
              props.onNoConvergencePreviewed?.(preview);
            }
          },
        }
      : {}),
    ...(props.onScheduled ? { onScheduled: props.onScheduled } : {}),
  });
  const checkoutAfterPreview = props.onNoConvergencePreviewed !== undefined;
  const effectiveTime = new Intl.DateTimeFormat(
    i18n.resolvedLanguage || i18n.language || undefined,
    { dateStyle: "medium", timeStyle: "short" },
  ).format(new Date(props.intent.effectiveAt));
  const requiresConvergence = controller.preview?.snapshot.requiresConvergence === true;

  return (
    <Card className="overflow-hidden border-border/80 bg-card/95 shadow-sm">
      <CardHeader className="border-b border-border/70 bg-muted/25">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg border border-border/70 bg-background p-2 text-primary">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <CardTitle>
              {t(
                requiresConvergence
                  ? "planChange:ACCESS_CHANGES_TITLE"
                  : "planChange:PLAN_CHANGE_SCHEDULE_TITLE",
              )}
            </CardTitle>
            <CardDescription className="mt-1 max-w-3xl">
              {t(
                requiresConvergence
                  ? "planChange:ACCESS_CHANGES_DESCRIPTION"
                  : "planChange:PLAN_CHANGE_SCHEDULE_DESCRIPTION",
              )}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-5 pt-5">
        <section aria-labelledby="plan-change-summary" className="rounded-xl border p-4">
          <h3 id="plan-change-summary" className="text-headline text-label-primary">
            {t("planChange:PLAN_CHANGE_TITLE")}
          </h3>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-body font-semibold text-label-primary">
            <span>{planName(props.sourcePlanName)}</span>
            <ArrowRight className="size-4 text-label-secondary" aria-hidden="true" />
            <span>{planName(props.targetPlanName)}</span>
          </div>
          <p className="mt-2 text-footnote text-label-secondary">
            {t("planChange:EFFECTIVE_AT", { date: effectiveTime })}
          </p>
        </section>

        {controller.preview?.snapshot.requiresConvergence ? (
          <Alert>
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>{t("planChange:ENDED_ACCESS_TITLE")}</AlertTitle>
            <AlertDescription>
              <p>{t("planChange:RECONFIGURE_AFTER_UPGRADE")}</p>
            </AlertDescription>
          </Alert>
        ) : null}

        {controller.scheduledTransition ? (
          <Alert>
            <CircleCheck aria-hidden="true" />
            <AlertTitle>{t("planChange:CHANGE_SCHEDULED_TITLE")}</AlertTitle>
            <AlertDescription>
              <p>
                {t(
                  requiresConvergence
                    ? "planChange:CHANGE_SCHEDULED_WITH_ACCESS_DESCRIPTION"
                    : "planChange:CHANGE_SCHEDULED_DESCRIPTION",
                  {
                    date: new Intl.DateTimeFormat(
                      i18n.resolvedLanguage || i18n.language || undefined,
                      { dateStyle: "medium", timeStyle: "short" },
                    ).format(new Date(controller.scheduledTransition.effectiveAt)),
                  },
                )}
              </p>
            </AlertDescription>
          </Alert>
        ) : controller.requiresFreshPreview ? (
          <Alert variant="destructive">
            <RefreshCw aria-hidden="true" />
            <AlertTitle>{t("planChange:ACCESS_INFORMATION_CHANGED_TITLE")}</AlertTitle>
            <AlertDescription>
              <p>{t("planChange:ACCESS_INFORMATION_CHANGED_DESCRIPTION")}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                loading={controller.isPreviewPending}
                onClick={controller.reviewAccess}
              >
                {t("planChange:REVIEW_CURRENT_PLAN_CHANGE")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : controller.error ? (
          <Alert variant="destructive">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>
              {controller.errorOperation === "schedule"
                ? t("planChange:SCHEDULE_FAILED_TITLE")
                : t("planChange:REVIEW_FAILED_TITLE")}
            </AlertTitle>
            <AlertDescription>
              <p>
                {controller.errorOperation === "schedule"
                  ? t("planChange:SCHEDULE_FAILED_DESCRIPTION")
                  : t("planChange:REVIEW_FAILED_DESCRIPTION")}
              </p>
            </AlertDescription>
          </Alert>
        ) : null}

        {!controller.preview ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-5">
            <div>
              <h3 className="text-headline text-label-primary">
                {t("planChange:REVIEW_PLAN_CHANGE")}
              </h3>
              <p className="mt-1 text-footnote text-label-secondary">
                {t("planChange:REVIEW_STEP_DESCRIPTION")}
              </p>
            </div>
            <Button
              type="button"
              loading={controller.isPreviewPending}
              onClick={controller.reviewAccess}
            >
              {controller.error
                ? t("planChange:TRY_REVIEW_AGAIN")
                : t("planChange:REVIEW_PLAN_CHANGE")}
            </Button>
          </div>
        ) : (
          <>
            {controller.preview.snapshot.requiresConvergence ? (
              <PlanAccessImpactList
                snapshot={controller.preview.snapshot}
                retainedAssignmentIds={controller.retainedAssignmentIds}
                onAssignmentRetainedChange={controller.setAssignmentRetained}
                resolveQueuedEffectLabel={props.resolveQueuedEffectLabel}
                readOnly={controller.isScheduled}
              />
            ) : (
              <Alert>
                <CircleCheck aria-hidden="true" />
                <AlertTitle>{t("planChange:NO_ACCESS_CHANGES_TITLE")}</AlertTitle>
                <AlertDescription>
                  <p>
                    {t(
                      checkoutAfterPreview
                        ? "planChange:NO_ACCESS_CHANGES_CHECKOUT_DESCRIPTION"
                        : "planChange:NO_ACCESS_CHANGES_DESCRIPTION",
                    )}
                  </p>
                </AlertDescription>
              </Alert>
            )}

            {controller.selectionChanged ? (
              <Alert>
                <RefreshCw aria-hidden="true" />
                <AlertTitle>{t("planChange:SELECTION_CHANGED_TITLE")}</AlertTitle>
                <AlertDescription>
                  <p>{t("planChange:SELECTION_CHANGED_DESCRIPTION")}</p>
                </AlertDescription>
              </Alert>
            ) : null}

            {controller.preview.snapshot.requiresConvergence ? (
              <div className="flex items-start gap-3 rounded-xl border bg-muted/20 p-4">
                <Checkbox
                  id="confirm-plan-access-convergence"
                  className="mt-0.5"
                  checked={controller.isAcknowledged}
                  disabled={controller.isScheduled}
                  onCheckedChange={(checked) => controller.setIsAcknowledged(checked === true)}
                />
                <label
                  htmlFor="confirm-plan-access-convergence"
                  className="cursor-pointer text-footnote text-label-primary"
                >
                  {t("planChange:RETAINED_ACCESS_ACKNOWLEDGEMENT")}
                </label>
              </div>
            ) : null}

            {checkoutAfterPreview && !controller.preview.snapshot.requiresConvergence ? null : (
              <>
                <Separator />
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    loading={controller.isPreviewPending}
                    disabled={
                      !controller.selectionChanged ||
                      controller.requiresFreshPreview ||
                      controller.isScheduled
                    }
                    onClick={controller.reviewAccess}
                  >
                    {t("planChange:UPDATE_REVIEW")}
                  </Button>
                  <Button
                    type="button"
                    loading={controller.isSchedulePending}
                    disabled={!controller.canSchedule}
                    onClick={controller.schedulePlanChange}
                  >
                    {t("planChange:SCHEDULE_PLAN_CHANGE")}
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
