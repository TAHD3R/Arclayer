import { createFileRoute } from "@tanstack/react-router";

import { GeneralSettingsView } from "@/pages/workspaces/settings/general/page";
import type { GeneralSettingsTabKey } from "@/types/settings-general";

export const Route = createFileRoute("/w/$workspaceId/settings/general/")({
  validateSearch: (search: Record<string, unknown>): { index?: GeneralSettingsTabKey } => {
    const indexRaw = typeof search.index === "string" ? search.index : undefined;
    if (indexRaw === "localization") return { index: indexRaw };
    return {};
  },
  component: GeneralSettingsRoutePage,
});

function GeneralSettingsRoutePage() {
  const { index } = Route.useSearch();
  return <GeneralSettingsView tab={index ?? "site"} searchIndex={index} />;
}
