import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import * as authApi from "@/api/auth";
import { DefaultPage } from "@/components/common/default-page";
import { normalizeUserProfile } from "@/lib/auth/user-profile";
import { AccountSettingsStateCard } from "@/pages/account/shared/account-settings-state-card";
import { MeProfileDangerSection } from "@/pages/me/profile/components/profile-danger-section";
import { useAuthStore } from "@/stores/use-auth-store";
import { CircleAlert, ShieldX } from "lucide-react";

export function AccountDangerPage() {
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

  return (
    <DefaultPage
      title={t("ACCOUNT_PAGE_DANGER_TITLE")}
      description={t("ACCOUNT_PAGE_DANGER_DESC")}
      showFavoriteToggle={false}
    >
      <div className="mb-4 grid gap-4 xl:grid-cols-2">
        <AccountSettingsStateCard
          eyebrow={t("ACCOUNT_PAGE_DANGER_TITLE")}
          title={t("ACCOUNT_DANGER_ACCOUNT_TITLE")}
          description={t("ACCOUNT_DANGER_ACCOUNT_DESC")}
          icon={<CircleAlert />}
          tone="warning"
        />
        <AccountSettingsStateCard
          eyebrow={t("ACCOUNT_NAV_WORKSPACES")}
          title={t("ACCOUNT_DANGER_WORKSPACE_TITLE")}
          description={t("ACCOUNT_DANGER_WORKSPACE_DESC")}
          icon={<ShieldX />}
        />
      </div>
      <MeProfileDangerSection email={profile.email} redirect={redirect} />
    </DefaultPage>
  );
}
