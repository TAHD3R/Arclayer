import { useState } from "react";
import { useTranslation } from "react-i18next";

import { UserChangeEmailDialog } from "@/pages/usercenter/profile/components/profile-change-email-dialog";
import { UserPasswordSection } from "@/pages/usercenter/profile/components/profile-password-section";
import { UserSessionsSection } from "@/pages/usercenter/security/components/security-sessions-section";
import { UserTwoFactorSection } from "@/pages/usercenter/security/components/security-two-factor-section";
import { SettingCard, SettingCardHeader } from "@arclayer/ui/setting-card";
import { Button } from "@arclayer/ui/button";

export type UserProfileAccountSecuritySectionProps = {
  email: string | null;
  redirect: string;
};

export function UserProfileAccountSecuritySection(props: UserProfileAccountSecuritySectionProps) {
  const { t } = useTranslation(["account"]);
  const [changeEmailOpen, setChangeEmailOpen] = useState(false);

  return (
    <>
      <div className="flex flex-col gap-6">
        <SettingCard>
          <SettingCardHeader
            title={t("account:ME_PROFILE_EMAIL_TITLE")}
            description={props.email ?? "-"}
            action={
              <Button variant="outline" onClick={() => setChangeEmailOpen(true)}>
                {t("account:ME_PROFILE_EMAIL_CHANGE")}
              </Button>
            }
          />
        </SettingCard>

        <UserPasswordSection redirect={props.redirect} />
        <UserTwoFactorSection />
        <UserSessionsSection />
      </div>

      <UserChangeEmailDialog
        open={changeEmailOpen}
        onOpenChange={setChangeEmailOpen}
        nextEmail={props.email ?? ""}
        redirect={props.redirect}
      />
    </>
  );
}
