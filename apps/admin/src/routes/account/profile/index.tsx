import { createFileRoute } from "@tanstack/react-router";

import { AccountProfilePage } from "@/pages/account/profile/page";

export const Route = createFileRoute("/account/profile/")({
  staticData: { titleKey: "account:ME_TAB_PROFILE" },
  component: AccountProfilePage,
});
