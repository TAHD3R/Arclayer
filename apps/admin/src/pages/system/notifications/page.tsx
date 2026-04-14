import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Checkbox } from "@arclayer/ui/checkbox";
import { SettingActionItem } from "@arclayer/ui/setting-action-item";
import { SettingOverlayFooter } from "@arclayer/ui/setting-overlay-footer";
import { SettingPanel } from "@arclayer/ui/setting-panel";
import { useSavingKey } from "@arclayer/hooks/use-saving-key";

import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { type SettingOverlayConfig, useSettingOverlays } from "@/hooks/use-setting-overlays";
import {
  getSystemSettingsSection,
  readBooleanValue,
  readRecordValue,
  readStringArrayValue,
  usePatchSystemCoreSettings,
  useSystemCoreSettings,
} from "@/pages/system/hooks/use-system-core-settings";
import { joinSummaryParts } from "@/pages/system/system-settings-form-utils";
import { SystemSettingsStatusBadge } from "@/pages/system/system-settings-primitives";

type NotificationsFormValues = {
  mailEnabledTemplates: string[];
  notificationInviteEnabled: boolean;
};

type NotificationsOverlayKey = "email" | "inApp";

function buildInitialValues(
  input: ReturnType<typeof useSystemCoreSettings>["coreSettings"],
): NotificationsFormValues {
  const mail = getSystemSettingsSection(input, "mail");
  const notifications = getSystemSettingsSection(input, "notifications");
  const preferences = readRecordValue(mail, "preferences");

  return {
    mailEnabledTemplates: readStringArrayValue(preferences, "enabled_templates"),
    notificationInviteEnabled: Boolean(readBooleanValue(notifications, "invite_enabled")),
  };
}

