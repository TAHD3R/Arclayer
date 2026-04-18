import { createFileRoute } from "@tanstack/react-router";

import { WorkspacesPage } from "@/pages/usercenter/workspaces/page";

type ProjectsSearch = {
  create?: "1";
};

export const Route = createFileRoute("/projects/")({
  validateSearch: (search: Record<string, unknown>): ProjectsSearch => {
    const next: ProjectsSearch = {};
    if (search.create === "1") next.create = "1";
    return next;
  },
  staticData: { titleKey: "account:ACCOUNT_PAGE_PROJECTS_TITLE" },
  component: WorkspacesPage,
});
