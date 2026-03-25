import { createFileRoute } from "@tanstack/react-router";

import {
  parseContentLibraryViewState,
  serializeContentLibraryViewState,
} from "@/pages/workspaces/content/library/utils";

type WorkspaceContentLibrarySearch = {
  view?: string;
  focusItemId?: string;
};

export const Route = createFileRoute("/w/$workspaceId/content/library/")({
  validateSearch: (search: Record<string, unknown>): WorkspaceContentLibrarySearch => {
    const view =
      typeof search.view === "string" && search.view.trim()
        ? serializeContentLibraryViewState(parseContentLibraryViewState(search.view))
        : undefined;

    const focusItemId =
      typeof search.focusItemId === "string" && search.focusItemId.trim()
        ? search.focusItemId.trim()
        : undefined;

    return {
      ...(view ? { view } : {}),
      ...(focusItemId ? { focusItemId } : {}),
    };
  },
  staticData: { titleKey: "nav:NAV_CONTENT_LIBRARY" },
});
