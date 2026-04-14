import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { SettingActionGroup } from "@arclayer/ui/setting-action-group";
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
import { OverlayBooleanField, joinSummaryParts } from "@/pages/system/system-settings-form-utils";

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
            backText={t("common:CANCEL")}
            saveText={t("settings:SETTINGS_SAVE")}
            saveLoading={savingKey === "notifications.email"}
            disabled={patchMutation.isPending}
            onSave={saveEmailDelivery}
          />
        ),
        content: () => (
          <div className="space-y-5">
            <OverlayBooleanField
              variant="checkbox"
              label={t("settings:SETTINGS_MESSAGING_MAIL_TEMPLATE_REG_PROMPT_TITLE")}
              description={t("settings:SETTINGS_MESSAGING_MAIL_TEMPLATE_REG_PROMPT_DESC")}
              checked={Boolean(form.watch("mailEnabledTemplates")?.includes("registration_prompt"))}
              onCheckedChange={(checked) => {
                const current = form.getValues("mailEnabledTemplates") || [];
                const next = checked
                  ? [...current, "registration_prompt"]
                  : current.filter((value) => value !== "registration_prompt");
                form.setValue("mailEnabledTemplates", Array.from(new Set(next)), {
                  shouldDirty: true,
                });
              }}
              stateLabel={t(
                form.watch("mailEnabledTemplates")?.includes("registration_prompt")
                  ? "settings:SETTINGS_ENABLED"
                  : "settings:SETTINGS_DISABLED",
              )}
            />
            <OverlayBooleanField
              variant="checkbox"
              label={t("settings:SETTINGS_MESSAGING_MAIL_TEMPLATE_WELCOME_TITLE")}
              description={t("settings:SETTINGS_MESSAGING_MAIL_TEMPLATE_WELCOME_DESC")}
              checked={Boolean(form.watch("mailEnabledTemplates")?.includes("welcome_email"))}
              onCheckedChange={(checked) => {
                const current = form.getValues("mailEnabledTemplates") || [];
                const next = checked
                  ? [...current, "welcome_email"]
                  : current.filter((value) => value !== "welcome_email");
                form.setValue("mailEnabledTemplates", Array.from(new Set(next)), {
                  shouldDirty: true,
                });
              }}
              stateLabel={t(
                form.watch("mailEnabledTemplates")?.includes("welcome_email")
                  ? "settings:SETTINGS_ENABLED"
                  : "settings:SETTINGS_DISABLED",
              )}
            />
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
            backText={t("common:CANCEL")}
            saveText={t("settings:SETTINGS_SAVE")}
            saveLoading={savingKey === "notifications.inApp"}
            disabled={patchMutation.isPending}
            onSave={saveInAppDelivery}
          />
        ),
        content: () => (
          <OverlayBooleanField
            variant="checkbox"
            label={t("settings:SETTINGS_MESSAGING_NOTIFICATION_INVITE_TITLE")}
            description={t("settings:SETTINGS_MESSAGING_NOTIFICATION_INVITE_DESC")}
            checked={Boolean(form.watch("notificationInviteEnabled"))}
            onCheckedChange={(checked) => {
              form.setValue("notificationInviteEnabled", Boolean(checked), {
                shouldDirty: true,
              });
            }}
            stateLabel={t(
              form.watch("notificationInviteEnabled")
                ? "settings:SETTINGS_ENABLED"
                : "settings:SETTINGS_DISABLED",
            )}
          />
        ),
      },
    ] as const;
  }, [form, patchMutation.isPending, saveEmailDelivery, saveInAppDelivery, savingKey, t]);

  const overlays = useSettingOverlays(overlayConfigs);
  const openOverlay = (key: NotificationsOverlayKey) => {
    form.reset(initialValues);
    overlays.open(key);
  };
  const mailEnabledTemplates = initialValues.mailEnabledTemplates;
  const notificationInviteEnabled = initialValues.notificationInviteEnabled;
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
        bordered={false}
      >
        <SettingActionGroup>
          <SettingActionItem
            title={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_EMAIL_TITLE")}
            summary={emailSummary}
            description={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_EMAIL_DESC")}
            onTrigger={() => openOverlay("email")}
          />
          <SettingActionItem
            title={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_IN_APP_TITLE")}
            summary={
              notificationInviteEnabled
                ? t("settings:SETTINGS_MESSAGING_NOTIFICATION_INVITE_TITLE")
                : t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_IN_APP_EMPTY")
            }
            description={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_IN_APP_DESC")}
            onTrigger={() => openOverlay("inApp")}
          />
        </SettingActionGroup>
      </SettingPanel>

      {overlays.renderOverlays()}
    </ContentGuard>
  );
}
