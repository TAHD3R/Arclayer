import { createFileRoute } from "@tanstack/react-router";

import { AccountWorkspacesPage } from "@/pages/account/workspaces/page";

export const Route = createFileRoute("/account/workspaces/")({
  validateSearch: (search: Record<string, unknown>) => ({
    create: search.create === "1" ? "1" : undefined,
  }),
  staticData: { titleKey: "account:ACCOUNT_PAGE_WORKSPACES_TITLE" },
  component: AccountWorkspacesPage,
});
