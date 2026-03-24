import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import * as authApi from "@/api/auth";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { normalizeUserProfile } from "@/lib/auth/user-profile";
import { UserCenterStateCard } from "@/pages/usercenter/shared/account-settings-state-card";
import { UserDangerSection } from "@/pages/usercenter/profile/components/profile-danger-section";
import { useAuthStore } from "@/stores/use-auth-store";
import { CircleAlert, ShieldX } from "@arclayer/ui/icons/lucide-animated";

export function UserCenterDangerPage() {
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
        <UserCenterStateCard
          eyebrow={t("ACCOUNT_PAGE_DANGER_TITLE")}
          title={t("ACCOUNT_DANGER_ACCOUNT_TITLE")}
          description={t("ACCOUNT_DANGER_ACCOUNT_DESC")}
          icon={<CircleAlert />}
          tone="warning"
        />
        <UserCenterStateCard
          eyebrow={t("ACCOUNT_NAV_WORKSPACES")}
          title={t("ACCOUNT_DANGER_WORKSPACE_TITLE")}
          description={t("ACCOUNT_DANGER_WORKSPACE_DESC")}
          icon={<ShieldX />}
        />
      </div>
      <UserDangerSection email={profile.email} redirect={redirect} />
    </DefaultPage>
  );
}
