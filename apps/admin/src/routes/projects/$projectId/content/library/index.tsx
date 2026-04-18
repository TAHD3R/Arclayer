import { createFileRoute } from "@tanstack/react-router";

import {
  parseContentLibraryViewState,
  serializeContentLibraryViewState,
} from "@/pages/workspaces/content/library/utils";

type ProjectContentLibrarySearch = {
  view?: string;
  focusItemId?: string;
  create?: "1";
};

export const Route = createFileRoute("/projects/$projectId/content/library/")({
  validateSearch: (search: Record<string, unknown>): ProjectContentLibrarySearch => {
    const view =
      typeof search.view === "string" && search.view.trim()
        ? serializeContentLibraryViewState(parseContentLibraryViewState(search.view))
        : undefined;
    const focusItemId =
      typeof search.focusItemId === "string" && search.focusItemId.trim()
        ? search.focusItemId.trim()
        : undefined;
    const create = search.create === "1" ? "1" : undefined;

    return {
      ...(view ? { view } : {}),
      ...(focusItemId ? { focusItemId } : {}),
      ...(create ? { create } : {}),
    };
  },
  staticData: { titleKey: "nav:NAV_CONTENT_LIBRARY" },
});
