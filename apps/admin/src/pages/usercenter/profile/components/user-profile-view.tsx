import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import * as authApi from "@/api/auth";
import { normalizeUserProfile } from "@/lib/auth/user-profile";
import { UserProfileAccountSecuritySection } from "@/pages/usercenter/profile/components/profile-account-security-section";
import { UserCenterSettingPanel } from "@/pages/usercenter/shared/usercenter-setting-panel";
import { UserCenterSettingsSectionStack } from "@/pages/usercenter/shared/usercenter-settings-section-stack";
import { UserProfileBasicsSection } from "@/pages/usercenter/profile/components/profile-basics-section";
import { UserDangerSection } from "@/pages/usercenter/profile/components/profile-danger-section";
import { UserLinkedAccountsSection } from "@/pages/usercenter/profile/components/profile-linked-accounts-section";
import { useAuthStore } from "@/stores/use-auth-store";
import { SpinnerOverlay } from "@arclayer/ui/spinner";

type UserProfileViewProps = {
  mode?: "page" | "dialog";
};

function UserProfileViewContent(props: Required<UserProfileViewProps>) {
  const panelVariant = props.mode === "dialog" ? "dialog" : "page";
  const { t } = useTranslation("account");
  const accessToken = useAuthStore((s) => s.accessToken);
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });

  const meQuery = useQuery({
    queryKey: ["auth", "me", sessionVersion],
    enabled: Boolean(accessToken),
    queryFn: async () => authApi.me(),
    meta: { silent: true },
  });

  const profile = useMemo(() => normalizeUserProfile(meQuery.data), [meQuery.data]);

  const redirect = useMemo(() => `${pathname}${searchStr}`, [pathname, searchStr]);
  const loading = meQuery.isLoading && !meQuery.data;

  return (
    <div className="relative min-h-full">
      <UserCenterSettingsSectionStack mode={props.mode}>
        <UserCenterSettingPanel
          title={t("ME_PROFILE_ACCOUNT_PANEL_TITLE")}
          showDivider
          variant={panelVariant}
        >
          <UserProfileBasicsSection profile={profile} />
        </UserCenterSettingPanel>

        <UserLinkedAccountsSection redirect={redirect} mode={props.mode} />

        <UserCenterSettingPanel
          title={t("ME_PROFILE_ACCOUNT_SECURITY_PANEL_TITLE")}
          showDivider
          variant={panelVariant}
        >
          <UserProfileAccountSecuritySection email={profile.email} redirect={redirect} />
        </UserCenterSettingPanel>

        <UserCenterSettingPanel
          title={t("ME_DANGER_PANEL_TITLE")}
          showDivider
          variant={panelVariant}
        >
          <UserDangerSection email={profile.email} redirect={redirect} />
        </UserCenterSettingPanel>
      </UserCenterSettingsSectionStack>
      {loading ? (
        <SpinnerOverlay
          className="rounded-none bg-background/70 backdrop-blur-sm"
          spinnerContainerClassName="rounded-md border-border/70 bg-card"
          label={t("ME_TAB_PROFILE")}
        />
      ) : null}
    </div>
  );
}

export function UserProfileView(props: UserProfileViewProps) {
  return <UserProfileViewContent mode={props.mode ?? "page"} />;
}
