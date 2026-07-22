import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { useSavingKey } from "@arclayer/hooks/use-saving-key";
import { Button } from "@arclayer/ui/button";
import { Checkbox } from "@arclayer/ui/checkbox";
import { Input } from "@arclayer/ui/input";
import { RadioGroup, RadioGroupItem } from "@arclayer/ui/radio-group";
import { Textarea } from "@arclayer/ui/textarea";

import {
  createGlobalNotificationBroadcast,
  type GlobalNotificationBroadcastPayload,
  type GlobalNotificationBroadcastResult,
  type GlobalNotificationPresentation,
  type GlobalNotificationSeverity,
} from "@/api/notifications";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { notifySuccessText } from "@/lib/notifications";
import {
  SystemSettingField,
  SystemSettingFooterActions,
  SystemSettingItem,
  SystemSettingStack,
} from "@/pages/system/components/system-setting-item";
import {
  getSystemSettingsSection,
  readRecordValue,
  usePatchSystemCoreSettings,
  useSystemCoreSettings,
} from "@/pages/system/hooks/use-system-core-settings";

type NotificationsPolicyFormValues = {
  notificationGroups: Record<string, { enabled: boolean }>;
};

type BroadcastFormValues = GlobalNotificationBroadcastPayload;

const NOTIFICATION_GROUP_OPTIONS = [
  {
    key: "team",
    titleKey: "settings:SETTINGS_SYSTEM_NOTIFICATIONS_GROUP_TEAM_TITLE",
    descriptionKey: "settings:SETTINGS_SYSTEM_NOTIFICATIONS_GROUP_TEAM_DESC",
  },
  {
    key: "security",
    titleKey: "settings:SETTINGS_SYSTEM_NOTIFICATIONS_GROUP_SECURITY_TITLE",
    descriptionKey: "settings:SETTINGS_SYSTEM_NOTIFICATIONS_GROUP_SECURITY_DESC",
  },
  {
    key: "content",
    titleKey: "settings:SETTINGS_SYSTEM_NOTIFICATIONS_GROUP_CONTENT_TITLE",
    descriptionKey: "settings:SETTINGS_SYSTEM_NOTIFICATIONS_GROUP_CONTENT_DESC",
  },
  {
    key: "automation",
    titleKey: "settings:SETTINGS_SYSTEM_NOTIFICATIONS_GROUP_AUTOMATION_TITLE",
    descriptionKey: "settings:SETTINGS_SYSTEM_NOTIFICATIONS_GROUP_AUTOMATION_DESC",
  },
  {
    key: "system",
    titleKey: "settings:SETTINGS_SYSTEM_NOTIFICATIONS_GROUP_SYSTEM_TITLE",
    descriptionKey: "settings:SETTINGS_SYSTEM_NOTIFICATIONS_GROUP_SYSTEM_DESC",
  },
] as const;

const PRESENTATION_OPTIONS: readonly {
  value: GlobalNotificationPresentation;
  titleKey: string;
  descriptionKey: string;
}[] = [
  {
    value: "inbox",
    titleKey: "settings:SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_PRESENTATION_INBOX",
    descriptionKey: "settings:SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_PRESENTATION_INBOX_DESC",
  },
  {
    value: "toast",
    titleKey: "settings:SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_PRESENTATION_TOAST",
    descriptionKey: "settings:SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_PRESENTATION_TOAST_DESC",
  },
  {
    value: "modal",
    titleKey: "settings:SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_PRESENTATION_MODAL",
    descriptionKey: "settings:SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_PRESENTATION_MODAL_DESC",
  },
  {
    value: "banner",
    titleKey: "settings:SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_PRESENTATION_BANNER",
    descriptionKey: "settings:SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_PRESENTATION_BANNER_DESC",
  },
];

const SEVERITY_OPTIONS: readonly { value: GlobalNotificationSeverity; labelKey: string }[] = [
  { value: "info", labelKey: "settings:SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_SEVERITY_INFO" },
  {
    value: "success",
    labelKey: "settings:SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_SEVERITY_SUCCESS",
  },
  {
    value: "warning",
    labelKey: "settings:SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_SEVERITY_WARNING",
  },
  { value: "error", labelKey: "settings:SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_SEVERITY_ERROR" },
];

