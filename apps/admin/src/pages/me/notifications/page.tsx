import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { getMyNotificationPreferences, patchMyNotificationPreference } from "@/api/notifications";
import { ContentGuard } from "@/components/common/content-guard";
import { notifyError } from "@/lib/notifications";
import { MeSettingsCategoryLayout } from "@/pages/me/components/me-settings-category-layout";
import type { NotificationPreferenceChannel, NotificationPreferenceTopic } from "@/types/api";
import { SettingActionItem } from "@celestial/ui/setting-action-item";
import { Spinner } from "@celestial/ui/spinner";
import { Switch } from "@celestial/ui/switch";

type MeNotificationSettingsViewMode = "page" | "dialog";

type MeNotificationSettingsPageProps = {
  mode?: MeNotificationSettingsViewMode;
};

type ChannelSection = {
  key: NotificationPreferenceChannel;
  title: string;
  description: string;
};

const TOPIC_I18N_FALLBACK: Record<string, { title: string; description: string }> = {
  "workspace.invitation.accepted": {
    title: "account:ME_NOTIFY_TOPIC_WORKSPACE_INVITATION_ACCEPTED_TITLE",
    description: "account:ME_NOTIFY_TOPIC_WORKSPACE_INVITATION_ACCEPTED_DESC",
  },
  "workspace.invite.email.created": {
    title: "account:ME_NOTIFY_TOPIC_WORKSPACE_INVITE_CREATED_TITLE",
    description: "account:ME_NOTIFY_TOPIC_WORKSPACE_INVITE_CREATED_DESC",
  },
  "workspace.invite.email.updated": {
    title: "account:ME_NOTIFY_TOPIC_WORKSPACE_INVITE_UPDATED_TITLE",
    description: "account:ME_NOTIFY_TOPIC_WORKSPACE_INVITE_UPDATED_DESC",
  },
  "workspace.invite.email.renewed": {
    title: "account:ME_NOTIFY_TOPIC_WORKSPACE_INVITE_RENEWED_TITLE",
    description: "account:ME_NOTIFY_TOPIC_WORKSPACE_INVITE_RENEWED_DESC",
  },
  "workspace.invite.email.revoked": {
    title: "account:ME_NOTIFY_TOPIC_WORKSPACE_INVITE_REVOKED_TITLE",
    description: "account:ME_NOTIFY_TOPIC_WORKSPACE_INVITE_REVOKED_DESC",
  },
  "workspace.member.status.updated": {
    title: "account:ME_NOTIFY_TOPIC_WORKSPACE_MEMBER_STATUS_UPDATED_TITLE",
    description: "account:ME_NOTIFY_TOPIC_WORKSPACE_MEMBER_STATUS_UPDATED_DESC",
  },
  "workspace.member.roles.updated": {
    title: "account:ME_NOTIFY_TOPIC_WORKSPACE_MEMBER_ROLES_UPDATED_TITLE",
    description: "account:ME_NOTIFY_TOPIC_WORKSPACE_MEMBER_ROLES_UPDATED_DESC",
  },
  "workspace.member.password.reset": {
    title: "account:ME_NOTIFY_TOPIC_WORKSPACE_MEMBER_PASSWORD_RESET_TITLE",
    description: "account:ME_NOTIFY_TOPIC_WORKSPACE_MEMBER_PASSWORD_RESET_DESC",
  },
};

function buildChannelSections(t: (key: string) => string): readonly ChannelSection[] {
  return [
    {
      key: "in_app",
      title: t("account:ME_NOTIFY_CHANNEL_IN_APP_TITLE"),
      description: t("account:ME_NOTIFY_CHANNEL_IN_APP_DESC"),
    },
    {
      key: "email",
      title: t("account:ME_NOTIFY_EMAIL_PANEL_TITLE"),
      description: t("account:ME_NOTIFY_EMAIL_PANEL_DESC"),
    },
  ] as const;
}

