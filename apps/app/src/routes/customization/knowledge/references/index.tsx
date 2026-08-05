import { createFileRoute } from "@tanstack/react-router";

import { ReusableReferencesPage } from "@/pages/workspaces/settings/workspace/knowledge/reusable-references-page";

export const Route = createFileRoute("/customization/knowledge/references/")({
  staticData: { titleKey: "knowledge:REFERENCES_DIRECTORY_TITLE" },
  component: ReusableReferencesPage,
});
