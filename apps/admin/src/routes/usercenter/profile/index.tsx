import { createFileRoute } from "@tanstack/react-router";

import { UserCenterProfilePage } from "@/pages/usercenter/profile/page";

export const Route = createFileRoute("/usercenter/profile/")({
  staticData: { titleKey: "account:ME_TAB_PROFILE" },
  component: UserCenterProfilePage,
});
