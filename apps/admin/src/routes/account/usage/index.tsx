import { createFileRoute } from "@tanstack/react-router";

import { AccountUsagePage } from "@/pages/account/usage/page";

export const Route = createFileRoute("/account/usage/")({
  staticData: { titleKey: "account:ACCOUNT_PAGE_USAGE_TITLE" },
  component: AccountUsagePage,
});
