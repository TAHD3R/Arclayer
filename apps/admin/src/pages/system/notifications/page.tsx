import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import { Checkbox } from "@arclayer/ui/checkbox";
import { Switch } from "@arclayer/ui/switch";
import { useSavingKey } from "@arclayer/hooks/use-saving-key";

import { useSettingsScreen } from "@/components/layout/settings-screen-provider";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { notifySuccessText } from "@/lib/notifications";
import {
  SystemSettingFooterActions,
  SystemSettingInlineNote,
  SystemSettingItem,
  SystemSettingRow,
  SystemSettingStack,
} from "@/pages/system/components/system-setting-item";
import {
  getSystemSettingsSection,
  readBooleanValue,
  readRecordValue,
  readStringArrayValue,
  usePatchSystemCoreSettings,
  useSystemCoreSettings,
} from "@/pages/system/hooks/use-system-core-settings";

type NotificationsFormValues = {
  mailEnabledTemplates: string[];
  notificationInviteEnabled: boolean;
};

const TEMPLATE_OPTIONS = [
  {
    key: "registration_prompt",
    titleKey: "settings:SETTINGS_MESSAGING_MAIL_TEMPLATE_REG_PROMPT_TITLE",
    descriptionKey: "settings:SETTINGS_MESSAGING_MAIL_TEMPLATE_REG_PROMPT_DESC",
  },
  {
    key: "welcome_email",
    titleKey: "settings:SETTINGS_MESSAGING_MAIL_TEMPLATE_WELCOME_TITLE",
    descriptionKey: "settings:SETTINGS_MESSAGING_MAIL_TEMPLATE_WELCOME_DESC",
  },
] as const;

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

function templateListChanged(left: readonly string[], right: readonly string[]): boolean {
  return left.slice().sort().join("|") !== right.slice().sort().join("|");
}

export function SystemSettingsNotificationsPage() {
  const { t } = useTranslation(["settings"]);
  const { savingKey, withSavingKey } = useSavingKey();
  const { openSettings } = useSettingsScreen();
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
  const values = form.watch();
  const inviteDirty = values.notificationInviteEnabled !== initialValues.notificationInviteEnabled;
  const templatesDirty = templateListChanged(
    values.mailEnabledTemplates,
    initialValues.mailEnabledTemplates,
  );

  useEffect(() => {
    if (!coreSettingsQuery.coreSettings) return;
    if (form.formState.isDirty) return;
    form.reset(initialValues);
  }, [coreSettingsQuery.coreSettings, form, initialValues]);

  const persistPatch = async (
    patch: Record<string, unknown>,
    nextValues: NotificationsFormValues,
  ) => {
    await patchMutation.mutateAsync(patch);
    form.reset(nextValues);
    notifySuccessText(t("settings:SETTINGS_SAVED"));
  };

  const saveEmailTemplates = () =>
    withSavingKey("notifications.emailTemplates", async () => {
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

  const saveInvitePolicy = () =>
    withSavingKey("notifications.invite", async () => {
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
              dirty={inviteDirty}
              pending={savingKey === "notifications.invite" || patchMutation.isPending}
              onReset={() =>
                form.reset({
                  ...form.getValues(),
                  notificationInviteEnabled: initialValues.notificationInviteEnabled,
                })
              }
              onSave={() => void saveInvitePolicy()}
            />
          }
        >
          <SystemSettingRow
            title={t("settings:SETTINGS_MESSAGING_NOTIFICATION_INVITE_TITLE")}
            description={t("settings:SETTINGS_MESSAGING_NOTIFICATION_INVITE_DESC")}
            control={
              <Switch
                checked={values.notificationInviteEnabled}
                onCheckedChange={(checked) =>
                  form.setValue("notificationInviteEnabled", checked, { shouldDirty: true })
                }
              />
            }
          />
        </SystemSettingItem>

        <SystemSettingItem
          id="notification-email-templates"
          title={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_EMAIL_TITLE")}
          description={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_EMAIL_DESC")}
          footer={
            <SystemSettingFooterActions
              dirty={templatesDirty}
              pending={savingKey === "notifications.emailTemplates" || patchMutation.isPending}
              onReset={() =>
                form.reset({
                  ...form.getValues(),
                  mailEnabledTemplates: initialValues.mailEnabledTemplates,
                })
              }
              onSave={() => void saveEmailTemplates()}
            />
          }
        >
          <div className="grid gap-3 md:grid-cols-2">
            {TEMPLATE_OPTIONS.map((template) => {
              const checked = values.mailEnabledTemplates.includes(template.key);
              return (
                <SystemSettingRow
                  key={template.key}
                  title={t(template.titleKey)}
                  description={t(template.descriptionKey)}
                  className="justify-start"
                  control={
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(next) => {
                        const current = form.getValues("mailEnabledTemplates") || [];
                        const nextTemplates = next
                          ? [...current, template.key]
                          : current.filter((item) => item !== template.key);
                        form.setValue("mailEnabledTemplates", Array.from(new Set(nextTemplates)), {
                          shouldDirty: true,
                        });
                      }}
                    />
                  }
                />
              );
            })}
          </div>
        </SystemSettingItem>

        <SystemSettingItem
          id="personal-notifications"
          title={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_PERSONAL_TITLE")}
          description={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_PERSONAL_DESC")}
          headerAction={
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                openSettings({
                  screen: "personal.notifications",
                })
              }
            >
              {t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_PERSONAL_ACTION")}
            </Button>
          }
        >
          <SystemSettingInlineNote>
            {t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_PERSONAL_NOTE")}
          </SystemSettingInlineNote>
        </SystemSettingItem>
      </SystemSettingStack>
    </ContentGuard>
  );
}
