import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type {
  NotificationAudienceEstimateOut,
  NotificationCampaignPreviewOut,
  NotificationCampaignSummaryOut,
} from "@arclayer/platform-openapi";

import {
  estimateCampaignAudience,
  previewCampaign,
  publishCampaign,
} from "@/communications/communications-api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SettingDialog } from "@/components/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@/components/setting-dialog-field";
import { Skeleton } from "@/components/ui/skeleton";

type Review = Readonly<{
  audience: NotificationAudienceEstimateOut;
  preview: NotificationCampaignPreviewOut;
}>;

type Props = Readonly<{
  campaign: NotificationCampaignSummaryOut;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: (messageKey: string) => void;
}>;

export function CampaignPublishDialog(props: Props) {
  const { t } = useTranslation("communications");
  const request = useRef(0);
  const [review, setReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadReview = async () => {
    const requestId = ++request.current;
    setLoading(true);
    setError(null);
    try {
      const [audience, preview] = await Promise.all([
        estimateCampaignAudience(props.campaign.id),
        previewCampaign(props.campaign.id),
      ]);
      if (request.current !== requestId) return;
      setReview({ audience, preview });
    } catch {
      if (request.current === requestId) {
        setReview(null);
        setError("CAMPAIGN_REVIEW_LOAD_FAILED");
      }
    } finally {
      if (request.current === requestId) setLoading(false);
    }
  };

  useEffect(() => {
    if (!props.open) {
      request.current += 1;
      return;
    }
    setReview(null);
    setPublishing(false);
    setScheduleAt("");
    void loadReview();
  }, [props.campaign.id, props.open]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!review || review.preview.revision !== props.campaign.revision) {
      setError("CAMPAIGN_REVIEW_STALE");
      return;
    }
    setPublishing(true);
    setError(null);
    try {
      await publishCampaign(props.campaign.id, {
        expectedRevision: props.campaign.revision,
        scheduleAt: scheduleAt ? new Date(scheduleAt).toISOString() : null,
      });
      props.onCompleted("OPERATION_ACCEPTED");
      props.onOpenChange(false);
    } catch {
      setError("OPERATION_FAILED");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <SettingDialog
      contentClassName="sm:max-w-4xl"
      description={t("CAMPAIGN_REVIEW_DESCRIPTION")}
      footer={
        <>
          <Button
            disabled={loading || publishing}
            onClick={() => props.onOpenChange(false)}
            variant="outline"
          >
            {t("CANCEL")}
          </Button>
          <Button
            disabled={!review || loading || publishing}
            form="campaign-publish-review"
            loading={publishing}
            type="submit"
          >
            {scheduleAt ? t("CONFIRM_SCHEDULE") : t("CONFIRM_SEND_NOW")}
          </Button>
        </>
      }
      onOpenChange={(open) => !publishing && props.onOpenChange(open)}
      open={props.open}
      title={t("CAMPAIGN_REVIEW_TITLE", { name: props.campaign.name })}
    >
      <form id="campaign-publish-review" onSubmit={submit}>
        <SettingDialogFields>
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>{t("OPERATION_FAILED")}</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>{t(error)}</p>
                {error === "CAMPAIGN_REVIEW_LOAD_FAILED" ? (
                  <Button
                    onClick={() => void loadReview()}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {t("RELOAD_REVIEW")}
                  </Button>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}
          {loading ? (
            <div className="space-y-3" aria-label={t("CAMPAIGN_REVIEW_LOADING")}>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : null}
          {review ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>{t("ESTIMATED_RECIPIENTS")}</CardTitle>
                  <CardDescription>{t("ESTIMATED_RECIPIENTS_DESCRIPTION")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold tabular-nums">
                    {review.audience.estimatedRecipients.toLocaleString()}
                  </p>
                </CardContent>
              </Card>
              {review.preview.warnings?.length ? (
                <Alert>
                  <AlertTitle>{t("CAMPAIGN_REVIEW_WARNING_TITLE")}</AlertTitle>
                  <AlertDescription>{t("CAMPAIGN_REVIEW_WARNING_DESCRIPTION")}</AlertDescription>
                </Alert>
              ) : null}
              <div className="space-y-3">
                <h3 className="text-subheadline font-semibold">{t("MESSAGE_PREVIEW")}</h3>
                {review.preview.variants.map((variant) => (
                  <Card key={variant.locale}>
                    <CardHeader>
                      <div className="flex items-center justify-between gap-3">
                        <CardTitle>{variant.locale}</CardTitle>
                        {variant.locale === props.campaign.fallbackLocale ? (
                          <Badge variant="outline">{t("SENDING_LANGUAGE")}</Badge>
                        ) : null}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {Object.entries(variant.presentations).map(([presentation, payload]) => (
                        <div className="rounded-lg border bg-muted/30 p-4" key={presentation}>
                          <p className="mb-2 text-sm font-medium">
                            {t(`PRESENTATION_${presentation.toUpperCase()}`)}
                          </p>
                          <pre className="overflow-x-auto whitespace-pre-wrap text-sm">
                            {JSON.stringify(payload, null, 2)}
                          </pre>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
              <SettingDialogField
                description={t("SCHEDULE_AT_DESCRIPTION")}
                title={<label htmlFor="campaign-publish-at">{t("SCHEDULE_AT")}</label>}
              >
                <Input
                  id="campaign-publish-at"
                  onChange={(event) => setScheduleAt(event.target.value)}
                  type="datetime-local"
                  value={scheduleAt}
                />
              </SettingDialogField>
            </>
          ) : null}
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}
