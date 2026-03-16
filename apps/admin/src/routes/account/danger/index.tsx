import { createFileRoute } from "@tanstack/react-router";

import { AccountDangerPage } from "@/pages/account/danger/page";

export const Route = createFileRoute("/account/danger/")({
  staticData: { titleKey: "account:ACCOUNT_PAGE_DANGER_TITLE" },
  component: AccountDangerPage,
});
