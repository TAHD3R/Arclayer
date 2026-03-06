import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { readStorageJson, writeStorageJson } from "@/lib/storage";
import { STORAGE_KEYS } from "@/constants/storage";
import { MeSettingPanel } from "@/pages/me/components/me-setting-panel";
import { MeSettingsCategoryLayout } from "@/pages/me/components/me-settings-category-layout";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@celestial/ui/table";
import { Checkbox } from "@celestial/ui/checkbox";

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

type MeNotificationSettingsViewMode = "page" | "dialog";

type MeNotificationSettingsPageProps = {
  mode?: MeNotificationSettingsViewMode;
};

export function MeNotificationSettingsPage(props: MeNotificationSettingsPageProps) {
  const mode = props.mode ?? "page";
  const panelVariant = mode === "dialog" ? "dialog" : "page";
  const { t } = useTranslation(["account", "common"]);
  const [state, setState] = useState<SubscriptionState>(() => readState());

  const topics = useMemo(
    () =>
      [
        {
          key: "security.password_changed" as const,
          title: t("account:ME_NOTIFY_TOPIC_PASSWORD_CHANGED_TITLE"),
          desc: t("account:ME_NOTIFY_TOPIC_PASSWORD_CHANGED_DESC"),
          security: true,
        },
        {
          key: "security.email_changed" as const,
          title: t("account:ME_NOTIFY_TOPIC_EMAIL_CHANGED_TITLE"),
          desc: t("account:ME_NOTIFY_TOPIC_EMAIL_CHANGED_DESC"),
          security: true,
        },
        {
          key: "security.new_login" as const,
          title: t("account:ME_NOTIFY_TOPIC_NEW_LOGIN_TITLE"),
          desc: t("account:ME_NOTIFY_TOPIC_NEW_LOGIN_DESC"),
          security: true,
        },
        {
          key: "team.invited" as const,
          title: t("account:ME_NOTIFY_TOPIC_TEAM_INVITE_TITLE"),
          desc: t("account:ME_NOTIFY_TOPIC_TEAM_INVITE_DESC"),
          security: false,
        },
        {
          key: "team.role_changed" as const,
          title: t("account:ME_NOTIFY_TOPIC_ROLE_CHANGED_TITLE"),
          desc: t("account:ME_NOTIFY_TOPIC_ROLE_CHANGED_DESC"),
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
    <MeSettingsCategoryLayout
      showNav={mode === "page"}
      categories={[
        {
          key: "matrix",
          label: t("account:ME_NOTIFY_PANEL_TITLE"),
          content: (
            <MeSettingPanel
              title={t("account:ME_NOTIFY_PANEL_TITLE")}
              description={t("account:ME_NOTIFY_PANEL_DESC")}
              showDivider={false}
              variant={panelVariant}
            >
              <div className="mt-4 relative isolate overflow-auto rounded-xl border border-border/80 bg-background">
                <table className="w-full min-w-max text-callout [&_th]:whitespace-nowrap">
                  <TableHeader className="sticky top-0 z-[2] bg-background">
                    <TableRow className="border-border/60 hover:bg-transparent border-b">
                      <TableHead className="sticky left-0 z-[3] w-[360px] bg-background text-left font-semibold text-label-primary tracking-wider">
                        {t("account:ME_NOTIFY_COL_TYPE")}
                      </TableHead>
                      <TableHead className="min-w-[120px] text-center font-semibold text-label-primary tracking-wider">
                        {t("account:ME_NOTIFY_COL_IN_APP")}
                      </TableHead>
                      <TableHead className="min-w-[120px] text-center font-semibold text-label-primary tracking-wider">
                        {t("account:ME_NOTIFY_COL_EMAIL")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {topics.map((topic) => {
                      const current = state[topic.key];
                      const emailLocked = topic.security;
                      const inAppLocked = true; // Not supported yet

                      return (
                        <TableRow
                          key={topic.key}
                          className="group/row border-b border-border/40 hover:bg-muted/40 last:border-b-0"
                        >
                          <TableCell className="sticky left-0 z-[1] w-90 bg-background group-hover/row:bg-muted/40 transition-colors">
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-label-primary">
                                {topic.title}
                              </div>
                              {topic.desc ? (
                                <div className="mt-0.5 line-clamp-2 text-label-secondary">
                                  {topic.desc}
                                </div>
                              ) : null}
                            </div>
                          </TableCell>

                          <TableCell className="text-center">
                            <div className="flex justify-center">
                              <Checkbox checked={false} disabled={inAppLocked} />
                            </div>
                          </TableCell>

                          <TableCell className="text-center">
                            <div className="flex justify-center">
                              <Checkbox
                                checked={emailLocked ? true : current.email}
                                disabled={emailLocked}
                                onCheckedChange={(checked) => {
                                  if (emailLocked) return;
                                  const next = {
                                    ...state,
                                    [topic.key]: { ...current, email: Boolean(checked) },
                                  };
                                  writeState(next);
                                  setState(next);
                                }}
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </table>
              </div>
            </MeSettingPanel>
          ),
        },
      ]}
    />
  );
}