const BROADCAST_DEFAULTS: BroadcastFormValues = {
  title: "",
  body: "",
  presentation: "toast",
  severity: "info",
  actionLabel: "",
  actionTo: "",
  deliverInApp: true,
  deliverEmail: false,
};

function normalizeNotificationGroups(
  input: Record<string, { enabled?: boolean }> | null | undefined,
): Record<string, { enabled: boolean }> {
  const fallback: Record<string, { enabled: boolean }> = {
    team: { enabled: true },
    security: { enabled: true },
    content: { enabled: true },
    automation: { enabled: true },
    system: { enabled: false },
  };
  const next = { ...fallback };
  for (const group of NOTIFICATION_GROUP_OPTIONS) {
    const rawEnabled = input?.[group.key]?.enabled;
    if (typeof rawEnabled === "boolean") next[group.key] = { enabled: rawEnabled };
  }
  return next;
}

function notificationGroupsChanged(
  left: Record<string, { enabled: boolean }>,
  right: Record<string, { enabled: boolean }>,
): boolean {
  return NOTIFICATION_GROUP_OPTIONS.some(
    (group) => Boolean(left[group.key]?.enabled) !== Boolean(right[group.key]?.enabled),
  );
}

function buildInitialValues(
  input: ReturnType<typeof useSystemCoreSettings>["coreSettings"],
): NotificationsPolicyFormValues {
  const notifications = getSystemSettingsSection(input, "notifications");
  return {
    notificationGroups: normalizeNotificationGroups(
      readRecordValue(notifications, "groups") as Record<string, { enabled?: boolean }> | null,
    ),
  };
}

