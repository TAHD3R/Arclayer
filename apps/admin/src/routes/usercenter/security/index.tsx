import { createFileRoute } from "@tanstack/react-router";

import { UserCenterSecurityPage } from "@/pages/usercenter/security/page";

export const Route = createFileRoute("/usercenter/security/")({
  staticData: { titleKey: "account:ME_TAB_SECURITY" },
  component: UserCenterSecurityPage,
});
