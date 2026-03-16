import { createFileRoute } from "@tanstack/react-router";

import { AccountBillingPage } from "@/pages/account/billing/page";

export const Route = createFileRoute("/account/billing/")({
  staticData: { titleKey: "account:ACCOUNT_PAGE_BILLING_TITLE" },
  component: AccountBillingPage,
});
