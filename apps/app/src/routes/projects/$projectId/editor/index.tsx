import { createFileRoute } from "@tanstack/react-router";

import { parseProjectEditorSearch } from "@/pages/projects/editor/editor-deep-link";

export const Route = createFileRoute("/projects/$projectId/editor/")({
  staticData: { titleKey: "nav:NAV_PROJECT_EDITOR" },
  validateSearch: parseProjectEditorSearch,
});
