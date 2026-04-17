import { createFileRoute } from "@tanstack/react-router";

import { UserCenterAppearancePage } from "@/pages/usercenter/appearance/page";

export const Route = createFileRoute("/settings/personal/preferences/")({
  staticData: { titleKey: "account:ME_TAB_PREFERENCES" },
  component: UserCenterAppearancePage,
});
