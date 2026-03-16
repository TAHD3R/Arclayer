import { createFileRoute } from "@tanstack/react-router";

import { AccountSecurityPage } from "@/pages/account/security/page";

export const Route = createFileRoute("/account/security/")({
  staticData: { titleKey: "account:ME_TAB_SECURITY" },
  component: AccountSecurityPage,
});
