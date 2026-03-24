import { createFileRoute } from "@tanstack/react-router";

import { UserCenterUsagePage } from "@/pages/usercenter/usage/page";

export const Route = createFileRoute("/usercenter/usage/")({
  staticData: { titleKey: "account:ACCOUNT_PAGE_USAGE_TITLE" },
  component: UserCenterUsagePage,
});
