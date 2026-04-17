import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import * as authApi from "@/api/auth";
import { useAuthStore } from "@/stores/use-auth-store";
import { UserChangeEmailDialog } from "@/pages/usercenter/profile/components/profile-change-email-dialog";
import { UserPasswordSection } from "@/pages/usercenter/profile/components/profile-password-section";
import {
  resolveHasLinkedOauthIdentities,
  resolveHasPassword,
} from "@/pages/usercenter/profile/components/security-capabilities";
import { UserTwoFactorSection } from "@/pages/usercenter/security/components/security-two-factor-section";
import { SettingCard, SettingCardHeader } from "@arclayer/ui/setting-card";
import { Button } from "@arclayer/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@arclayer/ui/tooltip";

export type UserProfileAccountSecuritySectionProps = {
  email: string | null;
  redirect: string;
};

export function UserProfileAccountSecuritySection(props: UserProfileAccountSecuritySectionProps) {
  const { t } = useTranslation(["account"]);
  const [changeEmailOpen, setChangeEmailOpen] = useState(false);
  const sessionVersion = useAuthStore((s) => s.sessionVersion);

  const capabilityQuery = useQuery({
    queryKey: ["auth", "security-capabilities", sessionVersion],
    queryFn: async () => authApi.getMySecurityCapabilities(),
    retry: false,
    staleTime: 60 * 1000,
    meta: { silent: true },
  });

  const hasPassword = resolveHasPassword(capabilityQuery.data);
  const hasLinkedOauthIdentities = resolveHasLinkedOauthIdentities(capabilityQuery.data);
  const emailChangeDisabled = hasLinkedOauthIdentities && !hasPassword;
  const emailChangeAction = (
    <Button
      variant="outline"
      disabled={emailChangeDisabled}
      onClick={() => setChangeEmailOpen(true)}
    >
      {t("account:ME_PROFILE_EMAIL_CHANGE")}
    </Button>
  );

  return (
    <>
      <div className="flex flex-col gap-6">
        <SettingCard>
          <SettingCardHeader
            title={t("account:ME_PROFILE_EMAIL_TITLE")}
            description={props.email ?? "-"}
            action={
              emailChangeDisabled ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild focusTrigger={false}>
                      <span>{emailChangeAction}</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      {t("account:ME_PROFILE_EMAIL_CHANGE_DISABLED_OAUTH")}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                emailChangeAction
              )
            }
          />
        </SettingCard>

        <UserPasswordSection redirect={props.redirect} />
        <UserTwoFactorSection redirect={props.redirect} />
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
