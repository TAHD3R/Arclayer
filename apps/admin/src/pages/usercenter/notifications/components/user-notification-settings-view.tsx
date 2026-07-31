import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";

import { getMyNotificationPreferences, patchMyNotificationPreference } from "@/api/notifications";
import { SettingsSectionAnchor } from "@/components/layout/settings-screen-provider";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { notifyError } from "@/lib/notifications";
import { UserCenterSettingsSectionStack } from "@/pages/usercenter/shared/usercenter-settings-section-stack";
import type {
  NotificationPreferenceChannel,
  NotificationPreferences,
  NotificationPreferenceTopic,
} from "@arclayer/openapi/admin-types";
import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { Spinner } from "@arclayer/ui/spinner";
import { Checkbox } from "@arclayer/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@arclayer/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@arclayer/ui/tooltip";

type UserNotificationSettingsViewMode = "page" | "dialog";

type UserNotificationSettingsPageProps = {
  mode?: UserNotificationSettingsViewMode;
};

type ChannelColumn = {
  key: NotificationPreferenceChannel;
  title: string;
  description: string;
};

type PreferenceUpdate = {
  topicKey: string;
  channel: NotificationPreferenceChannel;
  enabled: boolean;
};

const NOTIFICATION_PREFERENCES_QUERY_KEY = ["me", "notification-preferences"] as const;
const NOTIFICATION_CHANNELS: readonly NotificationPreferenceChannel[] = [
  "in_app",
  "email",
] as const;

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
  "project.api_key.rotated": {
    title: "account:ME_NOTIFY_TOPIC_PROJECT_API_KEY_ROTATED_TITLE",
    description: "account:ME_NOTIFY_TOPIC_PROJECT_API_KEY_ROTATED_DESC",
  },
  "project.api_key.revoked": {
    title: "account:ME_NOTIFY_TOPIC_PROJECT_API_KEY_REVOKED_TITLE",
    description: "account:ME_NOTIFY_TOPIC_PROJECT_API_KEY_REVOKED_DESC",
  },
  "project.preview_token.created": {
    title: "account:ME_NOTIFY_TOPIC_PROJECT_PREVIEW_TOKEN_CREATED_TITLE",
    description: "account:ME_NOTIFY_TOPIC_PROJECT_PREVIEW_TOKEN_CREATED_DESC",
  },
  "project.content.item.workflow.updated": {
    title: "account:ME_NOTIFY_TOPIC_PROJECT_CONTENT_WORKFLOW_UPDATED_TITLE",
    description: "account:ME_NOTIFY_TOPIC_PROJECT_CONTENT_WORKFLOW_UPDATED_DESC",
  },
  "project.release.scheduled_publish.completed": {
    title: "account:ME_NOTIFY_TOPIC_PROJECT_RELEASE_SCHEDULED_PUBLISH_COMPLETED_TITLE",
    description: "account:ME_NOTIFY_TOPIC_PROJECT_RELEASE_SCHEDULED_PUBLISH_COMPLETED_DESC",
  },
  "project.release.scheduled_publish.failed": {
    title: "account:ME_NOTIFY_TOPIC_PROJECT_RELEASE_SCHEDULED_PUBLISH_FAILED_TITLE",
    description: "account:ME_NOTIFY_TOPIC_PROJECT_RELEASE_SCHEDULED_PUBLISH_FAILED_DESC",
  },
  "automation.notification": {
    title: "account:ME_NOTIFY_TOPIC_AUTOMATION_NOTIFICATION_TITLE",
    description: "account:ME_NOTIFY_TOPIC_AUTOMATION_NOTIFICATION_DESC",
  },
};

function buildChannelColumns(t: (key: string, options?: Record<string, unknown>) => string) {
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
  ] as const satisfies readonly ChannelColumn[];
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

function buildRowKey(topicKey: string, channel: NotificationPreferenceChannel) {
  return `${topicKey}:${channel}`;
}

function applyPreferenceUpdates(
  preferences: NotificationPreferences,
  updates: readonly PreferenceUpdate[],
): NotificationPreferences {
  const enabledByRowKey = new Map(
    updates.map((update) => [buildRowKey(update.topicKey, update.channel), update.enabled]),
  );

  return {
    ...preferences,
    topics: preferences.topics.map((topic) => {
      const nextChannelState: Partial<NotificationPreferenceTopic["channels"]> = {};
      let changed = false;

      for (const channel of NOTIFICATION_CHANNELS) {
        const nextEnabled = enabledByRowKey.get(buildRowKey(topic.key, channel));
        if (nextEnabled === undefined || topic.channels[channel].enabled === nextEnabled) {
          continue;
        }
        nextChannelState[channel] = {
          ...topic.channels[channel],
          enabled: nextEnabled,
        };
        changed = true;
      }

      return changed ? { ...topic, channels: { ...topic.channels, ...nextChannelState } } : topic;
    }),
  };
}

