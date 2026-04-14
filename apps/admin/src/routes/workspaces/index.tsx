import { createFileRoute } from "@tanstack/react-router";

import { WorkspacesPage } from "@/pages/usercenter/workspaces/page";

type WorkspacesSearch = {
  create?: "1";
};

export const Route = createFileRoute("/workspaces/")({
  validateSearch: (search: Record<string, unknown>): WorkspacesSearch => {
    const next: WorkspacesSearch = {};
    if (search.create === "1") next.create = "1";
    return next;
  },
  staticData: { titleKey: "account:ACCOUNT_PAGE_WORKSPACES_TITLE" },
  component: WorkspacesPage,
});
