import { createFileRoute } from "@tanstack/react-router";

import { UserCenterDangerPage } from "@/pages/usercenter/danger/page";

export const Route = createFileRoute("/usercenter/danger/")({
  staticData: { titleKey: "account:ACCOUNT_PAGE_DANGER_TITLE" },
  component: UserCenterDangerPage,
});
