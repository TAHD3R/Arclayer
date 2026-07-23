import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, Send } from "lucide-react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import {
  createNotificationCampaign,
  estimateNotificationCampaignAudience,
  getNotificationCampaign,
  previewNotificationCampaign,
  updateNotificationCampaign,
  type NotificationCampaignDetail,
} from "@/api/notification-campaigns";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import { SettingDialog } from "@arclayer/ui/setting-dialog";

import {
  buildNotificationCampaignPayload,
  notificationCampaignFormValues,
  NotificationCampaignFormError,
  type NotificationCampaignFormValues,
} from "./notification-campaign-form";
import {
  CampaignAudienceFields,
  CampaignChannelFields,
  CampaignContentFields,
  CampaignPreviewFields,
  CampaignReviewFields,
} from "./notification-campaign-editor-fields";

const STEPS = ["AUDIENCE", "CHANNELS", "CONTENT", "PREVIEW", "REVIEW"] as const;

export function NotificationCampaignEditorDialog(props: {
  open: boolean;
  campaignId: string | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (campaign: NotificationCampaignDetail) => void;
  onRequestPublish: (campaign: NotificationCampaignDetail, scheduleAt: string | null) => void;
}) {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  const [workingCampaign, setWorkingCampaign] = useState<NotificationCampaignDetail | null>(null);
  const form = useForm<NotificationCampaignFormValues>({
    defaultValues: notificationCampaignFormValues(null),
    mode: "onSubmit",
  });
  const detailQuery = useQuery({
    queryKey: ["system", "notification-campaign", props.campaignId],
    queryFn: () => {
      if (!props.campaignId) throw new Error("NOTIFICATION_CAMPAIGN_ID_REQUIRED");
      return getNotificationCampaign(props.campaignId);
    },
    enabled: props.open && Boolean(props.campaignId),
  });

  useEffect(() => {
    if (!props.open) return;
    setStep(0);
    setMaxStep(0);
    if (!props.campaignId) {
      setWorkingCampaign(null);
      form.reset(notificationCampaignFormValues(null));
      return;
    }
    if (!detailQuery.data) return;
    setWorkingCampaign(detailQuery.data);
    form.reset(notificationCampaignFormValues(detailQuery.data));
  }, [detailQuery.data, form, props.campaignId, props.open]);

  const saveMutation = useMutation({
    mutationFn: async (values: NotificationCampaignFormValues) => {
      const payload = buildNotificationCampaignPayload(values);
      if (!workingCampaign) return createNotificationCampaign(payload);
      return updateNotificationCampaign(workingCampaign.id, {
        ...payload,
        expectedRevision: workingCampaign.revision,
      });
    },
    onSuccess: (campaign) => {
      setWorkingCampaign(campaign);
      form.reset(notificationCampaignFormValues(campaign));
      queryClient.setQueryData(["system", "notification-campaign", campaign.id], campaign);
      props.onSaved(campaign);
      notifySuccessText(t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_DRAFT_SAVED"));
    },
    onError: (error) => {
      if (error instanceof NotificationCampaignFormError) {
        form.setError("root", { message: t(error.messageKey) });
        return;
      }
      notifyError(error);
    },
  });
  const campaignId = workingCampaign?.id ?? null;
  const estimateQuery = useQuery({
    queryKey: ["system", "notification-campaign", campaignId, "estimate"],
    queryFn: () => {
      if (!campaignId) throw new Error("NOTIFICATION_CAMPAIGN_ID_REQUIRED");
      return estimateNotificationCampaignAudience(campaignId);
    },
    enabled: props.open && step >= 3 && Boolean(campaignId),
  });
  const previewQuery = useQuery({
    queryKey: ["system", "notification-campaign", campaignId, "preview"],
    queryFn: () => {
      if (!campaignId) throw new Error("NOTIFICATION_CAMPAIGN_ID_REQUIRED");
      return previewNotificationCampaign(campaignId);
    },
    enabled: props.open && step >= 3 && Boolean(campaignId),
  });
  const previewError = estimateQuery.error ?? previewQuery.error;
  const previewLoading = estimateQuery.isLoading || previewQuery.isLoading;
  const isLoadingDetail = Boolean(props.campaignId) && detailQuery.isLoading && !detailQuery.data;
  const steps = useMemo(
    () =>
      STEPS.map((key) => ({
        key,
        label: t(`SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_STEP_${key}`),
      })),
    [t],
  );

  const saveDraft = form.handleSubmit(async (values) => {
    form.clearErrors("root");
    return saveMutation.mutateAsync(values);
  });

  const goForward = form.handleSubmit(async (values) => {
    form.clearErrors("root");
    if (step === 2) {
      try {
        await saveMutation.mutateAsync(values);
      } catch {
        return;
      }
    }
    const next = Math.min(STEPS.length - 1, step + 1);
    setStep(next);
    setMaxStep((current) => Math.max(current, next));
  });

  const requestPublish = form.handleSubmit(async (values) => {
    form.clearErrors("root");
    try {
      const campaign = await saveMutation.mutateAsync(values);
      props.onRequestPublish(campaign, values.scheduleAt || null);
      props.onOpenChange(false);
    } catch {
      return;
    }
  });

  const footer = (
    <div className="flex w-full flex-wrap items-center justify-between gap-3">
      <Button type="button" variant="ghost" onClick={() => props.onOpenChange(false)}>
        {t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_ACTION_CLOSE")}
      </Button>
      <div className="flex items-center gap-2">
        {step > 0 ? (
          <Button type="button" variant="outline" onClick={() => setStep((current) => current - 1)}>
            <ChevronLeft className="size-4" />
            {t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_ACTION_BACK")}
          </Button>
        ) : null}
        {step >= 2 ? (
          <Button
            type="button"
            variant="outline"
            loading={saveMutation.isPending}
            onClick={() => void saveDraft()}
          >
            {t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_ACTION_SAVE_DRAFT")}
          </Button>
        ) : null}
        {step < STEPS.length - 1 ? (
          <Button type="button" loading={saveMutation.isPending} onClick={() => void goForward()}>
            {step === 2
              ? t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_ACTION_SAVE_PREVIEW")
              : t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_ACTION_NEXT")}
            <ChevronRight className="size-4" />
          </Button>
        ) : (
          <Button
            type="button"
            loading={saveMutation.isPending}
            onClick={() => void requestPublish()}
          >
            <Send className="size-4" />
            {t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_ACTION_REVIEW_PUBLISH")}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t(
        props.campaignId
          ? "SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_EDITOR_EDIT_TITLE"
          : "SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_EDITOR_CREATE_TITLE",
      )}
      description={t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_EDITOR_DESC")}
      contentClassName="sm:max-w-5xl"
      bodyClassName="p-0"
      footer={footer}
    >
      <div className="border-b px-6 py-3">
        <ol
          className="grid grid-cols-5 gap-1"
          aria-label={t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_EDITOR_STEPS")}
        >
          {steps.map((item, index) => (
            <li key={item.key}>
              <button
                type="button"
                disabled={index > maxStep}
                onClick={() => setStep(index)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-caption transition-colors",
                  index === step && "bg-primary/[0.08] text-primary",
                  index < step && "text-label-primary",
                  index > maxStep && "cursor-not-allowed text-label-quaternary",
                )}
              >
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px]",
                    index <= step && "border-primary/40",
                  )}
                >
                  {index < step ? <Check className="size-3" /> : index + 1}
                </span>
                <span className="hidden truncate sm:block">{item.label}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
      <ContentGuard
        loading={isLoadingDetail}
        loadingVariant="form"
        error={detailQuery.error}
        onRetry={() => void detailQuery.refetch()}
        className="min-h-[30rem]"
      >
        <form className="min-h-[30rem] px-6 py-5" onSubmit={(event) => event.preventDefault()}>
          {form.formState.errors.root?.message ? (
            <div
              className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-footnote text-destructive"
              role="alert"
            >
              {form.formState.errors.root.message}
            </div>
          ) : null}
          {step === 0 ? <CampaignAudienceFields form={form} /> : null}
          {step === 1 ? <CampaignChannelFields form={form} /> : null}
          {step === 2 ? <CampaignContentFields form={form} /> : null}
          {step === 3 ? (
            <CampaignPreviewFields
              estimate={estimateQuery.data}
              preview={previewQuery.data}
              loading={previewLoading}
              error={previewError}
            />
          ) : null}
          {step === 4 ? <CampaignReviewFields form={form} estimate={estimateQuery.data} /> : null}
        </form>
      </ContentGuard>
    </SettingDialog>
  );
}
