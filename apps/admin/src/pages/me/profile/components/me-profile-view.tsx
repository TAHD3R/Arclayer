import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import * as authApi from "@/api/auth";
import { normalizeUserProfile } from "@/lib/auth/user-profile";
import { MeSettingPanel } from "@/pages/me/components/me-setting-panel";
import { MeSettingsCategoryLayout } from "@/pages/me/components/me-settings-category-layout";
import { MeProfileBasicsSection } from "@/pages/me/profile/components/profile-basics-section";
import { MeProfileDangerSection } from "@/pages/me/profile/components/profile-danger-section";
import { MeProfileLinkedAccountsSection } from "@/pages/me/profile/components/profile-linked-accounts-section";
import { useAuthStore } from "@/stores/use-auth-store";

function getSearchParam(searchStr: string, key: string): string | null {
  const raw = String(searchStr || "");
  if (!raw) return null;
  const m = raw.match(new RegExp(`[?&]${key}=([^&]+)`));
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

export function MeProfileView() {
  const { t } = useTranslation("account");
  const accessToken = useAuthStore((s) => s.accessToken);
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });

  const meQuery = useQuery({
    queryKey: ["auth", "me", sessionVersion],
    enabled: Boolean(accessToken),
    queryFn: async () => authApi.me(),
    meta: { silent: true },
  });

  const profile = useMemo(() => normalizeUserProfile(meQuery.data), [meQuery.data]);
  const userId = (meQuery.data as { id?: string } | undefined)?.id ?? "-";

  const defaultCategoryKey = useMemo(() => {
    if (searchStr.includes("linked_provider=")) return "linked-accounts";
    const fromSearch = getSearchParam(searchStr, "category");
    return fromSearch || undefined;
  }, [searchStr]);

  const redirect = "/me/profile?category=linked-accounts";

  return (
    <MeSettingsCategoryLayout
      defaultCategoryKey={defaultCategoryKey}
      categories={[
        {
          key: "profile",
          label: t("ME_PROFILE_PANEL_TITLE"),
          content: (
            <MeSettingPanel title={t("ME_PROFILE_PANEL_TITLE")} showDivider>
              <MeProfileBasicsSection profile={profile} userId={userId} />
            </MeSettingPanel>
          ),
        },
        {
          key: "linked-accounts",
          label: t("ME_LINKED_ACCOUNTS_PANEL_TITLE"),
          content: (
            <MeSettingPanel title={t("ME_LINKED_ACCOUNTS_PANEL_TITLE")} showDivider>
              <MeProfileLinkedAccountsSection redirect={redirect} />
            </MeSettingPanel>
          ),
        },
        {
          key: "danger",
          label: t("ME_DANGER_PANEL_TITLE"),
          content: (
            <MeSettingPanel title={t("ME_DANGER_PANEL_TITLE")} showDivider>
              <MeProfileDangerSection email={profile.email} />
            </MeSettingPanel>
          ),
        },
      ]}
    />
  );
}