export function SystemSettingsNotificationsPage() {
  const { t } = useTranslation(["settings"]);
  const { savingKey, withSavingKey } = useSavingKey();
  const coreSettingsQuery = useSystemCoreSettings();
  const patchMutation = usePatchSystemCoreSettings();

  const initialValues = useMemo(
    () => buildInitialValues(coreSettingsQuery.coreSettings),
    [coreSettingsQuery.coreSettings],
  );

  const form = useForm<NotificationsFormValues>({
    defaultValues: initialValues,
    mode: "onSubmit",
  });

  useEffect(() => {
    if (!coreSettingsQuery.coreSettings) return;
    if (form.formState.isDirty) return;
    form.reset(initialValues);
  }, [coreSettingsQuery.coreSettings, form, initialValues]);

  const mailEnabledTemplates =
    form.watch("mailEnabledTemplates") ?? initialValues.mailEnabledTemplates;
  const notificationInviteEnabled =
    form.watch("notificationInviteEnabled") ?? initialValues.notificationInviteEnabled;

  const persistPatch = async (
    patch: Record<string, unknown>,
    nextValues: NotificationsFormValues,
  ) => {
    try {
      await patchMutation.mutateAsync(patch);
      form.reset(nextValues);
      notifySuccessText(t("settings:SETTINGS_SAVED"));
    } catch (error) {
      notifyError(error);
      throw error;
    }
  };

  const saveEmailDelivery = () =>
    withSavingKey("notifications.email", async () => {
      const nextTemplates = Array.from(new Set(form.getValues("mailEnabledTemplates") || []));
      await persistPatch(
        {
          mail: {
            preferences: {
              enabled_templates: nextTemplates,
            },
          },
        },
        {
          ...form.getValues(),
          mailEnabledTemplates: nextTemplates,
        },
      );
    });

  const resetEmailDelivery = () =>
    withSavingKey("reset:notifications.email", async () => {
      await persistPatch(
        {
          mail: {
            preferences: {
              enabled_templates: initialValues.mailEnabledTemplates,
            },
          },
        },
        {
          ...form.getValues(),
          mailEnabledTemplates: initialValues.mailEnabledTemplates,
        },
      );
    });

  const saveInAppDelivery = () =>
    withSavingKey("notifications.inApp", async () => {
      const inviteEnabled = Boolean(form.getValues("notificationInviteEnabled"));
      await persistPatch(
        {
          notifications: {
            invite_enabled: inviteEnabled,
          },
        },
        {
          ...form.getValues(),
          notificationInviteEnabled: inviteEnabled,
        },
      );
    });

  const resetInAppDelivery = () =>
    withSavingKey("reset:notifications.inApp", async () => {
      await persistPatch(
        {
          notifications: {
            invite_enabled: initialValues.notificationInviteEnabled,
          },
        },
        {
          ...form.getValues(),
          notificationInviteEnabled: initialValues.notificationInviteEnabled,
        },
      );
    });

  const overlayConfigs = useMemo<readonly SettingOverlayConfig<NotificationsOverlayKey>[]>(() => {
    return [
      {
        key: "email",
        type: "dialog",
        title: t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_EMAIL_TITLE"),
        description: t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_EMAIL_DESC"),
        footer: (ctx) => (
          <SettingOverlayFooter
            close={ctx.close}
            backText={t("common:BACK")}
            resetText={t("settings:SETTINGS_RESET")}
            resetVisible
            resetLoading={savingKey === "reset:notifications.email"}
            saveText={t("settings:SETTINGS_SAVE")}
            saveLoading={savingKey === "notifications.email"}
            disabled={patchMutation.isPending}
            onReset={resetEmailDelivery}
            onSave={saveEmailDelivery}
          />
        ),
        content: () => (
          <div className="space-y-3">
            <label className="flex items-start gap-3 rounded-xl border border-border p-4">
              <Checkbox
                checked={mailEnabledTemplates.includes("registration_prompt")}
                onCheckedChange={(checked) => {
                  const next = checked
                    ? [...mailEnabledTemplates, "registration_prompt"]
                    : mailEnabledTemplates.filter((value) => value !== "registration_prompt");
                  form.setValue("mailEnabledTemplates", Array.from(new Set(next)), {
                    shouldDirty: true,
                  });
                }}
                className="mt-1"
              />
              <div className="space-y-1">
                <div className="font-medium">
                  {t("settings:SETTINGS_MESSAGING_MAIL_TEMPLATE_REG_PROMPT_TITLE")}
                </div>
                <div className="text-footnote text-label-secondary">
                  {t("settings:SETTINGS_MESSAGING_MAIL_TEMPLATE_REG_PROMPT_DESC")}
                </div>
              </div>
            </label>
            <label className="flex items-start gap-3 rounded-xl border border-border p-4">
              <Checkbox
                checked={mailEnabledTemplates.includes("welcome_email")}
                onCheckedChange={(checked) => {
                  const next = checked
                    ? [...mailEnabledTemplates, "welcome_email"]
                    : mailEnabledTemplates.filter((value) => value !== "welcome_email");
                  form.setValue("mailEnabledTemplates", Array.from(new Set(next)), {
                    shouldDirty: true,
                  });
                }}
                className="mt-1"
              />
              <div className="space-y-1">
                <div className="font-medium">
                  {t("settings:SETTINGS_MESSAGING_MAIL_TEMPLATE_WELCOME_TITLE")}
                </div>
                <div className="text-footnote text-label-secondary">
                  {t("settings:SETTINGS_MESSAGING_MAIL_TEMPLATE_WELCOME_DESC")}
                </div>
              </div>
            </label>
          </div>
        ),
      },
      {
        key: "inApp",
        type: "dialog",
        title: t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_IN_APP_TITLE"),
        description: t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_IN_APP_DESC"),
        footer: (ctx) => (
          <SettingOverlayFooter
            close={ctx.close}
            backText={t("common:BACK")}
            resetText={t("settings:SETTINGS_RESET")}
            resetVisible
            resetLoading={savingKey === "reset:notifications.inApp"}
            saveText={t("settings:SETTINGS_SAVE")}
            saveLoading={savingKey === "notifications.inApp"}
            disabled={patchMutation.isPending}
            onReset={resetInAppDelivery}
            onSave={saveInAppDelivery}
          />
        ),
        content: () => (
          <label className="flex items-start gap-3 rounded-xl border border-border p-4">
            <Checkbox
              checked={notificationInviteEnabled}
              onCheckedChange={(checked) => {
                form.setValue("notificationInviteEnabled", Boolean(checked), {
                  shouldDirty: true,
                });
              }}
              className="mt-1"
            />
            <div className="space-y-1">
              <div className="font-medium">
                {t("settings:SETTINGS_MESSAGING_NOTIFICATION_INVITE_TITLE")}
              </div>
              <div className="text-footnote text-label-secondary">
                {t("settings:SETTINGS_MESSAGING_NOTIFICATION_INVITE_DESC")}
              </div>
            </div>
          </label>
        ),
      },
    ] as const;
  }, [
    form,
    initialValues.mailEnabledTemplates,
    initialValues.notificationInviteEnabled,
    mailEnabledTemplates,
    notificationInviteEnabled,
    patchMutation.isPending,
    resetEmailDelivery,
    resetInAppDelivery,
    saveEmailDelivery,
    saveInAppDelivery,
    savingKey,
    t,
  ]);

  const overlays = useSettingOverlays(overlayConfigs);
  const emailSummary = joinSummaryParts(
    [
      mailEnabledTemplates.length > 0
        ? t("settings:SETTINGS_MESSAGING_SELECTED_COUNT", { count: mailEnabledTemplates.length })
        : null,
    ],
    t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_EMAIL_EMPTY"),
  );

  return (
    <ContentGuard
      loading={coreSettingsQuery.isLoading && !coreSettingsQuery.coreSettings}
      error={coreSettingsQuery.error}
      onRetry={() => void coreSettingsQuery.refetch()}
    >
      <SettingPanel
        title={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_PAGE_TITLE")}
        description={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_PAGE_DESC")}
      >
        <div className="divide-y overflow-hidden rounded-2xl border border-border bg-card">
          <SettingActionItem
            title={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_EMAIL_TITLE")}
            summary={emailSummary}
            description={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_EMAIL_DESC")}
            right={
              <SystemSettingsStatusBadge
                tone={mailEnabledTemplates.length > 0 ? "success" : "default"}
              >
                {mailEnabledTemplates.length > 0
                  ? t("settings:SETTINGS_ENABLED")
                  : t("settings:SETTINGS_DISABLED")}
              </SystemSettingsStatusBadge>
            }
            onTrigger={() => overlays.open("email")}
          />
          <SettingActionItem
            title={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_IN_APP_TITLE")}
            summary={
              notificationInviteEnabled
                ? t("settings:SETTINGS_MESSAGING_NOTIFICATION_INVITE_TITLE")
                : t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_IN_APP_EMPTY")
            }
            description={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_IN_APP_DESC")}
            right={
              <SystemSettingsStatusBadge tone={notificationInviteEnabled ? "success" : "default"}>
                {notificationInviteEnabled
                  ? t("settings:SETTINGS_ENABLED")
                  : t("settings:SETTINGS_DISABLED")}
              </SystemSettingsStatusBadge>
            }
            onTrigger={() => overlays.open("inApp")}
          />
        </div>
      </SettingPanel>

      {overlays.renderOverlays()}
    </ContentGuard>
  );
}
