import { createFileRoute } from "@tanstack/react-router";

import type { GeneralSettingsTabKey } from "@/types/settings-general";

export const Route = createFileRoute("/w/$workspaceId/settings/general/")({
  validateSearch: (search: Record<string, unknown>): { index?: GeneralSettingsTabKey } => {
    const indexRaw = typeof search.index === "string" ? search.index : undefined;
    if (indexRaw === "localization") return { index: indexRaw };
    return {};
  },
});