function resolveTopicCopy(
  topic: NotificationPreferenceTopic,
  t: (key: string) => string,
): { title: string; description: string } {
  const fallback = TOPIC_I18N_FALLBACK[topic.key];
  const titleKey = topic.titleI18n ?? topic.title_i18n ?? fallback?.title ?? "";
  const descriptionKey =
    topic.descriptionI18n ?? topic.description_i18n ?? fallback?.description ?? "";
  const resolvedTitle = titleKey ? t(titleKey) : "";
  const resolvedDescription = descriptionKey ? t(descriptionKey) : "";

  const title =
    resolvedTitle && resolvedTitle !== titleKey
      ? resolvedTitle
      : fallback
        ? t(fallback.title)
        : t("account:ME_NOTIFY_TOPIC_GENERIC_TITLE");
  const description =
    resolvedDescription && resolvedDescription !== descriptionKey
      ? resolvedDescription
      : fallback
        ? t(fallback.description)
        : t("account:ME_NOTIFY_TOPIC_GENERIC_DESC");
  return { title, description };
}

function sortTopics(topics: NotificationPreferenceTopic[]): NotificationPreferenceTopic[] {
  return [...topics].sort((left, right) => left.key.localeCompare(right.key));
}

export function MeNotificationSettingsPage(props: MeNotificationSettingsPageProps) {
  const mode = props.mode ?? "page";
  const { t } = useTranslation(["account", "common"]);
  const queryClient = useQueryClient();
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);

  const preferencesQuery = useQuery({
    queryKey: ["me", "notification-preferences"],
    queryFn: getMyNotificationPreferences,
    staleTime: 30 * 1000,
  });

  const patchMutation = useMutation({
    mutationFn: patchMyNotificationPreference,
    onMutate: (variables) => {
      setUpdatingKey(`${variables.topicKey}:${variables.channel}`);
    },
    onSuccess: (next) => {
      queryClient.setQueryData(["me", "notification-preferences"], next);
    },
    onError: (error) => notifyError(error),
    onSettled: () => setUpdatingKey(null),
  });

  const sections = useMemo(() => buildChannelSections(t), [t]);
  const topics = useMemo(
    () => sortTopics(preferencesQuery.data?.topics ?? []),
    [preferencesQuery.data?.topics],
  );

  return (
    <MeSettingsCategoryLayout
      showNav={mode === "page"}
      categories={[
        {
          key: "notifications",
          label: t("account:ME_TAB_NOTIFICATIONS"),
          content: (
            <ContentGuard
              loading={preferencesQuery.isLoading && !preferencesQuery.data}
              error={preferencesQuery.error}
              onRetry={() => void preferencesQuery.refetch()}
              empty={!preferencesQuery.isLoading && !preferencesQuery.error && topics.length <= 0}
              emptyTitle={t("common:EMPTY_TITLE")}
              emptyDescription={t("common:EMPTY_DESC")}
            >
              <div className="flex flex-col gap-6 pt-1">
                {sections.map((section) => (
                  <section key={section.key} className="flex flex-col">
                    <header className="pb-4 pt-1">
                      <div className="text-title3 font-bold text-label-primary">
                        {section.title}
                      </div>
                      <div className="mt-1 text-label-secondary">{section.description}</div>
                    </header>
                    <div className="h-px bg-border" />

                    <div className="pt-4">
                      <div className="overflow-hidden rounded-xl border border-border/70 bg-background">
                        <div className="divide-y divide-border/60">
                          {topics.map((topic) => {
                            const channel = topic.channels[section.key];
                            const copy = resolveTopicCopy(topic, t);
                            const rowKey = `${topic.key}:${section.key}`;
                            const disabled = !channel.mutable || patchMutation.isPending;
                            const loading = updatingKey === rowKey;

                            return (
                              <SettingActionItem
                                key={rowKey}
                                as="div"
                                showSummary={false}
                                showChevron={false}
                                title={copy.title}
                                titleClassName="text-callout"
                                description={copy.description}
                                right={
                                  <div className="flex items-center gap-2">
                                    {loading ? (
                                      <Spinner className="size-4 text-label-secondary" />
                                    ) : null}
                                    <Switch
                                      checked={channel.enabled}
                                      disabled={disabled}
                                      onCheckedChange={(checked) => {
                                        if (!channel.mutable) return;
                                        void patchMutation.mutate({
                                          topicKey: topic.key,
                                          channel: section.key,
                                          enabled: checked,
                                        });
                                      }}
                                    />
                                  </div>
                                }
                              />
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </section>
                ))}
              </div>
            </ContentGuard>
          ),
        },
      ]}
    />
  );
}