export function SystemSettingsNotificationsPage() {
  const { t } = useTranslation(["settings"]);
  const { savingKey, withSavingKey } = useSavingKey();
  const coreSettingsQuery = useSystemCoreSettings();
  const patchMutation = usePatchSystemCoreSettings();
  const [broadcastResult, setBroadcastResult] = useState<GlobalNotificationBroadcastResult | null>(
    null,
  );
  const broadcastMutation = useMutation({ mutationFn: createGlobalNotificationBroadcast });

  const initialValues = useMemo(
    () => buildInitialValues(coreSettingsQuery.coreSettings),
    [coreSettingsQuery.coreSettings],
  );
  const policyForm = useForm<NotificationsPolicyFormValues>({
    defaultValues: initialValues,
    mode: "onSubmit",
  });
  const broadcastForm = useForm<BroadcastFormValues>({
    defaultValues: BROADCAST_DEFAULTS,
    mode: "onSubmit",
  });
  const policyValues = policyForm.watch();
  const broadcastValues = broadcastForm.watch();
  const notificationGroupsDirty = notificationGroupsChanged(
    policyValues.notificationGroups,
    initialValues.notificationGroups,
  );

  useEffect(() => {
    if (!coreSettingsQuery.coreSettings || policyForm.formState.isDirty) return;
    policyForm.reset(initialValues);
  }, [coreSettingsQuery.coreSettings, initialValues, policyForm]);

  const saveNotificationGroups = () =>
    withSavingKey("notifications.groups", async () => {
      const nextGroups = normalizeNotificationGroups(policyForm.getValues("notificationGroups"));
      await patchMutation.mutateAsync({ notifications: { groups: nextGroups } });
      policyForm.reset({ notificationGroups: nextGroups });
      notifySuccessText(t("settings:SETTINGS_SAVED"));
    });

  const submitBroadcast = broadcastForm.handleSubmit(async (values) => {
    if (!values.deliverInApp && !values.deliverEmail) {
      broadcastForm.setError("deliverInApp", {
        message: t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_CHANNEL_REQUIRED"),
      });
      return;
    }
    if (values.actionLabel?.trim() && !values.actionTo?.trim()) {
      broadcastForm.setError("actionTo", {
        message: t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_ACTION_TARGET_REQUIRED"),
      });
      return;
    }

    const result = await broadcastMutation.mutateAsync({
      ...values,
      title: values.title.trim(),
      body: values.body?.trim() || null,
      actionLabel: values.actionLabel?.trim() || null,
      actionTo: values.actionTo?.trim() || null,
    });
    setBroadcastResult(result);
    broadcastForm.reset(BROADCAST_DEFAULTS);
    notifySuccessText(t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_SENT"));
  });

  return (
    <ContentGuard
      loading={coreSettingsQuery.isLoading && !coreSettingsQuery.coreSettings}
      error={coreSettingsQuery.error}
      onRetry={() => void coreSettingsQuery.refetch()}
    >
      <SystemSettingStack>
        <SystemSettingItem
          id="notification-policy"
          title={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_IN_APP_TITLE")}
          description={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_IN_APP_DESC")}
          footer={
            <SystemSettingFooterActions
              dirty={notificationGroupsDirty}
              pending={savingKey === "notifications.groups" || patchMutation.isPending}
              onReset={() => policyForm.reset(initialValues)}
              onSave={() => void saveNotificationGroups()}
            />
          }
        >
          <div className="grid gap-x-6 gap-y-2 md:grid-cols-2">
            {NOTIFICATION_GROUP_OPTIONS.map((group) => {
              const checked = Boolean(policyValues.notificationGroups[group.key]?.enabled);
              return (
                <label
                  key={group.key}
                  className="flex min-w-0 cursor-pointer items-start gap-3 py-2"
                >
                  <Checkbox
                    checked={checked}
                    className="mt-0.5"
                    onCheckedChange={(next) => {
                      const current = normalizeNotificationGroups(
                        policyForm.getValues("notificationGroups"),
                      );
                      policyForm.setValue(
                        "notificationGroups",
                        { ...current, [group.key]: { enabled: Boolean(next) } },
                        { shouldDirty: true },
                      );
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-headline font-semibold text-label-primary">
                      {t(group.titleKey)}
                    </span>
                    <span className="mt-1 block text-callout text-label-secondary">
                      {t(group.descriptionKey)}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </SystemSettingItem>

        <SystemSettingItem
          id="global-notification-broadcast"
          title={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_TITLE")}
          description={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_DESC")}
        >
          <form className="grid gap-5" onSubmit={(event) => void submitBroadcast(event)}>
            <div className="grid gap-4 md:grid-cols-2">
              <SystemSettingField
                label={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_MESSAGE_TITLE")}
                message={
                  broadcastForm.formState.errors.title ? (
                    <span className="text-footnote text-destructive" role="alert">
                      {broadcastForm.formState.errors.title.message}
                    </span>
                  ) : null
                }
              >
                <Input
                  {...broadcastForm.register("title", {
                    required: t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_TITLE_REQUIRED"),
                    maxLength: 256,
                  })}
                  maxLength={256}
                  aria-invalid={Boolean(broadcastForm.formState.errors.title)}
                  placeholder={t(
                    "settings:SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_MESSAGE_TITLE_PLACEHOLDER",
                  )}
                />
              </SystemSettingField>
              <SystemSettingField
                label={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_SEVERITY")}
                labelControls={false}
              >
                <RadioGroup
                  value={broadcastValues.severity}
                  onValueChange={(value) =>
                    broadcastForm.setValue("severity", value as GlobalNotificationSeverity, {
                      shouldDirty: true,
                    })
                  }
                  className="grid grid-cols-2 gap-2"
                >
                  {SEVERITY_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-footnote"
                    >
                      <RadioGroupItem value={option.value} />
                      {t(option.labelKey)}
                    </label>
                  ))}
                </RadioGroup>
              </SystemSettingField>
            </div>

            <SystemSettingField label={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_BODY")}>
              <Textarea
                {...broadcastForm.register("body", { maxLength: 512 })}
                maxLength={512}
                rows={4}
                placeholder={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_BODY_PLACEHOLDER")}
              />
            </SystemSettingField>

            <SystemSettingField
              label={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_PRESENTATION")}
              labelControls={false}
            >
              <RadioGroup
                value={broadcastValues.presentation}
                onValueChange={(value) =>
                  broadcastForm.setValue("presentation", value as GlobalNotificationPresentation, {
                    shouldDirty: true,
                  })
                }
                className="grid gap-2 md:grid-cols-2"
              >
                {PRESENTATION_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className="flex min-h-16 cursor-pointer items-start gap-3 rounded-lg border border-border p-3"
                  >
                    <RadioGroupItem value={option.value} className="mt-0.5" />
                    <span>
                      <span className="block text-headline font-semibold text-label-primary">
                        {t(option.titleKey)}
                      </span>
                      <span className="mt-1 block text-footnote text-label-secondary">
                        {t(option.descriptionKey)}
                      </span>
                    </span>
                  </label>
                ))}
              </RadioGroup>
            </SystemSettingField>

            <div className="grid gap-4 md:grid-cols-2">
              <SystemSettingField
                label={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_ACTION_LABEL")}
              >
                <Input
                  {...broadcastForm.register("actionLabel", { maxLength: 80 })}
                  maxLength={80}
                  placeholder={t(
                    "settings:SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_ACTION_LABEL_PLACEHOLDER",
                  )}
                />
              </SystemSettingField>
              <SystemSettingField
                label={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_ACTION_TO")}
                message={
                  broadcastForm.formState.errors.actionTo ? (
                    <span className="text-footnote text-destructive" role="alert">
                      {broadcastForm.formState.errors.actionTo.message}
                    </span>
                  ) : null
                }
              >
                <Input
                  {...broadcastForm.register("actionTo", {
                    pattern: {
                      value: /^\//,
                      message: t(
                        "settings:SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_ACTION_TO_INVALID",
                      ),
                    },
                  })}
                  aria-invalid={Boolean(broadcastForm.formState.errors.actionTo)}
                  placeholder="/system/overview"
                />
              </SystemSettingField>
            </div>

            <fieldset className="grid gap-2">
              <legend className="text-headline font-semibold text-label-primary">
                {t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_CHANNELS")}
              </legend>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <label className="flex min-h-9 cursor-pointer items-center gap-2">
                  <Checkbox
                    checked={broadcastValues.deliverInApp}
                    onCheckedChange={(checked) =>
                      broadcastForm.setValue("deliverInApp", Boolean(checked), {
                        shouldDirty: true,
                      })
                    }
                  />
                  {t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_CHANNEL_IN_APP")}
                </label>
                <label className="flex min-h-9 cursor-pointer items-center gap-2">
                  <Checkbox
                    checked={broadcastValues.deliverEmail}
                    onCheckedChange={(checked) =>
                      broadcastForm.setValue("deliverEmail", Boolean(checked), {
                        shouldDirty: true,
                      })
                    }
                  />
                  {t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_CHANNEL_EMAIL")}
                </label>
              </div>
              {broadcastForm.formState.errors.deliverInApp ? (
                <span className="text-footnote text-destructive" role="alert">
                  {broadcastForm.formState.errors.deliverInApp.message}
                </span>
              ) : null}
            </fieldset>

            {broadcastResult ? <BroadcastResult result={broadcastResult} /> : null}

            <div className="flex justify-end border-t border-border pt-4">
              <Button type="submit" loading={broadcastMutation.isPending}>
                {t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_SEND")}
              </Button>
            </div>
          </form>
        </SystemSettingItem>
      </SystemSettingStack>
    </ContentGuard>
  );
}

function BroadcastResult({ result }: { result: GlobalNotificationBroadcastResult }) {
  const { t } = useTranslation("settings");
  return (
    <div className="grid gap-2 rounded-lg border border-border bg-muted/40 p-4" role="status">
      <div className="text-headline font-semibold text-label-primary">
        {result.policyEnabled
          ? t("SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_RESULT_TITLE")
          : t("SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_RESULT_POLICY_DISABLED")}
      </div>
      <div className="grid grid-cols-3 gap-4 text-footnote tabular-nums">
        <ResultMetric
          label={t("SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_RESULT_AUDIENCE")}
          value={result.audienceCount}
        />
        <ResultMetric
          label={t("SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_RESULT_IN_APP")}
          value={result.inAppDeliveredCount}
        />
        <ResultMetric
          label={t("SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_RESULT_EMAIL")}
          value={result.emailDeliveredCount}
        />
      </div>
    </div>
  );
}

function ResultMetric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-label-secondary">{label}</div>
      <div className="mt-1 text-title3 font-semibold text-label-primary">{value}</div>
    </div>
  );
}
