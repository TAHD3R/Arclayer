import { createFileRoute } from "@tanstack/react-router";

import { AccountAppearancePage } from "@/pages/account/appearance/page";

export const Route = createFileRoute("/account/appearance/")({
  staticData: { titleKey: "account:ME_TAB_PREFERENCES" },
  component: AccountAppearancePage,
});
