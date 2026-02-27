import { createFileRoute } from "@tanstack/react-router";

import { WorkspaceSettingsView } from "@/pages/workspaces/settings/workspace/page";
import type { WorkspaceSettingsTabKey } from "@/types/settings-workspace";

export const Route = createFileRoute("/w/$workspaceId/settings/workspace/")({
  validateSearch: (search: Record<string, unknown>): { index?: WorkspaceSettingsTabKey } => {
    const indexRaw = typeof search.index === "string" ? search.index : undefined;
    if (
      indexRaw === "collaboration" ||
      indexRaw === "content_strategy" ||
      indexRaw === "integrations" ||
      indexRaw === "resource_processing" ||
      indexRaw === "danger"
    ) {
      return { index: indexRaw };
    }
    return {};
  },
  component: WorkspaceSettingsRoutePage,
});

function WorkspaceSettingsRoutePage() {
  const { index } = Route.useSearch();
  return <WorkspaceSettingsView tab={index ?? "basics"} searchIndex={index} />;
}
