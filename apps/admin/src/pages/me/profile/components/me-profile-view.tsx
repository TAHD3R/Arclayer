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

type MeProfileViewProps = {
  mode?: "page" | "dialog";
  includeDanger?: boolean;
};

function MeProfileViewContent(props: Required<MeProfileViewProps>) {
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

  return (
    <MeSettingsCategoryLayout
      showNav={props.mode === "page"}
      categories={[
        {
          key: "profile",
          label: t("ME_PROFILE_PANEL_TITLE"),
          content: (
            <MeSettingPanel title={t("ME_PROFILE_PANEL_TITLE")} showDivider variant={panelVariant}>
              <MeProfileBasicsSection profile={profile} redirect={redirect} />
            </MeSettingPanel>
          ),
        },
        {
          key: "linked-accounts",
          label: t("ME_LINKED_ACCOUNTS_PANEL_TITLE"),
          content: (
            <MeSettingPanel
              title={t("ME_LINKED_ACCOUNTS_PANEL_TITLE")}
              showDivider
              variant={panelVariant}
            >
              <MeProfileLinkedAccountsSection redirect={redirect} />
            </MeSettingPanel>
          ),
        },
        ...(props.includeDanger
          ? [
              {
                key: "danger",
                label: t("ME_DANGER_PANEL_TITLE"),
                content: (
                  <MeSettingPanel
                    title={t("ME_DANGER_PANEL_TITLE")}
                    showDivider
                    variant={panelVariant}
                  >
                    <MeProfileDangerSection email={profile.email} redirect={redirect} />
                  </MeSettingPanel>
                ),
              },
            ]
          : []),
      ]}
    />
  );
}

export function MeProfileView(props: MeProfileViewProps) {
  return (
    <MeProfileViewContent mode={props.mode ?? "page"} includeDanger={props.includeDanger ?? true} />
  );
}
