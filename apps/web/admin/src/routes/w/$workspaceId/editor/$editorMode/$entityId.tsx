import { createFileRoute } from "@tanstack/react-router";

import {
  type WorkspaceEditorMode,
  WorkspaceEditorView,
} from "@/pages/workspaces/editor/page";

type WorkspaceEditorSearch = {
  pathname?: string;
};

export const Route = createFileRoute("/w/$workspaceId/editor/$editorMode/$entityId")({
  validateSearch: (search: Record<string, unknown>): WorkspaceEditorSearch => {
    const pathname =
      typeof search.pathname === "string" && search.pathname.startsWith("/")
        ? search.pathname
        : undefined;

    return pathname ? { pathname } : {};
  },
  component: WorkspaceEditorRoute,
});

function WorkspaceEditorRoute() {
  const { workspaceId, editorMode, entityId } = Route.useParams();
  const { pathname } = Route.useSearch();

  const normalizedMode: WorkspaceEditorMode = editorMode === "article" ? "article" : "page";

  return (
    <WorkspaceEditorView
      workspaceId={workspaceId}
      editorMode={normalizedMode}
      entityId={entityId}
      initialPathname={pathname}
    />
  );
}