function NotificationTextTooltip(props: { title: string; content: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center text-callout font-semibold text-label-primary transition-colors",
            "cursor-help hover:text-label-primary focus-visible:outline-none",
            "focus-visible:ring-2 focus-visible:ring-primary/20",
          )}
        >
          {props.title}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 text-left">
        <div className="w-full text-left text-pretty">{props.content}</div>
      </TooltipContent>
    </Tooltip>
  );
}

function NotificationChannelHead(props: {
  column: ChannelColumn;
  disabled: boolean;
  pending: boolean;
  t: (key: string, options?: Record<string, unknown>) => string;
  onBulkSelect: (enabled: boolean) => void;
}) {
  return (
    <TableHead className="min-w-[12rem] bg-background align-middle text-center">
      <div className="flex items-center justify-center gap-1.5 px-3 py-2">
        <NotificationTextTooltip title={props.column.title} content={props.column.description} />
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={props.disabled}
                aria-label={props.t("account:ME_NOTIFY_BULK_TRIGGER_ARIA", {
                  channel: props.column.title,
                })}
                className="text-label-secondary"
              >
                {props.pending ? (
                  <Spinner className="size-3.5" />
                ) : (
                  <ChevronDown className="size-3.5 text-label-secondary" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => props.onBulkSelect(true)}>
                {props.t("common:SELECT_ALL")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => props.onBulkSelect(false)}>
                {props.t("common:SELECT_NONE")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </TableHead>
  );
}

export function UserNotificationSettingsView(props: UserNotificationSettingsPageProps) {
  const mode = props.mode ?? "page";
  const { t } = useTranslation(["account", "common"]);
  const queryClient = useQueryClient();
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(() => new Set());
  const [pendingChannels, setPendingChannels] = useState<Set<NotificationPreferenceChannel>>(
    () => new Set(),
  );

  const preferencesQuery = useQuery({
    queryKey: NOTIFICATION_PREFERENCES_QUERY_KEY,
    queryFn: getMyNotificationPreferences,
    staleTime: 30 * 1000,
  });

  const columns = useMemo(() => buildChannelColumns(t), [t]);
  const topics = useMemo(
    () => sortTopics(preferencesQuery.data?.topics ?? []),
    [preferencesQuery.data?.topics],
  );

  async function runPreferenceUpdates(
    updates: readonly PreferenceUpdate[],
    options?: { bulkChannel?: NotificationPreferenceChannel },
  ) {
    if (updates.length <= 0) {
      return;
    }

    const previousPreferences =
      queryClient.getQueryData<NotificationPreferences>(NOTIFICATION_PREFERENCES_QUERY_KEY) ??
      preferencesQuery.data;
    if (!previousPreferences) {
      return;
    }

    const pendingRowKeys = updates.map((update) => buildRowKey(update.topicKey, update.channel));
    setPendingKeys((previous) => {
      const next = new Set(previous);
      pendingRowKeys.forEach((rowKey) => next.add(rowKey));
      return next;
    });
    const bulkChannel = options?.bulkChannel;
    if (bulkChannel) {
      setPendingChannels((previous) => new Set(previous).add(bulkChannel));
    }

    queryClient.setQueryData(
      NOTIFICATION_PREFERENCES_QUERY_KEY,
      applyPreferenceUpdates(previousPreferences, updates),
    );

    try {
      const results = await Promise.all(
        updates.map((update) => patchMyNotificationPreference(update)),
      );
      const nextPreferences = results.at(-1) ?? previousPreferences;
      queryClient.setQueryData(NOTIFICATION_PREFERENCES_QUERY_KEY, nextPreferences);
    } catch (error) {
      queryClient.setQueryData(NOTIFICATION_PREFERENCES_QUERY_KEY, previousPreferences);
      notifyError(error);
    } finally {
      setPendingKeys((previous) => {
        const next = new Set(previous);
        pendingRowKeys.forEach((rowKey) => next.delete(rowKey));
        return next;
      });
      if (bulkChannel) {
        setPendingChannels((previous) => {
          const next = new Set(previous);
          next.delete(bulkChannel);
          return next;
        });
      }
    }
  }

  return (
    <UserCenterSettingsSectionStack mode={mode}>
      <ContentGuard
        loading={preferencesQuery.isLoading && !preferencesQuery.data}
        error={preferencesQuery.error}
        onRetry={() => void preferencesQuery.refetch()}
        empty={!preferencesQuery.isLoading && !preferencesQuery.error && topics.length <= 0}
        emptyTitle={t("common:EMPTY_TITLE")}
        emptyDescription={t("common:EMPTY_DESC")}
      >
        <TooltipProvider>
          <SettingsSectionAnchor section="notification-channel-in-app">
            <SettingsSectionAnchor section="notification-channel-email">
              <div className="pt-1">
                <div className="overflow-hidden rounded-xl border border-border/70 bg-background">
                  <Table className="table-fixed border-collapse text-callout">
                    <colgroup>
                      <col style={{ width: "52%" }} />
                      <col style={{ width: "24%" }} />
                      <col style={{ width: "24%" }} />
                    </colgroup>
                    <TableHeader className="border-b border-border/60 bg-background">
                      <TableRow className="border-border/40 bg-background hover:bg-transparent">
                        <TableHead className="bg-background align-middle">
                          <div className="flex items-center px-4 py-2">
                            <span className="text-callout font-semibold text-label-secondary">
                              {t("account:ME_NOTIFY_COL_TYPE")}
                            </span>
                          </div>
                        </TableHead>
                        {columns.map((column) => {
                          const actionableTopics = topics.filter((topic) => {
                            const channelState = topic.channels[column.key];
                            return channelState.supported && channelState.mutable;
                          });
                          const bulkUpdates = actionableTopics
                            .filter((topic) => !topic.channels[column.key].enabled)
                            .map((topic) => ({
                              topicKey: topic.key,
                              channel: column.key,
                              enabled: true,
                            }));
                          const bulkResets = actionableTopics
                            .filter((topic) => topic.channels[column.key].enabled)
                            .map((topic) => ({
                              topicKey: topic.key,
                              channel: column.key,
                              enabled: false,
                            }));

                          return (
                            <NotificationChannelHead
                              key={column.key}
                              column={column}
                              pending={pendingChannels.has(column.key)}
                              disabled={
                                actionableTopics.length <= 0 || pendingChannels.has(column.key)
                              }
                              t={t}
                              onBulkSelect={(enabled) => {
                                const updates = enabled ? bulkUpdates : bulkResets;
                                void runPreferenceUpdates(updates, { bulkChannel: column.key });
                              }}
                            />
                          );
                        })}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topics.map((topic) => {
                        const copy = resolveTopicCopy(topic, t);

                        return (
                          <TableRow
                            key={topic.key}
                            className="border-border/50 bg-background transition-colors hover:bg-muted/20"
                          >
                            <TableCell className="border-r border-border/40 px-4 py-3">
                              <div className="min-w-0">
                                <div className="break-words font-semibold text-label-primary">
                                  {copy.title}
                                </div>
                                <div className="mt-0.5 line-clamp-3 text-label-secondary">
                                  {copy.description}
                                </div>
                              </div>
                            </TableCell>
                            {columns.map((column) => {
                              const channelState = topic.channels[column.key];
                              const rowKey = buildRowKey(topic.key, column.key);
                              const loading =
                                pendingKeys.has(rowKey) || pendingChannels.has(column.key);
                              const disabled =
                                loading || !channelState.mutable || !channelState.supported;

                              return (
                                <TableCell key={rowKey} className="px-3 py-3 text-center">
                                  <div className="flex justify-center">
                                    {loading ? (
                                      <Spinner className="size-4 text-label-secondary" />
                                    ) : (
                                      <Checkbox
                                        checked={channelState.enabled}
                                        disabled={disabled}
                                        aria-label={t("account:ME_NOTIFY_CELL_TOGGLE_ARIA", {
                                          topic: copy.title,
                                          channel: column.title,
                                        })}
                                        onCheckedChange={(checked) => {
                                          if (!channelState.mutable || !channelState.supported) {
                                            return;
                                          }
                                          void runPreferenceUpdates([
                                            {
                                              topicKey: topic.key,
                                              channel: column.key,
                                              enabled: Boolean(checked),
                                            },
                                          ]);
                                        }}
                                      />
                                    )}
                                  </div>
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </SettingsSectionAnchor>
          </SettingsSectionAnchor>
        </TooltipProvider>
      </ContentGuard>
    </UserCenterSettingsSectionStack>
  );
}
