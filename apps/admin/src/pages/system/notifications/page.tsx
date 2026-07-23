import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { useSavingKey } from "@arclayer/hooks/use-saving-key";
import { Checkbox } from "@arclayer/ui/checkbox";

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
  usePatchSystemCoreSettings,
  useSystemCoreSettings,
} from "@/pages/system/hooks/use-system-core-settings";

import { NotificationCampaignsSection } from "./notification-campaigns-section";

type NotificationsPolicyFormValues = {
  notificationGroups: Record<string, { enabled: boolean }>;
};

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
  const initialValues = useMemo(
    () => buildInitialValues(coreSettingsQuery.coreSettings),
    [coreSettingsQuery.coreSettings],
  );
  const policyForm = useForm<NotificationsPolicyFormValues>({
    defaultValues: initialValues,
    mode: "onSubmit",
  });
  const policyValues = policyForm.watch();
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

        <NotificationCampaignsSection />
      </SystemSettingStack>
    </ContentGuard>
  );
}
