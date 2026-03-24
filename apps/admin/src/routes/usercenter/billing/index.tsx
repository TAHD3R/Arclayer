import { createFileRoute } from "@tanstack/react-router";

import { UserCenterBillingPage } from "@/pages/usercenter/billing/page";

export const Route = createFileRoute("/usercenter/billing/")({
  staticData: { titleKey: "account:ACCOUNT_PAGE_BILLING_TITLE" },
  component: UserCenterBillingPage,
});
