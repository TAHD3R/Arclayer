import { useQuery } from "@tanstack/react-query";
import { Avatar, Button } from "antd";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import * as authApi from "@/api/auth";
import { SettingPanel } from "@/components/settings-primitives/setting-panel";
import { SettingActionItem } from "@/components/settings-primitives/setting-action-item";
import { resolveAssetRefToPublicUrlPath } from "@/lib/assets/asset-urls";
import { initialsFromName, normalizeUserProfile } from "@/lib/auth/user-profile";
import { useAuthStore } from "@/stores/use-auth-store";

export function MeProfilePage() {
  const { t } = useTranslation("account");
  const accessToken = useAuthStore((s) => s.accessToken);

  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    enabled: Boolean(accessToken),
    queryFn: async () => authApi.me(),
    meta: { silent: true },
  });

  const profile = useMemo(() => normalizeUserProfile(meQuery.data), [meQuery.data]);
  const displayName = profile.displayName ?? profile.username ?? profile.email ?? "-";

  return (
    <div className="flex flex-col gap-8">
      <SettingPanel title={t("ME_PROFILE_PANEL_TITLE")} description={t("ME_PROFILE_PANEL_DESC")}>
        <div className="rounded-lg border border-border bg-card">
          <SettingActionItem
            as="div"
            title={t("ME_PROFILE_DISPLAY_NAME_TITLE")}
            description={t("ME_PROFILE_DISPLAY_NAME_DESC")}
            summary={displayName}
            placeholder="-"
            showChevron={false}
            right={
              <Button disabled type="default">
                {t("ME_ACTION_EDIT")}
              </Button>
            }
          />

          <SettingActionItem
            as="div"
            title={t("ME_PROFILE_AVATAR_TITLE")}
            description={t("ME_PROFILE_AVATAR_DESC")}
            showChevron={false}
            showSummary={false}
            right={
              <div className="flex items-center gap-2">
                <Avatar
                  size={28}
                  src={resolveAssetRefToPublicUrlPath(profile.avatarUrl) ?? undefined}
                >
                  {initialsFromName(displayName === "-" ? "用户" : displayName)}
                </Avatar>
                <Button disabled type="default">
                  {t("ME_PROFILE_AVATAR_CHANGE")}
                </Button>
                <Button disabled type="default">
                  {t("ME_PROFILE_AVATAR_REMOVE")}
                </Button>
              </div>
            }
          />

          <SettingActionItem
            as="div"
            title={t("ME_PROFILE_EMAIL_TITLE")}
            description={t("ME_PROFILE_EMAIL_DESC")}
            summary={profile.email ?? "-"}
            placeholder="-"
            showChevron={false}
            right={
              <Button disabled type="default">
                {t("ME_PROFILE_EMAIL_CHANGE")}
              </Button>
            }
          />

          <SettingActionItem
            as="div"
            title={t("ME_PROFILE_USER_ID_TITLE")}
            description={t("ME_PROFILE_USER_ID_DESC")}
            summary={(meQuery.data as { id?: string } | undefined)?.id ?? "-"}
            placeholder="-"
            showChevron={false}
          />
        </div>
      </SettingPanel>

      <SettingPanel title={t("ME_DANGER_PANEL_TITLE")} description={t("ME_DANGER_PANEL_DESC")}>
        <div className="rounded-lg border border-border bg-card">
          <SettingActionItem
            as="div"
            title={t("ME_DELETE_ACCOUNT_TITLE")}
            description={t("ME_DELETE_ACCOUNT_DESC")}
            showChevron={false}
            showSummary={false}
            right={
              <Button disabled danger type="primary">
                {t("ME_DELETE_ACCOUNT_ACTION")}
              </Button>
            }
          />
        </div>
      </SettingPanel>
    </div>
  );
}
