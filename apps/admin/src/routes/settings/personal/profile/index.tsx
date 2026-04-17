import { createFileRoute } from "@tanstack/react-router";

import { UserCenterProfilePage } from "@/pages/usercenter/profile/page";

export const Route = createFileRoute("/settings/personal/profile/")({
  staticData: { titleKey: "account:ME_TAB_PROFILE" },
  component: UserCenterProfilePage,
});
