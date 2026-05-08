import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { Checkbox } from "@arclayer/ui/checkbox";
import { useSavingKey } from "@arclayer/hooks/use-saving-key";

import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { notifySuccessText } from "@/lib/notifications";
import {
  SystemSettingFooterActions,
  SystemSettingItem,
  SystemSettingStack,
} from "@/pages/system/components/system-setting-item";
import {
  getSystemSettingsSection,
  readRecordValue,
  readStringArrayValue,
  usePatchSystemCoreSettings,
  useSystemCoreSettings,
} from "@/pages/system/hooks/use-system-core-settings";

type NotificationsFormValues = {
  mailEnabledTemplates: string[];
  notificationGroups: Record<string, { enabled: boolean }>;
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
    if (typeof rawEnabled === "boolean") {
      next[group.key] = { enabled: rawEnabled };
    }
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

function templateListChanged(left: readonly string[], right: readonly string[]): boolean {
  return left.slice().sort().join("|") !== right.slice().sort().join("|");
}

function buildInitialValues(
  input: ReturnType<typeof useSystemCoreSettings>["coreSettings"],
): NotificationsFormValues {
  const mail = getSystemSettingsSection(input, "mail");
  const notifications = getSystemSettingsSection(input, "notifications");
  const preferences = readRecordValue(mail, "preferences");

  return {
    mailEnabledTemplates: readStringArrayValue(preferences, "enabled_templates"),
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

  const initialValues = useMemo(
    () => buildInitialValues(coreSettingsQuery.coreSettings),
    [coreSettingsQuery.coreSettings],
  );

  const form = useForm<NotificationsFormValues>({
    defaultValues: initialValues,
    mode: "onSubmit",
  });
  const values = form.watch();
  const templatesDirty = templateListChanged(
    values.mailEnabledTemplates,
    initialValues.mailEnabledTemplates,
  );
  const notificationGroupsDirty = notificationGroupsChanged(
    values.notificationGroups,
    initialValues.notificationGroups,
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

  const saveNotificationGroups = () =>
    withSavingKey("notifications.groups", async () => {
      const nextGroups = normalizeNotificationGroups(form.getValues("notificationGroups"));
      await persistPatch(
        {
          notifications: {
            groups: nextGroups,
          },
        },
        {
          ...form.getValues(),
          notificationGroups: nextGroups,
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
              dirty={notificationGroupsDirty}
              pending={savingKey === "notifications.groups" || patchMutation.isPending}
              onReset={() =>
                form.reset({
                  ...form.getValues(),
                  notificationGroups: initialValues.notificationGroups,
                })
              }
              onSave={() => void saveNotificationGroups()}
            />
          }
        >
          <div className="grid gap-3 md:grid-cols-2">
            {NOTIFICATION_GROUP_OPTIONS.map((group) => {
              const checked = Boolean(values.notificationGroups[group.key]?.enabled);
              return (
                <label
                  key={group.key}
                  className="flex min-w-0 cursor-pointer items-start gap-3 px-0 py-2"
                >
                  <Checkbox
                    checked={checked}
                    className="mt-0.5"
                    onCheckedChange={(next) => {
                      const current = normalizeNotificationGroups(
                        form.getValues("notificationGroups"),
                      );
                      form.setValue(
                        "notificationGroups",
                        {
                          ...current,
                          [group.key]: { enabled: Boolean(next) },
                        },
                        { shouldDirty: true },
                      );
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-headline font-semibold text-label-primary">
                      {t(group.titleKey)}
                    </div>
                    <div className="mt-1 text-callout text-label-secondary">
                      {t(group.descriptionKey)}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
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
                <label
                  key={template.key}
                  className="flex min-w-0 cursor-pointer items-start gap-3 px-0 py-2"
                >
                  <Checkbox
                    checked={checked}
                    className="mt-0.5"
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
                  <div className="min-w-0 flex-1">
                    <div className="text-headline font-semibold text-label-primary">
                      {t(template.titleKey)}
                    </div>
                    <div className="mt-1 text-callout text-label-secondary">
                      {t(template.descriptionKey)}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </SystemSettingItem>
      </SystemSettingStack>
    </ContentGuard>
  );
}
