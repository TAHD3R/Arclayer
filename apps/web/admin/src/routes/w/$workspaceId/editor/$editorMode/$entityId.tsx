import { createFileRoute } from "@tanstack/react-router";

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
});
