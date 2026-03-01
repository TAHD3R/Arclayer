import { Switch } from "antd";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { SettingPanel } from "@/components/settings-primitives/setting-panel";
import { SettingActionItem } from "@/components/settings-primitives/setting-action-item";
import { readStorageJson, writeStorageJson } from "@/lib/storage";
import { STORAGE_KEYS } from "@/constants/storage";

type TopicKey =
  | "security.password_changed"
  | "security.email_changed"
  | "security.new_login"
  | "team.invited"
  | "team.role_changed";

type SubscriptionState = Record<TopicKey, { in_app: boolean; email: boolean }>;

const DEFAULT_STATE: SubscriptionState = {
  "security.password_changed": { in_app: false, email: true },
  "security.email_changed": { in_app: false, email: true },
  "security.new_login": { in_app: false, email: true },
  "team.invited": { in_app: false, email: false },
  "team.role_changed": { in_app: false, email: false },
};

function readState(): SubscriptionState {
  const raw = readStorageJson<Partial<SubscriptionState>>(STORAGE_KEYS.meNotificationSubscriptions);
  const merged = { ...DEFAULT_STATE, ...(raw ?? undefined) } as SubscriptionState;
  merged["security.password_changed"].email = true;
  merged["security.email_changed"].email = true;
  merged["security.new_login"].email = true;
  merged["security.password_changed"].in_app = false;
  merged["security.email_changed"].in_app = false;
  merged["security.new_login"].in_app = false;
  return merged;
}

function writeState(state: SubscriptionState) {
  writeStorageJson(STORAGE_KEYS.meNotificationSubscriptions, state);
}

export function MeNotificationSettingsPage() {
  const { t } = useTranslation("account");
  const [state, setState] = useState<SubscriptionState>(() => readState());

  const topics = useMemo(
    () =>
      [
        {
          key: "security.password_changed" as const,
          title: t("ME_NOTIFY_TOPIC_PASSWORD_CHANGED_TITLE"),
          desc: t("ME_NOTIFY_TOPIC_PASSWORD_CHANGED_DESC"),
          security: true,
        },
        {
          key: "security.email_changed" as const,
          title: t("ME_NOTIFY_TOPIC_EMAIL_CHANGED_TITLE"),
          desc: t("ME_NOTIFY_TOPIC_EMAIL_CHANGED_DESC"),
          security: true,
        },
        {
          key: "security.new_login" as const,
          title: t("ME_NOTIFY_TOPIC_NEW_LOGIN_TITLE"),
          desc: t("ME_NOTIFY_TOPIC_NEW_LOGIN_DESC"),
          security: true,
        },
        {
          key: "team.invited" as const,
          title: t("ME_NOTIFY_TOPIC_TEAM_INVITE_TITLE"),
          desc: t("ME_NOTIFY_TOPIC_TEAM_INVITE_DESC"),
          security: false,
        },
        {
          key: "team.role_changed" as const,
          title: t("ME_NOTIFY_TOPIC_ROLE_CHANGED_TITLE"),
          desc: t("ME_NOTIFY_TOPIC_ROLE_CHANGED_DESC"),
          security: false,
        },
      ] satisfies Array<{
        key: TopicKey;
        title: string;
        desc: string;
        security: boolean;
      }>,
    [t],
  );

  return (
    <div className="flex flex-col gap-8">
      <SettingPanel title={t("ME_NOTIFY_PANEL_TITLE")} description={t("ME_NOTIFY_PANEL_DESC")}>
        <div className="rounded-lg border border-border bg-card">
          <SettingActionItem
            as="div"
            title={t("ME_NOTIFY_CHANNEL_IN_APP_TITLE")}
            description={t("ME_NOTIFY_CHANNEL_IN_APP_DESC")}
            showChevron={false}
            showSummary={false}
            right={<Switch disabled checked={false} />}
          />
        </div>
      </SettingPanel>

      <SettingPanel
        title={t("ME_NOTIFY_EMAIL_PANEL_TITLE")}
        description={t("ME_NOTIFY_EMAIL_PANEL_DESC")}
      >
        <div className="rounded-lg border border-border bg-card">
          {topics.map((topic) => {
            const current = state[topic.key];
            const emailLocked = topic.security;
            return (
              <SettingActionItem
                key={topic.key}
                as="div"
                title={topic.title}
                description={topic.desc}
                showChevron={false}
                showSummary={false}
                right={
                  <Switch
                    checked={emailLocked ? true : current.email}
                    disabled={emailLocked}
                    onChange={(checked) => {
                      if (emailLocked) return;
                      const next = {
                        ...state,
                        [topic.key]: { ...current, email: Boolean(checked) },
                      };
                      writeState(next);
                      setState(next);
                    }}
                  />
                }
              />
            );
          })}
        </div>
      </SettingPanel>
    </div>
  );
}
